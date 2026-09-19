import * as fs from 'fs'
import * as path from 'path'
import type { DependencyGraph } from '../ast/dependency-graph.js'
import { parseInvariantFile } from './parser.js'
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
        // **/
        regexStr += '(?:.*/)?'
        i += 3
        continue
      } else {
        // **
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

  // 如果模式中不包含斜杠（如 *.ts），支持匹配文件名
  if (!normPattern.includes('/') && normPattern.includes('*')) {
    const base = path.basename(normPath)
    if (globToRegex(normPattern).test(base)) {
      return true
    }
  }

  // 快捷前缀匹配：如 src/components/** 或 src/components/*
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
 * 从工作区 wiki/invariants/ 目录加载所有关防守则
 */
export function loadInvariantsFromWorkspace(rootDir: string): InvariantDefinition[] {
  const invariantsDir = path.join(rootDir, 'wiki', 'invariants')
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

export interface CheckOptions {
  rootDir?: string
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

  let errors = 0
  let warnings = 0

  for (const file of allFiles) {
    const fromPath = file.filePath.replace(/\\/g, '/').replace(/^\.\//, '')

    for (const imp of file.imports) {
      const rawTarget = imp.rawSpecifier
      const resolvedTarget = imp.resolvedPath
        ? imp.resolvedPath.replace(/\\/g, '/').replace(/^\.\//, '')
        : undefined

      // 对比每一条激活的守则
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
                  violations.push({
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

                  if (inv.severity === 'error') errors++
                  else warnings++
                }
              }
            }
          }

          // 2. 仅允许导入约束 (allow_only)
          else if (constraint.type === 'allow_only') {
            if (matchPathGlob(constraint.from, fromPath)) {
              // 仅对内部相对依赖或解析成功的依赖实施白名单校验
              if (resolvedTarget) {
                const isAllowed = constraint.allowed.some((allowedPattern) =>
                  matchPathGlob(allowedPattern, resolvedTarget)
                )

                if (!isAllowed) {
                  violations.push({
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

                  if (inv.severity === 'error') errors++
                  else warnings++
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
                violations.push({
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

                if (inv.severity === 'error') errors++
                else warnings++
              }
            }
          }
        }
      }
    }
  }

  return {
    passed: errors === 0,
    totalInvariants: invariants.length,
    totalFilesChecked: allFiles.length,
    totalViolations: violations.length,
    violations,
    summary: {
      errors,
      warnings,
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
    return lines.join('\n')
  }

  if (report.passed && report.violations.length > 0) {
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

  return lines.join('\n')
}
