/**
 * AST & Dependency Graph Type Definitions
 */

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'enum'
  | 'struct'
  | 'trait'

export interface CodeSymbol {
  name: string
  kind: SymbolKind
  signature: string
  exported: boolean
  line: number
}

export interface ImportEdge {
  fromFile: string
  rawSpecifier: string
  resolvedPath?: string
  importedSymbols: string[]
  isRelative: boolean
  line?: number
}

export interface FileAstInfo {
  filePath: string
  language: string
  exports: CodeSymbol[]
  imports: ImportEdge[]
  declarations: CodeSymbol[]
}

export interface HubMetric {
  filePath: string
  score: number // PageRank or centrality score
  inDegree: number
  outDegree: number
}

export interface GraphAnalysisResult {
  nodeCount: number
  edgeCount: number
  hubs: HubMetric[]
  isolatedNodes: string[]
  circularDependencies: string[][]
}
