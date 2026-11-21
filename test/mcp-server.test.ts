import { describe, expect, it } from 'vitest'
import { createZhifangsiMcpServer } from '../src/mcp/server'
import { LLMWikiBridge } from '../src/bridge/client'
import {
  buildWorkspaceGraph,
  searchLocalWorkspace,
  generateNeighborhoodSkeleton,
  analyzeChangeImpact,
} from '../src/mcp/helpers'
import { parseSourceFileAst, resolveWorkspaceImport } from '../src/ast/parser'
import { DependencyGraph } from '../src/ast/dependency-graph'
import { checkInvariants } from '../src/invariants/checker'
import type { InvariantDefinition } from '../src/invariants/types'

describe('Zhifangsi MCP Server & Tools', () => {
  it('creates server with all 9 registered tools', async () => {
    const server = createZhifangsiMcpServer()
    expect(server).toBeDefined()

    const listHandler = (server as any)._requestHandlers.get('tools/list')
    const toolsResult = await listHandler({ method: 'tools/list', params: {} }, {})
    const toolNames = toolsResult.tools.map((t: any) => t.name)

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'zhifangsi_map',
        'zhifangsi_module_info',
        'zhifangsi_workflow_trace',
        'zhifangsi_search',
        'zhifangsi_bridge_status',
        'zhifangsi_check_invariants',
        'zhifangsi_skeleton',
        'zhifangsi_impact',
        'zhifangsi_bootstrap',
        'zhifangsi_repos',
      ])
    )
  })

  it('buildWorkspaceGraph correctly processes repository AST', () => {
    const graph = buildWorkspaceGraph(process.cwd())
    const analysis = graph.analyze()
    expect(analysis.nodeCount).toBeGreaterThan(0)
    expect(analysis.hubs.length).toBeGreaterThan(0)
  })

  it('handles bridge status tool when offline', async () => {
    const bridge = new LLMWikiBridge({ baseUrl: 'http://127.0.0.1:99999' }) // unreachable port
    const isOnline = await bridge.isAvailable()
    expect(isOnline).toBe(false)
  })

  it('resolves @/ path aliases, Python dotted packages, and Rust crate:: imports', () => {
    const allFiles = [
      'src/components/Button.tsx',
      'src/services/user.ts',
      'app/services/order.py',
      'src/models/account.rs',
    ]

    expect(resolveWorkspaceImport('src/components/Button.tsx', '@/services/user', allFiles)).toBe(
      'src/services/user.ts'
    )
    expect(resolveWorkspaceImport('app/main.py', 'app.services.order', allFiles)).toBe(
      'app/services/order.py'
    )
    expect(resolveWorkspaceImport('src/main.rs', 'crate::models::account::Account', allFiles)).toBe(
      'src/models/account.rs'
    )
  })

  it('detects circular dependencies in DependencyGraph and checkInvariants', () => {
    const fileA = parseSourceFileAst('src/a.ts', `import { b } from './b'; export const a = 1;`)
    const fileB = parseSourceFileAst('src/b.ts', `import { a } from './a'; export const b = 2;`)
    const graph = new DependencyGraph([fileA, fileB])

    const analysis = graph.analyze()
    expect(analysis.circularDependencies.length).toBe(1)
    expect(analysis.circularDependencies[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/a.ts'])

    const invariants: InvariantDefinition[] = [
      {
        id: 'no-cycles',
        type: 'invariant',
        title: '禁止循环依赖',
        severity: 'error',
        rules: ['禁止模块循环依赖'],
        constraints: [{ type: 'no_circular_dependency' }],
      },
    ]

    const report = checkInvariants(invariants, graph)
    expect(report.passed).toBe(false)
    expect(report.totalViolations).toBe(1)
  })

  it('supports draft status invariants without failing build', () => {
    const fileUI = parseSourceFileAst('src/ui/view.ts', `import { db } from '../db/client';`)
    const fileDB = parseSourceFileAst('src/db/client.ts', `export const db = {};`)
    const graph = new DependencyGraph([fileUI, fileDB])

    const invariants: InvariantDefinition[] = [
      {
        id: 'draft-rule',
        type: 'invariant',
        title: '草稿守则试运行',
        severity: 'error',
        status: 'draft',
        rules: ['试运行规则'],
        constraints: [{ type: 'deny_import', from: 'src/ui/**', disallowed: ['src/db/**'] }],
      },
    ]

    const report = checkInvariants(invariants, graph)
    expect(report.passed).toBe(true) // draft does not fail build
    expect(report.totalViolations).toBe(0)
    expect(report.draftViolations?.length).toBe(1)
    expect(report.summary.drafts).toBe(1)
  })

  it('resolves module topology and searchLocalWorkspace in standalone mode', () => {
    const graph = buildWorkspaceGraph(process.cwd())
    const astModuleFiles = graph.resolveModuleFiles('ast')
    expect(astModuleFiles.length).toBeGreaterThan(0)

    const dependents = graph.getModuleDependents(astModuleFiles)
    expect(dependents.length).toBeGreaterThan(0)

    const hits = searchLocalWorkspace(process.cwd(), 'DependencyGraph', graph)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].path).toContain('dependency-graph.ts')

    const skel = generateNeighborhoodSkeleton(process.cwd(), 'src/ast/dependency-graph.ts', graph, 1)
    expect(skel).toContain('Inline Target Skeletons')
    expect(skel).toContain('1-Hop Neighbors Export Signatures')

    const impact = analyzeChangeImpact(process.cwd(), ['src/ast/types.ts'], graph)
    expect(impact.directCallers.length).toBeGreaterThan(0)
    expect(impact.deepAffectedFiles.length).toBeGreaterThan(0)
  })
})
