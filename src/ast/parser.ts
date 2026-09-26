import type { CodeSymbol, FileAstInfo, ImportEdge, SymbolKind } from './types.js'

/**
 * Detect programming language from file extension
 */
export function detectLanguageFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.go')) return 'go'
  return 'unknown'
}

/**
 * Parse TypeScript / JavaScript code for imports, exports, and declarations.
 */
export function parseTsJsAst(filePath: string, code: string): FileAstInfo {
  const language = detectLanguageFromPath(filePath)
  const lines = code.split(/\r?\n/)
  const imports: ImportEdge[] = []
  const exports: CodeSymbol[] = []
  const declarations: CodeSymbol[] = []

  let inBlockComment = false

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx]
    const lineNum = idx + 1
    const trimmed = rawLine.trim()

    // Comment handling
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      continue
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true
      continue
    }
    if (trimmed.startsWith('//') || trimmed.length === 0) continue

    // Multiline statement accumulation for imports / re-exports
    let currentStatement = trimmed
    const isImportStart = /^import\b/.test(trimmed)
    const isReExportStart = /^export\s+(?:type\s+)?(?:\*|\{)/.test(trimmed)

    if ((isImportStart || isReExportStart) && !trimmed.includes("';") && !trimmed.includes('";') && !/['"][^'"]+['"]\s*;?$/.test(trimmed)) {
      let accumulated = trimmed
      let foundEndIdx = -1
      for (let j = idx + 1; j < lines.length && j < idx + 50; j++) {
        const next = lines[j].trim()
        accumulated += ' ' + next
        if (next.includes("';") || next.includes('";') || /['"][^'"]+['"]\s*;?$/.test(next)) {
          foundEndIdx = j
          break
        }
        if (next.endsWith(';') || next === '}') {
          if (!accumulated.includes(' from ')) {
            break
          }
        }
      }
      if (foundEndIdx !== -1 && /['"][^'"]+['"]/.test(accumulated)) {
        currentStatement = accumulated
        idx = foundEndIdx
      }
    }

    // 1. Imports and re-exports
    // Bare import: import './side-effect'
    // Import/export from: import/export ... from 'specifier'
    const importRegex = /\b(?:import\s+['"]([^'"]+)['"]|(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"])/g
    let importMatch: RegExpExecArray | null
    let foundImport = false

    while ((importMatch = importRegex.exec(currentStatement)) !== null) {
      foundImport = true
      const specifier = (importMatch[1] || importMatch[3] || '').trim()
      const clause = (importMatch[2] || '').trim()
      const symbols: string[] = []

      if (clause) {
        if (clause.startsWith('{')) {
          // Destructured
          const inner = clause.replace(/^\{|\}$/g, '').trim()
          inner.split(',').forEach((s) => {
            const sym = s.trim().split(/\s+as\s+/)[0].trim()
            if (sym) symbols.push(sym)
          })
        } else if (clause.startsWith('* as ')) {
          symbols.push(clause.replace('* as ', '').trim())
        } else if (clause === '*') {
          symbols.push('*')
        } else {
          // Default or mixed default + destructured
          const parts = clause.split(',')
          parts.forEach((p) => {
            const clean = p.replace(/[{}]/g, '').trim()
            if (clean) symbols.push(clean.split(/\s+as\s+/)[0].trim())
          })
        }
      }

      if (specifier) {
        imports.push({
          fromFile: filePath,
          rawSpecifier: specifier,
          importedSymbols: symbols,
          isRelative: specifier.startsWith('.'),
          line: lineNum,
        })
      }
    }

    if (foundImport) continue

    // Dynamic import / require
    const requireMatch = currentStatement.match(/(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\(['"]([^'"]+)['"]\)/)
    if (requireMatch) {
      const symbols = requireMatch[1]
        ? requireMatch[1].split(',').map((s) => s.trim().split(/\s*:\s*/)[0])
        : requireMatch[2]
          ? [requireMatch[2]]
          : []
      const specifier = requireMatch[3]
      imports.push({
        fromFile: filePath,
        rawSpecifier: specifier,
        importedSymbols: symbols,
        isRelative: specifier.startsWith('.'),
        line: lineNum,
      })
      continue
    }

    // Dynamic import()
    const dynamicImportMatch = currentStatement.match(/\bimport\(['"]([^'"]+)['"]\)/)
    if (dynamicImportMatch) {
      imports.push({
        fromFile: filePath,
        rawSpecifier: dynamicImportMatch[1],
        importedSymbols: [],
        isRelative: dynamicImportMatch[1].startsWith('.'),
        line: lineNum,
      })
      continue
    }

    // 2. Exports and Declarations
    const isExported = /^export\s+/.test(trimmed)
    const statement = isExported ? trimmed.replace(/^export\s+(?:default\s+)?/, '') : trimmed

    let symbol: CodeSymbol | null = null

    // Functions: function foo(...) or async function foo(...)
    const fnMatch = statement.match(/^(?:async\s+)?function\s*(\*?\s*[a-zA-Z0-9_$]+)\s*\(([^)]*)\)/)
    if (fnMatch) {
      const name = fnMatch[1].trim()
      symbol = {
        name,
        kind: 'function',
        signature: `${isExported ? 'export ' : ''}function ${name}(${fnMatch[2].trim()})`,
        exported: isExported,
        line: lineNum,
      }
    }

    // Classes: class Foo ...
    if (!symbol) {
      const classMatch = statement.match(/^class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+[^{]+|\s+implements\s+[^{]+)?/)
      if (classMatch) {
        const name = classMatch[1].trim()
        symbol = {
          name,
          kind: 'class',
          signature: `${isExported ? 'export ' : ''}class ${name}`,
          exported: isExported,
          line: lineNum,
        }
      }
    }

    // Interfaces: interface Foo ...
    if (!symbol) {
      const ifaceMatch = statement.match(/^interface\s+([a-zA-Z0-9_$]+)/)
      if (ifaceMatch) {
        const name = ifaceMatch[1].trim()
        symbol = {
          name,
          kind: 'interface',
          signature: `${isExported ? 'export ' : ''}interface ${name}`,
          exported: isExported,
          line: lineNum,
        }
      }
    }

    // Types: type Foo = ...
    if (!symbol) {
      const typeMatch = statement.match(/^type\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?\s*=/)
      if (typeMatch) {
        const name = typeMatch[1].trim()
        symbol = {
          name,
          kind: 'type',
          signature: `${isExported ? 'export ' : ''}type ${name}`,
          exported: isExported,
          line: lineNum,
        }
      }
    }

    // Enums: enum Foo ...
    if (!symbol) {
      const enumMatch = statement.match(/^(?:const\s+)?enum\s+([a-zA-Z0-9_$]+)/)
      if (enumMatch) {
        const name = enumMatch[1].trim()
        symbol = {
          name,
          kind: 'enum',
          signature: `${isExported ? 'export ' : ''}enum ${name}`,
          exported: isExported,
          line: lineNum,
        }
      }
    }

    // Variables / Arrow Functions: const foo = (...) => ...
    if (!symbol) {
      const varMatch = statement.match(/^(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([a-zA-Z0-9_$]+))\s*=>/)
      if (varMatch) {
        const name = varMatch[1].trim()
        const params = (varMatch[2] || varMatch[3] || '').trim()
        symbol = {
          name,
          kind: 'function',
          signature: `${isExported ? 'export ' : ''}const ${name} = (${params}) => ...`,
          exported: isExported,
          line: lineNum,
        }
      } else {
        const constMatch = statement.match(/^(?:const|let|var)\s+([a-zA-Z0-9_$]+)/)
        if (constMatch && isExported) {
          const name = constMatch[1].trim()
          symbol = {
            name,
            kind: 'variable',
            signature: `${isExported ? 'export ' : ''}const ${name}`,
            exported: isExported,
            line: lineNum,
          }
        }
      }
    }

    if (symbol) {
      declarations.push(symbol)
      if (symbol.exported) {
        exports.push(symbol)
      }
    }
  }

  return { filePath, language, exports, imports, declarations }
}

/**
 * Parse Python code for imports, functions, and classes.
 */
export function parsePythonAst(filePath: string, code: string): FileAstInfo {
  const lines = code.split(/\r?\n/)
  const imports: ImportEdge[] = []
  const exports: CodeSymbol[] = []
  const declarations: CodeSymbol[] = []

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx]
    const lineNum = idx + 1
    const trimmed = rawLine.trim()

    if (trimmed.startsWith('#') || trimmed.length === 0) continue

    // 1. Imports: import x or from x import y
    const fromImportMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)$/)
    if (fromImportMatch) {
      const specifier = fromImportMatch[1]
      const symbols = fromImportMatch[2]
        .replace(/[()]/g, '')
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0])
        .filter(Boolean)
      imports.push({
        fromFile: filePath,
        rawSpecifier: specifier,
        importedSymbols: symbols,
        isRelative: specifier.startsWith('.'),
        line: lineNum,
      })
      continue
    }

    const simpleImportMatch = trimmed.match(/^import\s+([a-zA-Z0-9_., ]+)$/)
    if (simpleImportMatch) {
      simpleImportMatch[1].split(',').forEach((pkg) => {
        const specifier = pkg.trim().split(/\s+as\s+/)[0]
        if (specifier) {
          imports.push({
            fromFile: filePath,
            rawSpecifier: specifier,
            importedSymbols: [specifier],
            isRelative: specifier.startsWith('.'),
            line: lineNum,
          })
        }
      })
      continue
    }

    // 2. Top-level functions and classes (no indentation)
    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      const fnMatch = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/)
      if (fnMatch) {
        const name = fnMatch[1]
        const isPublic = !name.startsWith('_')
        const sym: CodeSymbol = {
          name,
          kind: 'function',
          signature: `def ${name}(${fnMatch[2].trim()}):`,
          exported: isPublic,
          line: lineNum,
        }
        declarations.push(sym)
        if (isPublic) exports.push(sym)
        continue
      }

      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/)
      if (classMatch) {
        const name = classMatch[1]
        const isPublic = !name.startsWith('_')
        const sym: CodeSymbol = {
          name,
          kind: 'class',
          signature: `class ${name}${classMatch[2] ? `(${classMatch[2]})` : ''}:`,
          exported: isPublic,
          line: lineNum,
        }
        declarations.push(sym)
        if (isPublic) exports.push(sym)
        continue
      }
    }
  }

  return { filePath, language: 'python', exports, imports, declarations }
}

/**
 * Parse Rust code for use statements, pub functions, structs, and traits.
 */
export function parseRustAst(filePath: string, code: string): FileAstInfo {
  const lines = code.split(/\r?\n/)
  const imports: ImportEdge[] = []
  const exports: CodeSymbol[] = []
  const declarations: CodeSymbol[] = []

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx]
    const lineNum = idx + 1
    const trimmed = rawLine.trim()

    if (trimmed.startsWith('//') || trimmed.length === 0) continue

    // 1. use crate::x::y; or use std::...
    const useMatch = trimmed.match(/^use\s+([^;]+);/)
    if (useMatch) {
      const path = useMatch[1].trim()
      const parts = path.split('::')
      const last = parts[parts.length - 1]
      const symbols = last.startsWith('{')
        ? last.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
        : [last]
      imports.push({
        fromFile: filePath,
        rawSpecifier: path,
        importedSymbols: symbols,
        isRelative: path.startsWith('super::') || path.startsWith('crate::'),
        line: lineNum,
      })
      continue
    }

    // 2. pub declarations
    const isPub = trimmed.startsWith('pub ') || trimmed.startsWith('pub(crate) ')
    let kind: SymbolKind | null = null
    let name: string | null = null
    let signature = trimmed

    if (/\b(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
      const match = trimmed.match(/\b(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/)
      kind = 'function'
      name = match ? match[1] : null
    } else if (/\bstruct\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
      const match = trimmed.match(/\bstruct\s+([a-zA-Z0-9_]+)/)
      kind = 'struct'
      name = match ? match[1] : null
    } else if (/\benum\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
      const match = trimmed.match(/\benum\s+([a-zA-Z0-9_]+)/)
      kind = 'enum'
      name = match ? match[1] : null
    } else if (/\btrait\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
      const match = trimmed.match(/\btrait\s+([a-zA-Z0-9_]+)/)
      kind = 'trait'
      name = match ? match[1] : null
    }

    if (kind && name) {
      const sym: CodeSymbol = {
        name,
        kind,
        signature: signature.split('{')[0].trim(),
        exported: isPub,
        line: lineNum,
      }
      declarations.push(sym)
      if (isPub) exports.push(sym)
    }
  }

  return { filePath, language: 'rust', exports, imports, declarations }
}

/**
 * Universal dispatcher for parsing code based on file extension
 */
export function parseSourceFileAst(filePath: string, code: string): FileAstInfo {
  const lang = detectLanguageFromPath(filePath)
  if (lang === 'typescript' || lang === 'javascript') {
    return parseTsJsAst(filePath, code)
  }
  if (lang === 'python') {
    return parsePythonAst(filePath, code)
  }
  if (lang === 'rust') {
    return parseRustAst(filePath, code)
  }
  return {
    filePath,
    language: lang,
    exports: [],
    imports: [],
    declarations: [],
  }
}

/**
 * Resolves a relative import specifier into a canonical workspace path
 */
export function resolveRelativeImport(fromFile: string, specifier: string, allFiles: string[]): string | null {
  if (!specifier.startsWith('.')) return null

  // Normalize separators
  const normFrom = fromFile.replace(/\\/g, '/')
  const fromDir = normFrom.substring(0, normFrom.lastIndexOf('/'))

  // Resolve dot path
  const parts = fromDir ? fromDir.split('/') : []
  const specParts = specifier.split('/')

  for (const part of specParts) {
    if (part === '.' || part === '') continue
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }

  const basePath = parts.join('/')
  const baseCandidates = [basePath]
  if (basePath.endsWith('.js')) {
    baseCandidates.push(basePath.replace(/\.js$/, '.ts'))
    baseCandidates.push(basePath.replace(/\.js$/, '.tsx'))
    baseCandidates.push(basePath.replace(/\.js$/, ''))
  } else if (basePath.endsWith('.jsx')) {
    baseCandidates.push(basePath.replace(/\.jsx$/, '.tsx'))
    baseCandidates.push(basePath.replace(/\.jsx$/, ''))
  }

  const candidateExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']

  for (const base of baseCandidates) {
    for (const ext of candidateExtensions) {
      const candidate = `${base}${ext}`
      if (allFiles.includes(candidate)) {
        return candidate
      }
    }
  }

  return null
}
