import type { FileAstInfo, GraphAnalysisResult, HubMetric } from './types.js'
import { resolveWorkspaceImport } from './parser.js'

export class DependencyGraph {
  private files = new Map<string, FileAstInfo>()
  private adjacency = new Map<string, Set<string>>() // from -> set of to
  private reverseAdjacency = new Map<string, Set<string>>() // to -> set of from

  constructor(fileInfos: FileAstInfo[] = [], aliasMap: Record<string, string> = {}) {
    const allFilePaths = fileInfos.map((f) => f.filePath.replace(/\\/g, '/'))
    for (const info of fileInfos) {
      const normPath = info.filePath.replace(/\\/g, '/')
      info.filePath = normPath
      this.files.set(normPath, info)
      if (!this.adjacency.has(normPath)) this.adjacency.set(normPath, new Set())
      if (!this.reverseAdjacency.has(normPath)) this.reverseAdjacency.set(normPath, new Set())
    }

    // Connect edges based on resolved relative and workspace-aliased imports
    for (const info of fileInfos) {
      for (const imp of info.imports) {
        const resolved = resolveWorkspaceImport(info.filePath, imp.rawSpecifier, allFilePaths, aliasMap)
        if (resolved && resolved !== info.filePath) {
          imp.resolvedPath = resolved
          this.addEdge(info.filePath, resolved)
        }
      }
    }
  }

  public addEdge(from: string, to: string) {
    if (!this.adjacency.has(from)) this.adjacency.set(from, new Set())
    if (!this.reverseAdjacency.has(to)) this.reverseAdjacency.set(to, new Set())

    this.adjacency.get(from)!.add(to)
    this.reverseAdjacency.get(to)!.add(from)
  }

  public getDependencies(filePath: string): string[] {
    return Array.from(this.adjacency.get(filePath.replace(/\\/g, '/')) || [])
  }

  public getDependents(filePath: string): string[] {
    return Array.from(this.reverseAdjacency.get(filePath.replace(/\\/g, '/')) || [])
  }

  public getAllFiles(): FileAstInfo[] {
    return Array.from(this.files.values())
  }

  public getFileInfo(filePath: string): FileAstInfo | undefined {
    return this.files.get(filePath.replace(/\\/g, '/'))
  }

  /**
   * Resolve a module slug, directory path, or explicit path list to matching file nodes in the graph.
   */
  public resolveModuleFiles(moduleNameOrPath: string, explicitPaths: string[] = []): string[] {
    const allKeys = Array.from(this.files.keys())
    const matched = new Set<string>()

    const candidates = [moduleNameOrPath, ...explicitPaths]
      .map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)

    for (const cand of candidates) {
      for (const fileKey of allKeys) {
        if (
          fileKey === cand ||
          fileKey.startsWith(`${cand}/`) ||
          fileKey.startsWith(`src/${cand}/`) ||
          fileKey === `src/${cand}.ts` ||
          fileKey === `src/${cand}.js` ||
          fileKey === `src/${cand}.py` ||
          fileKey.includes(`/${cand}/`) ||
          fileKey.replace(/\.[^.]+$/, '').endsWith(`/${cand}`)
        ) {
          matched.add(fileKey)
        }
      }
    }

    return Array.from(matched)
  }

  /**
   * External files that directly depend on any file in `moduleFiles` (excluding internal self-dependencies).
   */
  public getModuleDependents(moduleFiles: string[]): string[] {
    const internalSet = new Set(moduleFiles.map((f) => f.replace(/\\/g, '/')))
    const externalCallers = new Set<string>()

    for (const f of internalSet) {
      for (const caller of this.getDependents(f)) {
        if (!internalSet.has(caller)) {
          externalCallers.add(caller)
        }
      }
    }

    return Array.from(externalCallers)
  }

  /**
   * External files that `moduleFiles` directly import (excluding internal self-dependencies).
   */
  public getModuleDependencies(moduleFiles: string[]): string[] {
    const internalSet = new Set(moduleFiles.map((f) => f.replace(/\\/g, '/')))
    const externalTargets = new Set<string>()

    for (const f of internalSet) {
      for (const target of this.getDependencies(f)) {
        if (!internalSet.has(target)) {
          externalTargets.add(target)
        }
      }
    }

    return Array.from(externalTargets)
  }

  /**
   * Transitive closure of external files affected if any file in `moduleFiles` changes.
   */
  public getModuleDeepDependents(moduleFiles: string[], maxDepth = 10): string[] {
    const internalSet = new Set(moduleFiles.map((f) => f.replace(/\\/g, '/')))
    const externalAffected = new Set<string>()

    for (const f of internalSet) {
      for (const dep of this.getDeepDependents(f, maxDepth)) {
        if (!internalSet.has(dep)) {
          externalAffected.add(dep)
        }
      }
    }

    return Array.from(externalAffected)
  }

  /**
   * Transitive closure of all files affected if `filePath` changes.
   * Breadth-First Search (BFS) along the reverse dependency graph.
   */
  public getDeepDependents(filePath: string, maxDepth = 10): string[] {
    const normStart = filePath.replace(/\\/g, '/')
    const visited = new Set<string>()
    const queue: Array<{ path: string; depth: number }> = [{ path: normStart, depth: 0 }]

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!
      if (depth >= maxDepth) continue

      const dependents = this.getDependents(path)
      for (const dep of dependents) {
        if (!visited.has(dep) && dep !== normStart) {
          visited.add(dep)
          queue.push({ path: dep, depth: depth + 1 })
        }
      }
    }

    return Array.from(visited)
  }

  /**
   * Detect circular dependency cycles in the graph (e.g., ['src/a.ts', 'src/b.ts', 'src/a.ts']).
   */
  public findCircularDependencies(maxCycles = 50): string[][] {
    const nodes = Array.from(this.files.keys()).sort()
    const visited = new Set<string>()
    const onStack = new Set<string>()
    const pathStack: string[] = []
    const cycles: string[][] = []
    const seenCycleKeys = new Set<string>()

    const dfs = (node: string) => {
      if (cycles.length >= maxCycles) return

      visited.add(node)
      onStack.add(node)
      pathStack.push(node)

      const neighbors = this.getDependencies(node)
      for (const next of neighbors) {
        if (cycles.length >= maxCycles) break

        if (!visited.has(next)) {
          dfs(next)
        } else if (onStack.has(next)) {
          const cycleStartIdx = pathStack.indexOf(next)
          if (cycleStartIdx !== -1) {
            const cycleNodes = pathStack.slice(cycleStartIdx)
            // Canonicalize cycle key to avoid duplicate rotations of the same cycle
            const minNode = [...cycleNodes].sort()[0]
            const minIdx = cycleNodes.indexOf(minNode)
            const canonical = [...cycleNodes.slice(minIdx), ...cycleNodes.slice(0, minIdx)]
            const cycleKey = canonical.join(' -> ')
            if (!seenCycleKeys.has(cycleKey)) {
              seenCycleKeys.add(cycleKey)
              cycles.push([...canonical, canonical[0]])
            }
          }
        }
      }

      pathStack.pop()
      onStack.delete(node)
    }

    for (const node of nodes) {
      if (!visited.has(node)) {
        dfs(node)
      }
    }

    return cycles
  }

  /**
   * Compute PageRank centrality to identify architectural hubs.
   */
  public computePageRank(damping = 0.85, maxIterations = 40, tolerance = 1e-4): Map<string, number> {
    const nodes = Array.from(this.files.keys())
    const n = nodes.length
    if (n === 0) return new Map()

    let ranks = new Map<string, number>()
    const initialRank = 1 / n
    for (const node of nodes) {
      ranks.set(node, initialRank)
    }

    for (let iter = 0; iter < maxIterations; iter++) {
      const nextRanks = new Map<string, number>()
      let diff = 0

      for (const node of nodes) {
        let incomingSum = 0
        const callers = this.getDependents(node)

        for (const caller of callers) {
          const outgoingCount = this.adjacency.get(caller)?.size || 1
          incomingSum += (ranks.get(caller) || 0) / outgoingCount
        }

        const newRank = (1 - damping) / n + damping * incomingSum
        nextRanks.set(node, newRank)
        diff += Math.abs(newRank - (ranks.get(node) || 0))
      }

      ranks = nextRanks
      if (diff < tolerance) break
    }

    return ranks
  }

  /**
   * Comprehensive graph analysis
   */
  public analyze(): GraphAnalysisResult {
    const pageRanks = this.computePageRank()
    const hubs: HubMetric[] = []
    const isolatedNodes: string[] = []
    let edgeCount = 0

    for (const path of this.files.keys()) {
      const inDegree = this.reverseAdjacency.get(path)?.size || 0
      const outDegree = this.adjacency.get(path)?.size || 0
      edgeCount += outDegree

      if (inDegree === 0 && outDegree === 0) {
        isolatedNodes.push(path)
      }

      hubs.push({
        filePath: path,
        score: pageRanks.get(path) || 0,
        inDegree,
        outDegree,
      })
    }

    // Sort hubs by PageRank descending
    hubs.sort((a, b) => b.score - a.score)

    const circularDependencies = this.findCircularDependencies()

    return {
      nodeCount: this.files.size,
      edgeCount,
      hubs,
      isolatedNodes,
      circularDependencies,
    }
  }
}
