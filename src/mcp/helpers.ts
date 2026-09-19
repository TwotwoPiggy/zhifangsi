import * as fs from 'fs'
import * as path from 'path'
import { parseSourceFileAst } from '../ast/parser.js'
import { DependencyGraph } from '../ast/dependency-graph.js'
import type { FileAstInfo } from '../ast/types.js'
import { shouldIgnorePath } from '../ast/skeletonizer.js'
import { loadInvariantsFromWorkspace, checkInvariants } from '../invariants/checker.js'

/**
 * Recursively scans directory for code files and builds an AST DependencyGraph
 */
export function buildWorkspaceGraph(rootDir: string): DependencyGraph {
  const fileInfos: FileAstInfo[] = []

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/')

      if (shouldIgnorePath(relPath)) continue

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            const ast = parseSourceFileAst(relPath, content)
            fileInfos.push(ast)
          } catch {
            // ignore unreadable files
          }
        }
      }
    }
  }

  walk(rootDir)
  return new DependencyGraph(fileInfos)
}

/**
 * Format a comprehensive codebase map for AI Agents
 */
export function formatZhifangsiMap(rootDir: string, graph: DependencyGraph, bridgeOnline: boolean): string {
  const analysis = graph.analyze()
  const lines: string[] = []

  lines.push('# 职方司 (Zhifangsi) - 代码库战略舆图')
  lines.push(`> 根目录: \`${rootDir}\` | 节点数: ${analysis.nodeCount} | 依赖边数: ${analysis.edgeCount} | LLM Wiki 桥接: ${bridgeOnline ? '已连接 (127.0.0.1:19828)' : '独立离线模式'}\n`)

  lines.push('## 1. 核心枢纽关隘 (Top Architectural Hubs by PageRank)')
  const topHubs = analysis.hubs.slice(0, 8)
  if (topHubs.length === 0) {
    lines.push('*未检测到高耦合核心文件*')
  } else {
    for (const hub of topHubs) {
      lines.push(`- **\`${hub.filePath}\`** (PageRank: ${(hub.score * 100).toFixed(2)}%, 入度: ${hub.inDegree}, 出度: ${hub.outDegree})`)
    }
  }

  // Scan wiki/modules if present
  const wikiDir = path.join(rootDir, 'wiki')
  const modulesDir = path.join(wikiDir, 'modules')
  if (fs.existsSync(modulesDir)) {
    lines.push('\n## 2. 注册架构模块 (wiki/modules/)')
    const files = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.md'))
    for (const f of files) {
      lines.push(`- [[modules/${f.replace(/\.md$/, '')}]]`)
    }
  }

  // Scan wiki/workflows if present
  const workflowsDir = path.join(wikiDir, 'workflows')
  if (fs.existsSync(workflowsDir)) {
    lines.push('\n## 3. 核心业务流水线 (wiki/workflows/)')
    const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.md'))
    for (const f of files) {
      lines.push(`- [[workflows/${f.replace(/\.md$/, '')}]]`)
    }
  }

  // Scan wiki/invariants if present
  const invariantsDir = path.join(wikiDir, 'invariants')
  if (fs.existsSync(invariantsDir)) {
    lines.push('\n## 4. 架构关防守则 (wiki/invariants/)')
    const files = fs.readdirSync(invariantsDir).filter((f) => f.endsWith('.md'))
    for (const f of files) {
      lines.push(`- [[invariants/${f.replace(/\.md$/, '')}]]`)
    }
    const invariants = loadInvariantsFromWorkspace(rootDir)
    if (invariants.length > 0) {
      const report = checkInvariants(invariants, graph, { rootDir })
      lines.push(`> 关防合规状态: ${report.passed ? '全部合规 ✔' : `发现 ${report.totalViolations} 处违规 ✖`}`)
    }
  }

  return lines.join('\n')
}
