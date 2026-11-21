import * as fs from 'fs'
import * as path from 'path'
import type { DependencyGraph } from '../ast/dependency-graph.js'
import { resolveStoragePaths, type StorageResolveOptions } from '../config/storage.js'
import { extractFrontmatter, parseInvariantFile } from './parser.js'
import type {
  InvariantCheckReport,
  InvariantDefinition,
  InvariantViolation,
} from './types.js'

/**
 * 转换 Glob 通配符为正则表达式
 */
export function globToRegex(glob: string): RegExp {
  const norm = glob.replace(/\\/g, '/').replace(/^\.\//, '')
  let regexStr = ''
  let i = 0

  while (i < norm.length) {
    const c = norm[i]
    if (c === '*' && norm[i + 1] === '*') {
      if (norm[i + 2] === '/') {
        regexStr += '(?:.*/)?'
        i += 3
        continue
      } else {
        regexStr += '.*'
        i += 2
        continue
      }
    } else if (c === '*') {
      regexStr += '[^/]*'
      i += 1
      continue
    } else if (c === '?') {
      regexStr += '[^/]'
      i += 1
      continue
    } else if ('./+^$(){}[]|\\'.includes(c)) {
      regexStr += '\\' + c
      i += 1
      continue
    } else {
      regexStr += c
      i += 1
    }
  }

  return new RegExp(`^${regexStr}$`)
}

/**
 * 跨平台路径 Glob 匹配
 */
export function matchPathGlob(pattern: string, filePath: string): boolean {
  if (!pattern || !filePath) return false

  const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const normPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '')

  if (!normPattern.includes('/') && normPattern.includes('*')) {
    const base = path.basename(normPath)
    if (globToRegex(normPattern).test(base)) {
      return true
    }
  }

  if (normPattern.endsWith('/**')) {
    const prefix = normPattern.slice(0, -3)
    if (normPath === prefix || normPath.startsWith(prefix + '/')) {
      return true
    }
  }

  const regex = globToRegex(normPattern)
  return regex.test(normPath)
}

/**
 * 从工作区（或外置知识库）的 wiki/invariants/ 目录加载所有关防守则
 */
export function loadInvariantsFromWorkspace(
  rootDir: string,
  options: StorageResolveOptions = {}
): InvariantDefinition[] {
  const storage = resolveStoragePaths(rootDir, options)
  const invariantsDir = path.join(storage.wikiDir, 'invariants')
  if (!fs.existsSync(invariantsDir)) {
    return []
  }

  const result: InvariantDefinition[] = []
  const files = fs.readdirSync(invariantsDir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const fullPath = path.join(invariantsDir, file)
    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      const def = parseInvariantFile(fullPath, content)
      result.push(def)
    } catch {
      // 忽略破损文件并继续
    }
  }

  return result
}

/**
 * 检查 wiki/modules/*.md 与真实 AST 代码之间的失真/漂移 (Wiki Drift Detection)
 */
export function checkWikiDrift(
  rootDir: string,
  graph: DependencyGraph,
  options: StorageResolveOptions = {}
): string[] {
  const warnings: string[] = []
  const storage = resolveStoragePaths(rootDir, options)
  const modulesDir = path.join(storage.wikiDir, 'modules')
  if (!fs.existsSync(modulesDir)) return warnings

  const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.md'))
  const allFileNodes = new Set(graph.getAllFiles().map((f) => f.filePath))

  for (const file of files) {
    const modName = file.replace(/\.md$/, '')
    const fullPath = path.join(modulesDir, file)
    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      const { data } = extractFrontmatter(content)

      // 1. 校验 path 或 entrypoints 是否在 AST 中存在匹配文件
      const declaredPath = typeof data.path === 'string' ? data.path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : ''
      const entrypoints: string[] = Array.isArray(data.entrypoints) ? data.entrypoints.map(String) : []

      if (declaredPath) {
        const matchedFiles = graph.resolveModuleFiles(declaredPath)
        if (matchedFiles.length === 0 && !fs.existsSync(path.join(rootDir, declaredPath))) {
          warnings.push(
            `[舆图失真] 模块档案 \`wiki/modules/${file}\` 声明的源码路径 \`${declaredPath}\` 在当前代码库中已不存在`
          )
        }
      }

      for (const ep of entrypoints) {
        const normEp = ep.replace(/\\/g, '/').replace(/^\.\//, '')
        if (normEp && !allFileNodes.has(normEp) && !fs.existsSync(path.join(rootDir, normEp))) {
          warnings.push(
            `[舆图失真] 模块 \`${modName}\` 声明的入口文件 \`${normEp}\` 在最新源码中不存在`
          )
        }
      }

      // 2. 校验声明的 exports 符号是否在模块源码中存在
      const declaredExports: string[] = Array.isArray(data.exports) ? data.exports.map(String) : []
      if (declaredExports.length > 0 && (declaredPath || entrypoints.length > 0)) {
        const modFiles = graph.resolveModuleFiles(declaredPath || modName, entrypoints)
        if (modFiles.length > 0) {
          const actualExportNames = new Set<string>()
          for (const mf of modFiles) {
            const info = graph.getFileInfo(mf)
            info?.exports.forEach((e) => actualExportNames.add(e.name))
          }
          for (const expName of declaredExports) {
            const cleanName = expName.split('(')[0].trim()
            if (cleanName && actualExportNames.size > 0 && !actualExportNames.has(cleanName)) {
              warnings.push(
                `[契约漂移] 模块 \`${modName}\` 档案声明导出 \`${cleanName}\`，但在源码 AST 导出中未找到该符号`
              )
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return warnings
}

export interface CheckOptions extends StorageResolveOptions {
  rootDir?: string
  checkDrift?: boolean
}

/**
 * 执行关防守则静态合规检查
 */
export function checkInvariants(
  invariants: InvariantDefinition[],
  graph: DependencyGraph,
  options: CheckOptions = {}
): InvariantCheckReport {
  const allFiles = graph.getAllFiles()
  const violations: InvariantViolation[] = []
  const draftViolations: InvariantViolation[] = []

  let errors = 0
  let warnings = 0
  let drafts = 0

  const recordViolation = (inv: InvariantDefinition, v: InvariantViolation) => {
    const isDraft = inv.status === 'draft'
    v.status = isDraft ? 'draft' : 'active'
    if (isDraft) {
      draftViolations.push(v)
      drafts++
    } else {
      violations.push(v)
      if (inv.severity === 'error') errors++
      else warnings++
    }
  }

  for (const file of allFiles) {
    const fromPath = file.filePath.replace(/\\/g, '/').replace(/^\.\//, '')

    for (const imp of file.imports) {
      const rawTarget = imp.rawSpecifier
      const resolvedTarget = imp.resolvedPath
        ? imp.resolvedPath.replace(/\\/g, '/').replace(/^\.\//, '')
        : undefined

      for (const inv of invariants) {
        for (const constraint of inv.constraints) {
          // 1. 禁止导入约束 (deny_import)
          if (constraint.type === 'deny_import') {
            if (matchPathGlob(constraint.from, fromPath)) {
              for (const disallowed of constraint.disallowed) {
                const targetMatches =
                  (resolvedTarget && matchPathGlob(disallowed, resolvedTarget)) ||
                  matchPathGlob(disallowed, rawTarget)

                if (targetMatches) {
                  recordViolation(inv, {
                    invariantId: inv.id,
                    invariantTitle: inv.title,
                    severity: inv.severity,
                    sourceFile: file.filePath,
                    targetImport: rawTarget,
                    resolvedTarget: imp.resolvedPath,
                    line: imp.line,
                    message: constraint.message || `禁止从 \`${fromPath}\` 导入 \`${disallowed}\``,
                    ruleDescription: inv.rules.join('; '),
                  })
                }
              }
            }
          }

          // 2. 仅允许导入约束 (allow_only)
          else if (constraint.type === 'allow_only') {
            if (matchPathGlob(constraint.from, fromPath)) {
              if (resolvedTarget) {
                const isAllowed = constraint.allowed.some((allowedPattern) =>
                  matchPathGlob(allowedPattern, resolvedTarget)
                )

                if (!isAllowed) {
                  recordViolation(inv, {
                    invariantId: inv.id,
                    invariantTitle: inv.title,
                    severity: inv.severity,
                    sourceFile: file.filePath,
                    targetImport: rawTarget,
                    resolvedTarget: imp.resolvedPath,
                    line: imp.line,
                    message:
                      constraint.message ||
                      `\`${fromPath}\` 越权引用 \`${resolvedTarget}\`，该模块仅允许依赖: ${constraint.allowed.join(', ')}`,
                    ruleDescription: inv.rules.join('; '),
                  })
                }
              }
            }
          }

          // 3. 私有模块隔离约束 (isolated_module)
          else if (constraint.type === 'isolated_module') {
            const isTargetIsolated =
              (resolvedTarget && matchPathGlob(constraint.module, resolvedTarget)) ||
              matchPathGlob(constraint.module, rawTarget)

            if (isTargetIsolated) {
              const isAllowedCaller = constraint.allowFrom.some((allowedCaller) =>
                matchPathGlob(allowedCaller, fromPath)
              )

              if (!isAllowedCaller) {
                recordViolation(inv, {
                  invariantId: inv.id,
                  invariantTitle: inv.title,
                  severity: inv.severity,
                  sourceFile: file.filePath,
                  targetImport: rawTarget,
                  resolvedTarget: imp.resolvedPath,
                  line: imp.line,
                  message:
                    constraint.message ||
                    `私有模块 \`${resolvedTarget || rawTarget}\` 仅允许被 [${constraint.allowFrom.join(', ')}] 引用，\`${fromPath}\` 越权调用`,
                  ruleDescription: inv.rules.join('; '),
                })
              }
            }
          }
        }
      }
    }
  }

  // 4. 循环依赖约束 (no_circular_dependency)
  const circularInvs = invariants.filter((inv) =>
    inv.constraints.some((c) => c.type === 'no_circular_dependency')
  )
  if (circularInvs.length > 0) {
    const cycles = graph.findCircularDependencies()
    for (const inv of circularInvs) {
      for (const constraint of inv.constraints) {
        if (constraint.type === 'no_circular_dependency') {
          const scope = constraint.scope || '**'
          for (const cycle of cycles) {
            if (cycle.some((node) => matchPathGlob(scope, node))) {
              recordViolation(inv, {
                invariantId: inv.id,
                invariantTitle: inv.title,
                severity: inv.severity,
                sourceFile: cycle[0],
                targetImport: cycle.join(' -> '),
                resolvedTarget: cycle[1],
                message: constraint.message || `检测到循环依赖环: ${cycle.join(' -> ')}`,
                ruleDescription: inv.rules.join('; '),
              })
            }
          }
        }
      }
    }
  }

  const driftWarnings =
    options.rootDir && options.checkDrift !== false
      ? checkWikiDrift(options.rootDir, graph, options)
      : []

  return {
    passed: errors === 0,
    totalInvariants: invariants.length,
    totalFilesChecked: allFiles.length,
    totalViolations: violations.length,
    violations,
    draftViolations,
    driftWarnings,
    summary: {
      errors,
      warnings,
      drafts,
      drifts: driftWarnings.length,
    },
  }
}

/**
 * 格式化关防守则合规报告
 */
export function formatInvariantReport(
  report: InvariantCheckReport,
  options: { colored?: boolean } = {}
): string {
  const colored = options.colored ?? false
  const lines: string[] = []

  const cRed = colored ? '\x1b[31m' : ''
  const cGreen = colored ? '\x1b[32m' : ''
  const cYellow = colored ? '\x1b[33m' : ''
  const cCyan = colored ? '\x1b[36m' : ''
  const cBold = colored ? '\x1b[1m' : ''
  const cReset = colored ? '\x1b[0m' : ''

  lines.push(`${cBold}# 职方司 (Zhifangsi) - 关防守则与架构不变量巡检报告${cReset}`)
  lines.push(
    `> 生效守则数: ${report.totalInvariants} | 校验文件数: ${report.totalFilesChecked} | 违规总数: ${report.totalViolations} (错误: ${report.summary.errors}, 告警: ${report.summary.warnings})\n`
  )

  if (report.passed && report.violations.length === 0) {
    lines.push(`${cGreen}✔ 关防守则巡检全通！未检测到任何架构越权或分层违背。${cReset}`)
  } else if (report.passed && report.violations.length > 0) {
    lines.push(
      `${cYellow}⚠ 关防巡检通过，但存在 ${report.summary.warnings} 处架构警告，建议关注优化：${cReset}\n`
    )
  } else {
    lines.push(
      `${cRed}✖ 关防巡检未通过！发现 ${report.summary.errors} 处架构阻断级错误：${cReset}\n`
    )
  }

  report.violations.forEach((v, idx) => {
    const badge =
      v.severity === 'error' ? `${cRed}[错误 ERROR]${cReset}` : `${cYellow}[告警 WARN]${cReset}`
    const loc = v.line ? `:${v.line}` : ''

    lines.push(`${idx + 1}. ${badge} ${cBold}${v.invariantTitle}${cReset} (\`${v.invariantId}\`)`)
    lines.push(`   - 违规位置: \`${v.sourceFile}${loc}\``)
    lines.push(
      `   - 越权依赖: \`${v.targetImport}\`${v.resolvedTarget ? ` -> \`${v.resolvedTarget}\`` : ''}`
    )
    lines.push(`   - 违规详情: ${v.message}`)
    if (v.ruleDescription) {
      lines.push(`   - 规约说明: ${v.ruleDescription}`)
    }
    lines.push('')
  })

  if (report.draftViolations && report.draftViolations.length > 0) {
    lines.push(`\n${cCyan}## 候选草稿守则试运行统计 (status: draft，不阻断构建)${cReset}`)
    report.draftViolations.forEach((v, idx) => {
      const loc = v.line ? `:${v.line}` : ''
      lines.push(
        `${idx + 1}. ${cCyan}[草稿试运行 DRAFT]${cReset} ${cBold}${v.invariantTitle}${cReset} (\`${v.invariantId}\`): \`${v.sourceFile}${loc}\` -> \`${v.targetImport}\` (${v.message})`
      )
    })
  }

  if (report.driftWarnings && report.driftWarnings.length > 0) {
    lines.push(`\n${cYellow}## 舆图与代码契约漂移预警 (Wiki Drift Check)${cReset}`)
    report.driftWarnings.forEach((w) => {
      lines.push(`- ${cYellow}${w}${cReset}`)
    })
  }

  return lines.join('\n')
}
