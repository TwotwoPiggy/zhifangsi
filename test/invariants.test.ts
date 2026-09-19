import { describe, expect, it } from 'vitest'
import {
  extractFrontmatter,
  parseSimpleYaml,
  inferConstraintsFromRules,
  parseInvariantFile,
} from '../src/invariants/parser.js'
import {
  matchPathGlob,
  checkInvariants,
  formatInvariantReport,
} from '../src/invariants/checker.js'
import { DependencyGraph } from '../src/ast/dependency-graph.js'
import { parseSourceFileAst } from '../src/ast/parser.js'
import type { InvariantDefinition } from '../src/invariants/types.js'
import { createZhifangsiMcpServer } from '../src/mcp/server.js'

describe('Invariants Parser & Frontmatter', () => {
  it('parses YAML frontmatter and extracts body accurately', () => {
    const md = `---
type: invariant
title: 状态单向流动与组件解耦
severity: error
rules:
  - "禁止在 UI 组件层直接发起底层网络/DB 读写"
  - "src/components/* 只能依赖 src/stores/*，严禁反向依赖"
affected_modules:
  - "[[modules/graph-renderer]]"
  - "[[modules/wiki-store]]"
constraints:
  - type: deny_import
    from: "src/components/**"
    disallowed:
      - "src/db/**"
      - "src/network/**"
---

# 架构规范背景说明
此处为正文内容，描述为何要解耦 UI 和底层 DB。`

    const def = parseInvariantFile('wiki/invariants/unidirectional-flow.md', md)

    expect(def.id).toBe('unidirectional-flow')
    expect(def.title).toBe('状态单向流动与组件解耦')
    expect(def.severity).toBe('error')
    expect(def.rules.length).toBe(2)
    expect(def.affected_modules).toContain('[[modules/graph-renderer]]')
    expect(def.content).toContain('此处为正文内容')

    // 显式声明的约束
    const denyConstraint = def.constraints.find((c) => c.type === 'deny_import' && c.from === 'src/components/**')
    expect(denyConstraint).toBeDefined()
    expect((denyConstraint as any).disallowed).toEqual(expect.arrayContaining(['src/db/**', 'src/network/**']))

    // 从 rules 智能推断的约束：反向依赖禁止
    const reverseConstraint = def.constraints.find(
      (c) => c.type === 'deny_import' && c.from === 'src/stores/*'
    )
    expect(reverseConstraint).toBeDefined()
    expect((reverseConstraint as any).disallowed).toEqual(['src/components/*'])
  })

  it('infers constraints from natural language rules', () => {
    const rules = [
      'deny: from src/ui/** to src/infra/**',
      '禁止在 src/views/** 中直接读写 src/db/**',
      'src/components/* 禁止导入 src/legacy/*',
      'src/actions/* 只能依赖 src/models/*，严禁反向依赖',
    ]

    const inferred = inferConstraintsFromRules(rules)
    expect(inferred.length).toBe(4)

    expect(inferred[0]).toEqual({
      type: 'deny_import',
      from: 'src/ui/**',
      disallowed: ['src/infra/**'],
      message: 'deny: from src/ui/** to src/infra/**',
    })

    expect(inferred[1]).toEqual({
      type: 'deny_import',
      from: 'src/views/**',
      disallowed: ['src/db/**'],
      message: '禁止在 src/views/** 中直接读写 src/db/**',
    })

    expect(inferred[2]).toEqual({
      type: 'deny_import',
      from: 'src/components/*',
      disallowed: ['src/legacy/*'],
      message: 'src/components/* 禁止导入 src/legacy/*',
    })

    expect(inferred[3]).toEqual({
      type: 'deny_import',
      from: 'src/models/*',
      disallowed: ['src/actions/*'],
      message: '严禁 src/models/* 反向依赖 src/actions/*',
    })
  })
})

describe('Glob Path Matching', () => {
  it('matches single and recursive wildcards', () => {
    expect(matchPathGlob('src/components/**', 'src/components/button.tsx')).toBe(true)
    expect(matchPathGlob('src/components/**', 'src/components/nested/icon.tsx')).toBe(true)
    expect(matchPathGlob('src/components/*', 'src/components/button.tsx')).toBe(true)
    expect(matchPathGlob('src/components/*', 'src/components/nested/icon.tsx')).toBe(false)
    expect(matchPathGlob('src/db/**', 'src/db/client.ts')).toBe(true)
    expect(matchPathGlob('src/db/**', 'src/stores/store.ts')).toBe(false)
  })

  it('handles Windows backslashes seamlessly', () => {
    expect(matchPathGlob('src/components/**', 'src\\components\\button.tsx')).toBe(true)
    expect(matchPathGlob('src/db/**', 'src\\db\\nested\\connection.ts')).toBe(true)
  })

  it('matches extension patterns across basenames', () => {
    expect(matchPathGlob('*.ts', 'src/utils/helper.ts')).toBe(true)
    expect(matchPathGlob('*.tsx', 'src/utils/helper.ts')).toBe(false)
  })
})

describe('Invariants Static Verification Engine', () => {
  it('detects deny_import violations with exact line numbers', () => {
    const fileUI = parseSourceFileAst(
      'src/components/UserProfile.tsx',
      `import React from 'react';\nimport { getUserStore } from '../stores/user';\nimport { queryDatabase } from '../db/connection';\n\nexport function UserProfile() {}`
    )
    const fileStore = parseSourceFileAst(
      'src/stores/user.ts',
      `export const getUserStore = () => {};`
    )
    const fileDB = parseSourceFileAst(
      'src/db/connection.ts',
      `export const queryDatabase = () => {};`
    )

    const graph = new DependencyGraph([fileUI, fileStore, fileDB])

    const invariants: InvariantDefinition[] = [
      {
        id: 'no-direct-db',
        type: 'invariant',
        title: '禁止 UI 层直连数据库',
        severity: 'error',
        rules: ['禁止在 UI 组件层直接发起底层 DB 读写'],
        constraints: [
          {
            type: 'deny_import',
            from: 'src/components/**',
            disallowed: ['src/db/**'],
            message: 'UI 组件禁止越权引用数据库层',
          },
        ],
      },
    ]

    const report = checkInvariants(invariants, graph)
    expect(report.passed).toBe(false)
    expect(report.totalViolations).toBe(1)
    expect(report.summary.errors).toBe(1)

    const violation = report.violations[0]
    expect(violation.invariantId).toBe('no-direct-db')
    expect(violation.sourceFile).toBe('src/components/UserProfile.tsx')
    expect(violation.line).toBe(3)
    expect(violation.targetImport).toBe('../db/connection')
    expect(violation.resolvedTarget).toBe('src/db/connection.ts')
    expect(violation.message).toContain('UI 组件禁止越权引用数据库层')
  })

  it('enforces allow_only whitelist constraints', () => {
    const fileA = parseSourceFileAst(
      'src/controllers/user.ts',
      `import { UserService } from '../services/user';\nimport { RenderView } from '../views/render';`
    )
    const fileService = parseSourceFileAst('src/services/user.ts', `export const UserService = {};`)
    const fileView = parseSourceFileAst('src/views/render.ts', `export const RenderView = {};`)

    const graph = new DependencyGraph([fileA, fileService, fileView])

    const invariants: InvariantDefinition[] = [
      {
        id: 'controller-deps',
        type: 'invariant',
        title: 'Controller 依赖范围限制',
        severity: 'warning',
        rules: ['Controller 只能依赖 services 与 models'],
        constraints: [
          {
            type: 'allow_only',
            from: 'src/controllers/**',
            allowed: ['src/services/**'],
            message: 'Controller 不得直接耦合 View 视图层',
          },
        ],
      },
    ]

    const report = checkInvariants(invariants, graph)
    expect(report.passed).toBe(true) // warning does not fail build
    expect(report.totalViolations).toBe(1)
    expect(report.summary.warnings).toBe(1)
    expect(report.violations[0].line).toBe(2)
    expect(report.violations[0].resolvedTarget).toBe('src/views/render.ts')
  })

  it('enforces isolated_module private boundary constraints', () => {
    const fileSecret = parseSourceFileAst('src/core/internal/crypto.ts', `export const secretKey = '123';`)
    const fileCallerAllowed = parseSourceFileAst(
      'src/core/auth.ts',
      `import { secretKey } from './internal/crypto';`
    )
    const fileCallerForbidden = parseSourceFileAst(
      'src/ui/login.ts',
      `import { secretKey } from '../core/internal/crypto';`
    )

    const graph = new DependencyGraph([fileSecret, fileCallerAllowed, fileCallerForbidden])

    const invariants: InvariantDefinition[] = [
      {
        id: 'isolate-crypto',
        type: 'invariant',
        title: '底层加密内部实现隔离',
        severity: 'error',
        rules: ['crypto 仅允许核心认证层调用'],
        constraints: [
          {
            type: 'isolated_module',
            module: 'src/core/internal/**',
            allowFrom: ['src/core/*'],
            message: '内部密码学实现禁止外泄至 UI 层',
          },
        ],
      },
    ]

    const report = checkInvariants(invariants, graph)
    expect(report.passed).toBe(false)
    expect(report.totalViolations).toBe(1)
    expect(report.violations[0].sourceFile).toBe('src/ui/login.ts')
  })

  it('produces formatted inspection report', () => {
    const fileUI = parseSourceFileAst(
      'src/components/UserProfile.tsx',
      `import { queryDB } from '../db/client';`
    )
    const fileDB = parseSourceFileAst('src/db/client.ts', `export const queryDB = () => {};`)
    const graph = new DependencyGraph([fileUI, fileDB])

    const invariants: InvariantDefinition[] = [
      {
        id: 'decoupling',
        type: 'invariant',
        title: '模块解耦规范',
        severity: 'error',
        rules: ['禁止组件层直连 DB'],
        constraints: [
          {
            type: 'deny_import',
            from: 'src/components/**',
            disallowed: ['src/db/**'],
          },
        ],
      },
    ]

    const report = checkInvariants(invariants, graph)
    const output = formatInvariantReport(report, { colored: false })

    expect(output).toContain('# 职方司 (Zhifangsi) - 关防守则与架构不变量巡检报告')
    expect(output).toContain('[错误 ERROR] 模块解耦规范 (`decoupling`)')
    expect(output).toContain('src/components/UserProfile.tsx:1')
  })
})

describe('MCP Server Integration - zhifangsi_check_invariants', () => {
  it('exposes zhifangsi_check_invariants tool and handles execution', async () => {
    const server = createZhifangsiMcpServer()
    expect(server).toBeDefined()

    // Query tools list via request handler
    const listHandler = (server as any)._requestHandlers.get('tools/list')
    expect(listHandler).toBeDefined()

    const toolsResult = await listHandler({ method: 'tools/list', params: {} }, {})
    const checkTool = toolsResult.tools.find((t: any) => t.name === 'zhifangsi_check_invariants')
    expect(checkTool).toBeDefined()
    expect(checkTool.description).toContain('架构关防守则')

    // Call tool on current workspace (no invariants currently created -> 0 violations)
    const callHandler = (server as any)._requestHandlers.get('tools/call')
    const result = await callHandler(
      {
        method: 'tools/call',
        params: {
          name: 'zhifangsi_check_invariants',
          arguments: { target_dir: process.cwd() },
        },
      },
      {}
    )

    expect(result.content.length).toBe(2)
    expect(result.content[0].text).toContain('职方司 (Zhifangsi)')
    const jsonPayload = JSON.parse(result.content[1].text)
    expect(jsonPayload.passed).toBe(true)
    expect(jsonPayload.totalViolations).toBe(0)
  })
})
