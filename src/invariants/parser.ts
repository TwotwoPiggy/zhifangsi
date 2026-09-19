import * as path from 'path'
import type {
  InvariantConstraint,
  InvariantDefinition,
  InvariantSeverity,
  DenyImportConstraint,
  AllowOnlyConstraint,
  IsolatedModuleConstraint,
} from './types.js'

/**
 * 剥离并解析 Markdown 文件的 YAML Frontmatter
 */
export function extractFrontmatter(content: string): { data: Record<string, any>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

  if (!match) {
    return { data: {}, body: normalized }
  }

  const yamlText = match[1]
  const body = match[2] || ''
  const data = parseSimpleYaml(yamlText)

  return { data, body }
}

/**
 * 轻量且健壮的 YAML 解析器（零第三方依赖）
 * 支持键值对、嵌套列表、单多行字符串、内联列表/对象
 */
export function parseSimpleYaml(yamlText: string): Record<string, any> {
  const lines = yamlText.split('\n')
  const root: Record<string, any> = {}

  let currentKey: string | null = null
  let currentList: any[] | null = null
  let currentListIndent = -1
  let currentObjectInList: Record<string, any> | null = null
  let currentSubList: any[] | null = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    // 忽略纯注释或空行
    const lineWithoutComment = rawLine.replace(/\s+#.*$/, '')
    const trimmed = lineWithoutComment.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = rawLine.search(/\S/)

    // 1. 列表项: - value 或 - key: value
    if (trimmed.startsWith('- ')) {
      const listContent = trimmed.slice(2).trim()

      // 检查是否属于对象内部的嵌套子列表 (如 disallowed: 下的 - item)
      if (currentSubList && indent > currentListIndent) {
        currentSubList.push(parseYamlValue(listContent))
        continue
      }

      currentSubList = null
      currentListIndent = indent

      if (!currentList && currentKey) {
        currentList = []
        root[currentKey] = currentList
      }

      if (listContent.includes(':') && !listContent.startsWith('{') && !listContent.startsWith('[')) {
        // 列表中的对象: - from: "..." 或 - type: deny_import
        currentObjectInList = {}
        const [k, ...vParts] = listContent.split(':')
        const kClean = k.trim()
        const vClean = parseYamlValue(vParts.join(':').trim())
        currentObjectInList[kClean] = vClean
        currentList?.push(currentObjectInList)
      } else {
        // 普通标量列表项: - "some text"
        currentObjectInList = null
        currentList?.push(parseYamlValue(listContent))
      }
      continue
    }

    // 2. 列表中对象的后续属性 (如 4 空格缩进 key: value)
    if (currentObjectInList && indent >= 4 && trimmed.includes(':')) {
      const [subK, ...subVParts] = trimmed.split(':')
      const subKey = subK.trim()
      const rawVal = subVParts.join(':').trim()
      const subVal = parseYamlValue(rawVal)

      if (rawVal === '') {
        // 接下来为嵌套列表
        currentSubList = []
        currentObjectInList[subKey] = currentSubList
      } else {
        currentSubList = null
        currentObjectInList[subKey] = subVal
      }
      continue
    }

    // 3. 顶级键值对: key: value
    if (trimmed.includes(':')) {
      currentObjectInList = null
      currentList = null
      currentSubList = null
      currentListIndent = -1

      const colonIdx = trimmed.indexOf(':')
      const key = trimmed.slice(0, colonIdx).trim()
      const valueStr = trimmed.slice(colonIdx + 1).trim()

      currentKey = key

      if (!valueStr) {
        // 接下来可能是列表或对象
        root[key] = []
        currentList = root[key]
      } else {
        root[key] = parseYamlValue(valueStr)
      }
    }
  }

  return root
}

/**
 * 解析 YAML 标量或内联 JSON 结构（如 ["a", "b"] 或 { from: "a" }）
 */
function parseYamlValue(val: string): any {
  val = val.trim()
  if (!val) return ''

  // 内联数组: ["a", "b"]
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((item) => parseYamlValue(item.trim()))
      .filter((item) => item !== '')
  }

  // 内联对象: { a: 1, b: "2" }
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1).trim()
    const obj: Record<string, any> = {}
    if (!inner) return obj
    const parts = inner.split(',')
    for (const part of parts) {
      const [k, ...v] = part.split(':')
      if (k && v.length > 0) {
        obj[k.trim().replace(/^["']|["']$/g, '')] = parseYamlValue(v.join(':').trim())
      }
    }
    return obj
  }

  // 引号包裹的字符串
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }

  // 布尔值与数字
  if (val.toLowerCase() === 'true') return true
  if (val.toLowerCase() === 'false') return false
  if (!isNaN(Number(val)) && val !== '') return Number(val)

  return val
}

/**
 * 将各类约束声明统一规范化为标准的 InvariantConstraint 集合
 */
export function normalizeConstraints(rawConstraints: any[] = []): InvariantConstraint[] {
  const result: InvariantConstraint[] = []

  for (const raw of rawConstraints) {
    if (!raw || typeof raw !== 'object') continue

    // 格式 1: { type: 'deny_import', from: '...', disallowed: [...] }
    if (raw.type === 'deny_import' || raw.deny) {
      const target = raw.deny && typeof raw.deny === 'object' ? raw.deny : raw
      const from = target.from || target.source || ''
      let disallowed: string[] = []

      if (Array.isArray(target.disallowed)) {
        disallowed = target.disallowed
      } else if (typeof target.disallowed === 'string') {
        disallowed = [target.disallowed]
      } else if (Array.isArray(target.to)) {
        disallowed = target.to
      } else if (typeof target.to === 'string') {
        disallowed = [target.to]
      }

      if (from && disallowed.length > 0) {
        result.push({
          type: 'deny_import',
          from,
          disallowed,
          message: target.message || `禁止从 ${from} 导入 ${disallowed.join(', ')}`,
        })
      }
    }
    // 格式 2: { type: 'allow_only', from: '...', allowed: [...] }
    else if (raw.type === 'allow_only' || raw.allow_only) {
      const target = raw.allow_only && typeof raw.allow_only === 'object' ? raw.allow_only : raw
      const from = target.from || ''
      let allowed: string[] = []

      if (Array.isArray(target.allowed)) {
        allowed = target.allowed
      } else if (typeof target.allowed === 'string') {
        allowed = [target.allowed]
      } else if (Array.isArray(target.only)) {
        allowed = target.only
      } else if (typeof target.only === 'string') {
        allowed = [target.only]
      }

      if (from && allowed.length > 0) {
        result.push({
          type: 'allow_only',
          from,
          allowed,
          message: target.message || `${from} 仅允许依赖 ${allowed.join(', ')}`,
        })
      }
    }
    // 格式 3: { type: 'isolated_module', module: '...', allowFrom: [...] }
    else if (raw.type === 'isolated_module' || raw.isolate) {
      const target = raw.isolate && typeof raw.isolate === 'object' ? raw.isolate : raw
      const mod = target.module || target.mod || ''
      let allowFrom: string[] = []

      if (Array.isArray(target.allowFrom)) {
        allowFrom = target.allowFrom
      } else if (typeof target.allowFrom === 'string') {
        allowFrom = [target.allowFrom]
      } else if (Array.isArray(target.allow_from)) {
        allowFrom = target.allow_from
      }

      if (mod) {
        result.push({
          type: 'isolated_module',
          module: mod,
          allowFrom,
          message: target.message || `私有模块 ${mod} 仅受信任调用方可引用`,
        })
      }
    }
  }

  return result
}

/**
 * 从文本规则 (rules 字段) 中智能推断静态约束
 * 例如:
 * - "禁止在 src/components/* 中直接引用 src/db/*"
 * - "src/components/* 只能依赖 src/stores/*，严禁反向依赖"
 * - "deny: from src/ui/** to src/db/**"
 */
export function inferConstraintsFromRules(rules: string[] = []): InvariantConstraint[] {
  const inferred: InvariantConstraint[] = []

  for (const rule of rules) {
    const trimmed = rule.trim()
    if (!trimmed) continue

    // 模式 1: deny: from <pattern> to <pattern>
    const denyMatch = trimmed.match(/deny:\s*from\s+([^\s]+)\s+to\s+([^\s]+)/i)
    if (denyMatch) {
      inferred.push({
        type: 'deny_import',
        from: denyMatch[1],
        disallowed: [denyMatch[2]],
        message: rule,
      })
      continue
    }

    // 模式 2: 禁止在 <from> 中/层 直接引用/导入/依赖 <to>
    const forbidMatch = trimmed.match(/禁止(?:在)?\s*([a-zA-Z0-9_\-\.\*\/]+)\s*(?:中|层)?(?:直接)?(?:引用|导入|依赖|发起|读写)\s*([a-zA-Z0-9_\-\.\*\/]+)/)
    if (forbidMatch) {
      inferred.push({
        type: 'deny_import',
        from: forbidMatch[1],
        disallowed: [forbidMatch[2]],
        message: rule,
      })
      continue
    }

    // 模式 3: <from> 禁止依赖/导入 <to>
    const simpleForbidMatch = trimmed.match(/([a-zA-Z0-9_\-\.\*\/]+)\s*禁止(?:依赖|导入|调用)\s*([a-zA-Z0-9_\-\.\*\/]+)/)
    if (simpleForbidMatch) {
      inferred.push({
        type: 'deny_import',
        from: simpleForbidMatch[1],
        disallowed: [simpleForbidMatch[2]],
        message: rule,
      })
      continue
    }

    // 模式 4: <from> 只能依赖 <allowed>，严禁反向依赖
    const reverseMatch = trimmed.match(/([a-zA-Z0-9_\-\.\*\/]+)\s*只能依赖\s*([a-zA-Z0-9_\-\.\*\/]+)(?:，|,)?\s*严禁反向依赖/)
    if (reverseMatch) {
      const from = reverseMatch[1]
      const allowed = reverseMatch[2]
      // 反向依赖禁止: allowed 严禁导入 from
      inferred.push({
        type: 'deny_import',
        from: allowed,
        disallowed: [from],
        message: `严禁 ${allowed} 反向依赖 ${from}`,
      })
      continue
    }

    // 模式 5: <from> 只能依赖 <allowed>
    const allowOnlyMatch = trimmed.match(/([a-zA-Z0-9_\-\.\*\/]+)\s*只能依赖\s*([a-zA-Z0-9_\-\.\*\/]+)/)
    if (allowOnlyMatch) {
      inferred.push({
        type: 'allow_only',
        from: allowOnlyMatch[1],
        allowed: [allowOnlyMatch[2], allowOnlyMatch[1]], // 允许同层或指定层
        message: rule,
      })
      continue
    }
  }

  return inferred
}

/**
 * 解析单个关防守则 Markdown 文件为 InvariantDefinition
 */
export function parseInvariantFile(filePath: string, fileContent: string): InvariantDefinition {
  const { data, body } = extractFrontmatter(fileContent)

  const defaultId = path.basename(filePath, path.extname(filePath))
  const id = data.id || defaultId
  const title = data.title || id
  const severity: InvariantSeverity = data.severity === 'warning' ? 'warning' : 'error'

  const rules: string[] = Array.isArray(data.rules)
    ? data.rules.map(String)
    : typeof data.rules === 'string'
      ? [data.rules]
      : []

  const affected_modules: string[] = Array.isArray(data.affected_modules)
    ? data.affected_modules.map(String)
    : []

  // 1. 显式声明的 constraints
  const explicitConstraints = normalizeConstraints(Array.isArray(data.constraints) ? data.constraints : [])

  // 2. 从 rules 中智能推断的 constraints
  const inferredConstraints = inferConstraintsFromRules(rules)

  // 合并约束 (去重)
  const constraints = [...explicitConstraints]
  for (const inf of inferredConstraints) {
    const exists = constraints.some(
      (c) =>
        c.type === inf.type &&
        (c as any).from === (inf as any).from &&
        JSON.stringify((c as any).disallowed || (c as any).allowed) ===
          JSON.stringify((inf as any).disallowed || (inf as any).allowed)
    )
    if (!exists) {
      constraints.push(inf)
    }
  }

  return {
    id,
    type: 'invariant',
    title,
    severity,
    description: data.description || '',
    rules,
    affected_modules,
    constraints,
    filePath,
    content: body.trim(),
  }
}
