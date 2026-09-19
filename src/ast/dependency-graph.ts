import type { FileAstInfo, GraphAnalysisResult, HubMetric } from './types.js'
import { resolveRelativeImport } from './parser.js'

export class DependencyGraph {
  private files = new Map<string, FileAstInfo>()
  private adjacency = new Map<string, Set<string>>() // from -> set of to
  private reverseAdjacency = new Map<string, Set<string>>() // to -> set of from

  constructor(fileInfos: FileAstInfo[] = []) {
    const allFilePaths = fileInfos.map((f) => f.filePath)
    for (const info of fileInfos) {
      this.files.set(info.filePath, info)
      if (!this.adjacency.has(info.filePath)) this.adjacency.set(info.filePath, new Set())
      if (!this.reverseAdjacency.has(info.filePath)) this.reverseAdjacency.set(info.filePath, new Set())
    }

    // Connect edges based on resolved imports
    for (const info of fileInfos) {
      for (const imp of info.imports) {
        if (imp.isRelative) {
          const resolved = resolveRelativeImport(info.filePath, imp.rawSpecifier, allFilePaths)
          if (resolved) {
            imp.resolvedPath = resolved
            this.addEdge(info.filePath, resolved)
          }
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
    return Array.from(this.adjacency.get(filePath) || [])
  }

  public getDependents(filePath: string): string[] {
    return Array.from(this.reverseAdjacency.get(filePath) || [])
  }

  public getAllFiles(): FileAstInfo[] {
    return Array.from(this.files.values())
  }

  public getFileInfo(filePath: string): FileAstInfo | undefined {
    return this.files.get(filePath)
  }

  /**
   * Transitive closure of all files affected if `filePath` changes.
   * Breadth-First Search (BFS) along the reverse dependency graph.
   */
  public getDeepDependents(filePath: string, maxDepth = 10): string[] {
    const visited = new Set<string>()
    const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }]

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!
      if (depth >= maxDepth) continue

      const dependents = this.getDependents(path)
      for (const dep of dependents) {
        if (!visited.has(dep) && dep !== filePath) {
          visited.add(dep)
          queue.push({ path: dep, depth: depth + 1 })
        }
      }
    }

    return Array.from(visited)
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
        const callers = this.getDependents(node) // Who points to this node?

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

    return {
      nodeCount: this.files.size,
      edgeCount,
      hubs,
      isolatedNodes,
      circularDependencies: [],
    }
  }
}
