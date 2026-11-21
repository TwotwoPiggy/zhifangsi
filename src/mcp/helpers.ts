import * as fs from 'fs'
import * as path from 'path'
import { parseSourceFileAst } from '../ast/parser.js'
import { DependencyGraph } from '../ast/dependency-graph.js'
import type { FileAstInfo } from '../ast/types.js'
import { createModuleSkeleton, shouldIgnorePath } from '../ast/skeletonizer.js'
import { loadInvariantsFromWorkspace, checkInvariants, matchPathGlob } from '../invariants/checker.js'
import { extractFrontmatter } from '../invariants/parser.js'
import { resolveStoragePaths, type StorageResolveOptions } from '../config/storage.js'

/**
 * Load path aliases from tsconfig.json if present (e.g., "@/*": ["src/*"])
 */
export function loadTsConfigAliases(rootDir: string): Record<string, string> {
  const aliases: Record<string, string> = {}
  const tsconfigPath = path.join(rootDir, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) return aliases

  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf-8')
    // Strip single-line comments before parsing JSON
    const cleaned = raw.replace(/^\s*\/\/.*$/gm, '')
    const parsed = JSON.parse(cleaned)
    const paths = parsed?.compilerOptions?.paths
    const baseUrl = (parsed?.compilerOptions?.baseUrl || '').replace(/^\.\//, '').replace(/\/$/, '')

    if (paths && typeof paths === 'object') {
      for (const [key, targets] of Object.entries(paths)) {
        if (Array.isArray(targets) && targets.length > 0 && typeof targets[0] === 'string') {
          const cleanKey = key.replace(/\*$/, '')
          let cleanTarget = targets[0].replace(/^\.\//, '').replace(/\*$/, '')
          if (baseUrl && baseUrl !== '.' && !cleanTarget.startsWith(baseUrl)) {
            cleanTarget = `${baseUrl}/${cleanTarget}`
          }
          if (cleanKey) {
            aliases[cleanKey] = cleanTarget
          }
        }
      }
    }
  } catch {
    // ignore malformed tsconfig
  }

  return aliases
}

/**
 * Recursively scans directory for code files and builds an AST DependencyGraph
 */
export function buildWorkspaceGraph(rootDir: string): DependencyGraph {
  const fileInfos: FileAstInfo[] = []
  const aliasMap = loadTsConfigAliases(rootDir)

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
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.cs'].includes(ext)) {
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
  return new DependencyGraph(fileInfos, aliasMap)
}

/**
 * Format a comprehensive codebase map for AI Agents
 */
export function formatZhifangsiMap(
  rootDir: string,
  graph: DependencyGraph,
  bridgeOnline: boolean,
  storageOptions: StorageResolveOptions = {}
): string {
  const analysis = graph.analyze()
  const storage = resolveStoragePaths(rootDir, storageOptions)
  const lines: string[] = []

  const storageLabel =
    storage.mode === 'local'
      ? `原位 (\`${storage.wikiDir}\`)`
      : `${storage.mode === 'centralized' ? '集中外置' : '自定义外置'} (\`${storage.wikiDir}\`)`

  lines.push('# 职方司 (Zhifangsi) - 代码库战略舆图')
  lines.push(
    `> 根目录: \`${storage.repoRoot}\` | 知识库: ${storageLabel} | 节点数: ${analysis.nodeCount} | 依赖边数: ${analysis.edgeCount} | LLM Wiki 桥接: ${bridgeOnline ? '已连接 (127.0.0.1:19828)' : '独立离线模式'}\n`
  )

  lines.push('## 1. 核心枢纽关隘 (Top Architectural Hubs by PageRank)')
  const topHubs = analysis.hubs.slice(0, 8)
  if (topHubs.length === 0) {
    lines.push('*未检测到高耦合核心文件*')
  } else {
    for (const hub of topHubs) {
      lines.push(`- **\`${hub.filePath}\`** (PageRank: ${(hub.score * 100).toFixed(2)}%, 入度: ${hub.inDegree}, 出度: ${hub.outDegree})`)
    }
  }

  if (analysis.circularDependencies.length > 0) {
    lines.push('\n## ⚠ 循环依赖预警 (Circular Dependencies)')
    for (const cycle of analysis.circularDependencies.slice(0, 10)) {
      lines.push(`- \`${cycle.join(' -> ')}\``)
    }
  }

  // Scan wiki/modules if present
  const wikiDir = storage.wikiDir
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
    const invariants = loadInvariantsFromWorkspace(rootDir, { wikiDir })
    if (invariants.length > 0) {
      const report = checkInvariants(invariants, graph, { rootDir, wikiDir })
      lines.push(`> 关防合规状态: ${report.passed ? '全部合规 ✔' : `发现 ${report.totalViolations} 处违规 ✖`}`)
    }
  }

  return lines.join('\n')
}

export interface LocalSearchHit {
  kind: 'wiki' | 'symbol' | 'file'
  title: string
  path: string
  score: number
  snippet: string
}

/**
 * 单机独立模式 (Standalone Mode) 下的本地混合检索：同时检索 wiki/**\/*.md 与 AST 符号表
 */
export function searchLocalWorkspace(
  rootDir: string,
  query: string,
  graph: DependencyGraph,
  storageOptions: StorageResolveOptions = {}
): LocalSearchHit[] {
  const hits: LocalSearchHit[] = []
  const terms = query
    .toLowerCase()
    .split(/[\s,.;/|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (terms.length === 0) return hits

  // 1. Search wiki/**/*.md documents
  const storage = resolveStoragePaths(rootDir, storageOptions)
  const wikiDir = storage.wikiDir
  function walkWiki(dir: string) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkWiki(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const { data, body } = extractFrontmatter(content)
          const relPath =
            storage.mode === 'local'
              ? path.relative(storage.repoRoot, fullPath).replace(/\\/g, '/')
              : `wiki/${path.relative(wikiDir, fullPath).replace(/\\/g, '/')}`
          const title = String(data.title || entry.name.replace(/\.md$/, ''))
          const lowerTitle = title.toLowerCase()
          const lowerBody = body.toLowerCase()
          const lowerPath = relPath.toLowerCase()

          let score = 0
          for (const term of terms) {
            if (lowerTitle.includes(term)) score += 10
            if (lowerPath.includes(term)) score += 6
            if (lowerBody.includes(term)) score += 3
          }

          if (score > 0) {
            const firstMatchLine =
              body
                .split(/\r?\n/)
                .find((l) => terms.some((t) => l.toLowerCase().includes(t)))
                ?.trim() || body.slice(0, 120).replace(/\r?\n/g, ' ')
            hits.push({
              kind: 'wiki',
              title: `[Wiki] ${title}`,
              path: relPath,
              score,
              snippet: firstMatchLine.slice(0, 160),
            })
          }
        } catch {
          // ignore
        }
      }
    }
  }
  walkWiki(wikiDir)

  // 2. Search AST files and exported symbols
  for (const fileInfo of graph.getAllFiles()) {
    const lowerFile = fileInfo.filePath.toLowerCase()
    let fileScore = 0
    for (const term of terms) {
      if (lowerFile.includes(term)) fileScore += 5
    }

    const matchedSymbols: string[] = []
    for (const sym of fileInfo.exports) {
      const lowerSym = sym.name.toLowerCase()
      const lowerSig = sym.signature.toLowerCase()
      for (const term of terms) {
        if (lowerSym === term) {
          fileScore += 12
          matchedSymbols.push(sym.signature)
        } else if (lowerSym.includes(term) || lowerSig.includes(term)) {
          fileScore += 6
          matchedSymbols.push(sym.signature)
        }
      }
    }

    if (fileScore > 0) {
      hits.push({
        kind: matchedSymbols.length > 0 ? 'symbol' : 'file',
        title: `[源码] ${fileInfo.filePath}`,
        path: fileInfo.filePath,
        score: fileScore,
        snippet:
          matchedSymbols.length > 0
            ? `导出契约: ${matchedSymbols.slice(0, 4).join(' | ')}`
            : `源码文件 (${fileInfo.language}, 导出符号数: ${fileInfo.exports.length})`,
      })
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 15)
}

/**
 * 基于 Super-agent 局部性原理 (Inline & Spill) 提取目标文件或模块的局部邻域代码骨架
 */
export function generateNeighborhoodSkeleton(
  rootDir: string,
  target: string,
  graph: DependencyGraph,
  hops = 1,
  storageOptions: StorageResolveOptions = {}
): string {
  const targetFiles = graph.resolveModuleFiles(target)
  if (targetFiles.length === 0) {
    return `未在代码库中找到与 \`${target}\` 匹配的文件或模块。`
  }

  const pageRanks = graph.computePageRank()
  const invariants = loadInvariantsFromWorkspace(rootDir, storageOptions)
  const lines: string[] = []

  lines.push(`# 局部邻域代码骨架 (Inline & Spill Neighborhood Skeleton): \`${target}\``)
  lines.push(`> 匹配核心文件数: ${targetFiles.length} | 邻域展开跳数: ${hops}\n`)

  // 1. Applicable invariants (Inline active architectural constraints)
  const applicableInvs = invariants.filter((inv) =>
    inv.constraints.some((c) => {
      if (c.type === 'deny_import' || c.type === 'allow_only') {
        return targetFiles.some((tf) => matchPathGlob(c.from, tf))
      }
      if (c.type === 'isolated_module') {
        return targetFiles.some((tf) => matchPathGlob(c.module, tf))
      }
      return false
    })
  )

  if (applicableInvs.length > 0) {
    lines.push(`## 1. 生效关防守则约束 (Inline Invariants)`)
    for (const inv of applicableInvs) {
      lines.push(`- **[${inv.severity.toUpperCase()}] ${inv.title}** (\`${inv.id}\`): ${inv.rules.join('; ')}`)
    }
    lines.push('')
  }

  // 2. Inline target files full skeleton
  lines.push(`## 2. 目标核心代码骨架 (Inline Target Skeletons)`)
  for (const tf of targetFiles) {
    const fullPath = path.join(rootDir, tf)
    const info = graph.getFileInfo(tf)
    if (!fs.existsSync(fullPath) || !info) continue

    const content = fs.readFileSync(fullPath, 'utf-8')
    const skel = createModuleSkeleton(tf, content, info.language)
    const pr = ((pageRanks.get(tf) || 0) * 100).toFixed(2)
    lines.push(`### \`${tf}\` (PageRank: ${pr}% | 压缩率: ${Math.round(skel.tokenSavingsRatio * 100)}%)`)
    lines.push('```' + info.language)
    lines.push(skel.skeleton)
    lines.push('```\n')
  }

  // 3. 1-hop direct neighbors (Inline exported signatures only)
  if (hops >= 1) {
    const directDeps = graph.getModuleDependencies(targetFiles)
    const directCallers = graph.getModuleDependents(targetFiles)
    const oneHopNeighbors = Array.from(new Set([...directDeps, ...directCallers]))

    if (oneHopNeighbors.length > 0) {
      lines.push(`## 3. 一跳直接邻居导出契约 (1-Hop Neighbors Export Signatures)`)
      for (const nb of oneHopNeighbors.slice(0, 15)) {
        const nbInfo = graph.getFileInfo(nb)
        const role = directDeps.includes(nb) && directCallers.includes(nb)
          ? '双向依赖'
          : directDeps.includes(nb)
            ? '下游被调方 (Dependency)'
            : '上游调用方 (Caller)'
        const sigs = nbInfo?.exports.map((e) => `\`${e.signature}\``).join(', ') || '*无显式导出*'
        lines.push(`- **\`${nb}\`** [${role}]: ${sigs}`)
      }
      lines.push('')
    }

    // 4. Spill 2+ hop deep dependents as pointers for Chain of Recall
    const deepDependents = graph.getModuleDeepDependents(targetFiles).filter(
      (d) => !directCallers.includes(d)
    )
    if (deepDependents.length > 0) {
      lines.push(`## 4. 远端影响闭包指针 (Spill Pointers for Chain of Recall)`)
      lines.push(`> 如需查看以下远端关联文件的契约，请继续调用 \`zhifangsi_skeleton(target="<path>")\`:`)
      for (const dd of deepDependents.slice(0, 20)) {
        const pr = ((pageRanks.get(dd) || 0) * 100).toFixed(2)
        lines.push(`- \`${dd}\` (PageRank: ${pr}%)`)
      }
    }
  }

  return lines.join('\n')
}

export interface ChangeImpactResult {
  targetFiles: string[]
  directCallers: string[]
  deepAffectedFiles: string[]
  affectedModules: string[]
  affectedWorkflows: string[]
  touchedTopHubs: Array<{ filePath: string; rankIndex: number; scorePercent: string }>
  markdown: string
}

/**
 * 变更爆炸半径、核心关隘防撞车与回归测试业务流召回探针
 */
export function analyzeChangeImpact(
  rootDir: string,
  files: string[],
  graph: DependencyGraph,
  storageOptions: StorageResolveOptions = {}
): ChangeImpactResult {
  const storage = resolveStoragePaths(rootDir, storageOptions)
  const resolvedTargets = new Set<string>()
  for (const f of files) {
    for (const m of graph.resolveModuleFiles(f)) {
      resolvedTargets.add(m)
    }
  }

  const targetFiles = Array.from(resolvedTargets)
  const directCallers = graph.getModuleDependents(targetFiles)
  const deepAffectedFiles = graph.getModuleDeepDependents(targetFiles)
  const allImpactedFiles = new Set([...targetFiles, ...deepAffectedFiles])

  // Check if any targetFile is among Top 5 PageRank Hubs
  const analysis = graph.analyze()
  const topHubs = analysis.hubs.slice(0, 5)
  const touchedTopHubs: Array<{ filePath: string; rankIndex: number; scorePercent: string }> = []

  topHubs.forEach((hub, idx) => {
    if (targetFiles.includes(hub.filePath)) {
      touchedTopHubs.push({
        filePath: hub.filePath,
        rankIndex: idx + 1,
        scorePercent: `${(hub.score * 100).toFixed(2)}%`,
      })
    }
  })

  // Map impacted files to wiki/modules/*.md
  const affectedModules = new Set<string>()
  const modulesDir = path.join(storage.wikiDir, 'modules')
  if (fs.existsSync(modulesDir)) {
    const modFiles = fs.readdirSync(modulesDir).filter((f) => f.endsWith('.md'))
    for (const mf of modFiles) {
      const modSlug = mf.replace(/\.md$/, '')
      try {
        const content = fs.readFileSync(path.join(modulesDir, mf), 'utf-8')
        const { data } = extractFrontmatter(content)
        const declaredPath = typeof data.path === 'string' ? data.path : modSlug
        const entrypoints: string[] = Array.isArray(data.entrypoints) ? data.entrypoints.map(String) : []
        const modNodes = graph.resolveModuleFiles(declaredPath, entrypoints)
        if (modNodes.some((n) => allImpactedFiles.has(n))) {
          affectedModules.add(modSlug)
        }
      } catch {
        // ignore
      }
    }
  }

  // Fallback module inference from directory names if wiki/modules is empty
  if (affectedModules.size === 0) {
    for (const f of allImpactedFiles) {
      const parts = f.split('/')
      if (parts[0] === 'src' && parts.length >= 3) {
        affectedModules.add(parts[1])
      }
    }
  }

  // Map affected modules/files to wiki/workflows/*.md
  const affectedWorkflows = new Set<string>()
  const workflowsDir = path.join(storage.wikiDir, 'workflows')
  if (fs.existsSync(workflowsDir)) {
    const wfFiles = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.md'))
    for (const wf of wfFiles) {
      const wfSlug = wf.replace(/\.md$/, '')
      try {
        const content = fs.readFileSync(path.join(workflowsDir, wf), 'utf-8')
        const hitModule = Array.from(affectedModules).some(
          (m) => content.includes(m) || content.includes(`[[modules/${m}]]`) || content.includes(`[[${m}]]`)
        )
        const hitFile = Array.from(allImpactedFiles).some((f) => content.includes(f))
        if (hitModule || hitFile) {
          affectedWorkflows.add(wfSlug)
        }
      } catch {
        // ignore
      }
    }
  }

  const lines: string[] = [
    `# 职方司变更影响与防撞车评估报告 (Change Impact Analysis)`,
    `- **拟变更目标文件**: ${targetFiles.length > 0 ? targetFiles.map((f) => `\`${f}\``).join(', ') : '未匹配到源码节点'}`,
    `- **直接上游调用方 (${directCallers.length})**: ${directCallers.length > 0 ? directCallers.map((f) => `\`${f}\``).join(', ') : '无'}`,
    `- **深度影响闭包 (${deepAffectedFiles.length})**: ${deepAffectedFiles.length > 0 ? deepAffectedFiles.map((f) => `\`${f}\``).join(', ') : '无'}`,
    `- **波及业务模块**: ${affectedModules.size > 0 ? Array.from(affectedModules).map((m) => `\`[[modules/${m}]]\``).join(', ') : '未波及外部模块'}`,
    `- **建议回归验证的业务流水线**: ${affectedWorkflows.size > 0 ? Array.from(affectedWorkflows).map((w) => `\`[[workflows/${w}]]\``).join(', ') : '无关联注册流水线'}`,
  ]

  if (touchedTopHubs.length > 0) {
    lines.push(`\n## ⚠ 高危咽喉要道变更预警 (Multi-Worker Collision Alert)`)
    for (const hub of touchedTopHubs) {
      lines.push(
        `- **[高危关隘 Top #${hub.rankIndex}] \`${hub.filePath}\`** (PageRank: ${hub.scorePercent}): 该文件为全库高耦合核心枢纽，Router 调度时请锁定该文件防止其他并行 Worker 同时修改，合并前须经门下省/人工重点审阅！`
      )
    }
  }

  return {
    targetFiles,
    directCallers,
    deepAffectedFiles,
    affectedModules: Array.from(affectedModules),
    affectedWorkflows: Array.from(affectedWorkflows),
    touchedTopHubs,
    markdown: lines.join('\n'),
  }
}
