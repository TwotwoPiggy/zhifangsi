/**
 * 职方司 (zhifangsi) - 关防守则与架构不变量类型定义
 */

export type InvariantSeverity = 'error' | 'warning'
export type InvariantStatus = 'active' | 'draft'

/**
 * 禁止导入约束：匹配 from 模式的文件禁止导入匹配 disallowed 模式的任何模块
 */
export interface DenyImportConstraint {
  type: 'deny_import'
  from: string
  disallowed: string[]
  message?: string
}

/**
 * 限制仅允许导入约束：匹配 from 模式的文件只能导入匹配 allowed 列表中的模块
 */
export interface AllowOnlyConstraint {
  type: 'allow_only'
  from: string
  allowed: string[]
  message?: string
}

/**
 * 模块隔离约束：匹配 module 模式的私有模块仅允许被 allowFrom 列表中的文件导入
 */
export interface IsolatedModuleConstraint {
  type: 'isolated_module'
  module: string
  allowFrom: string[]
  message?: string
}

/**
 * 禁止循环依赖约束：匹配 scope 模式（缺省为全库 **）的文件之间禁止出现循环依赖环
 */
export interface NoCircularDependencyConstraint {
  type: 'no_circular_dependency'
  scope?: string
  message?: string
}

export type InvariantConstraint =
  | DenyImportConstraint
  | AllowOnlyConstraint
  | IsolatedModuleConstraint
  | NoCircularDependencyConstraint

/**
 * 关防守则实体定义（对应 wiki/invariants/*.md 文档）
 */
export interface InvariantDefinition {
  id: string
  type: 'invariant'
  title: string
  severity: InvariantSeverity
  status?: InvariantStatus
  description?: string
  rules: string[]
  affected_modules?: string[]
  constraints: InvariantConstraint[]
  filePath?: string
  content?: string
}

/**
 * 关防守则违规记录
 */
export interface InvariantViolation {
  invariantId: string
  invariantTitle: string
  severity: InvariantSeverity
  status?: InvariantStatus
  sourceFile: string
  targetImport: string
  resolvedTarget?: string
  line?: number
  message: string
  ruleDescription?: string
}

/**
 * 关防守则合规巡检报告
 */
export interface InvariantCheckReport {
  passed: boolean
  totalInvariants: number
  totalFilesChecked: number
  totalViolations: number
  violations: InvariantViolation[]
  draftViolations?: InvariantViolation[]
  driftWarnings?: string[]
  summary: {
    errors: number
    warnings: number
    drafts?: number
    drifts?: number
  }
}
