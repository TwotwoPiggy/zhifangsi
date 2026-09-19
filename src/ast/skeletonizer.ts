/**
 * Code Skeletonizer Utility
 *
 * Extracts high-density architectural skeletons from source code by retaining:
 * - Module docstrings and comments
 * - Imports and exports (dependency mapping)
 * - Type definitions, interfaces, structs, enums, and schemas
 * - Class declarations and method signatures
 * - Top-level function declarations and parameters
 *
 * Dense procedural implementation bodies are stripped to drastically reduce
 * token usage and noise when ingesting codebases into LLM Wiki.
 */
import * as fs from 'fs'
import * as path from 'path'

export interface SkeletonOptions {
  preserveImports?: boolean
  preserveComments?: boolean
  maxLinesPerFile?: number
}

export interface ModuleSkeleton {
  filePath: string
  language: string
  skeleton: string
  originalLines: number
  skeletonLines: number
  tokenSavingsRatio: number
}

const DEFAULT_IGNORED_PATTERNS = [
  /^[.](git|svn|hg|github|vscode|idea)($|[\\/])/i,
  /(^|[\\/])(node_modules|dist|build|target|out|coverage|__pycache__|[.]next|[.]nuxt|venv|[.]venv|env)[\\/]/i,
  /(^|[\\/])(package-lock[.]json|yarn[.]lock|pnpm-lock[.]yaml|cargo[.]lock|poetry[.]lock|composer[.]lock)$/i,
  /[.](min[.]js|min[.]css|map|bundle[.]js|d[.]ts[.]map)$/i,
  /[.](png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|tar|gz|exe|dll|dylib|so|bin)$/i,
]

export function shouldIgnorePath(relPath: string, extraIgnores: (string | RegExp)[] = []): boolean {
  const normalized = relPath.replace(/\\/g, "/")
  for (const pattern of DEFAULT_IGNORED_PATTERNS) {
    if (pattern.test(normalized)) return true
  }
  for (const extra of extraIgnores) {
    if (typeof extra === "string") {
      if (normalized.includes(extra) || normalized.startsWith(extra)) return true
    } else if (extra.test(normalized)) {
      return true
    }
  }
  return false
}

function isPreservedOpening(trimmedStmt: string): boolean {
  // Import/export destructuring: import { a, b } from "x" or export { y }
  if (
    /^(import|export)\b/.test(trimmedStmt) &&
    !/\b(function)\b/.test(trimmedStmt) &&
    !/[)=]\s*$/.test(trimmedStmt)
  ) {
    return true
  }
  // Type definitions, interfaces, enums, structs, classes, impl blocks, traits
  if (/\b(interface|type|enum|struct|class|impl|trait)\b/.test(trimmedStmt)) {
    return true
  }
  // Object literals assigned to variables: const config = { ... }
  if (trimmedStmt.endsWith("=")) {
    return true
  }
  return false
}

/**
 * Strips function and method bodies enclosed in balanced braces { ... }.
 * Replaces them with `{ /* ... *\/ }` while preserving signatures, types, and imports.
 */
export function stripBraceBodies(code: string): string {
  const result: string[] = []
  let depth = 0
  let strippedAtDepth: number | null = null
  let inString: string | null = null
  let inLineComment = false
  let inBlockComment = false
  let currentStatement = ""

  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const prevChar = i > 0 ? code[i - 1] : ""
    const nextChar = i + 1 < code.length ? code[i + 1] : ""

    // Handle line comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        if (strippedAtDepth === null) result.push("\n")
      } else if (strippedAtDepth === null) {
        result.push(char)
      }
      continue
    }

    // Handle block comments
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false
        i++
        if (strippedAtDepth === null) result.push("*/")
      } else if (strippedAtDepth === null) {
        result.push(char)
      }
      continue
    }

    // Check for comment starts
    if (!inString && char === "/" && nextChar === "/") {
      inLineComment = true
      i++
      if (strippedAtDepth === null) result.push("//")
      continue
    }
    if (!inString && char === "/" && nextChar === "*") {
      inBlockComment = true
      i++
      if (strippedAtDepth === null) result.push("/*")
      continue
    }

    // Handle string literals
    if (inString) {
      if (char === inString && prevChar !== "\\") {
        inString = null
      }
      if (strippedAtDepth === null) result.push(char)
      continue
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char
      if (strippedAtDepth === null) result.push(char)
      continue
    }

    // Handle Braces
    if (char === "{") {
      const alreadyHasSpace = result.length > 0 && /\s$/.test(result[result.length - 1])
      const spacer = alreadyHasSpace ? "" : " "

      if (strippedAtDepth === null) {
        const trimmed = currentStatement.trim()
        if (isPreservedOpening(trimmed)) {
          result.push(`${spacer}{`)
        } else {
          strippedAtDepth = depth
          result.push(`${spacer}{ /* implementation omitted */ }`)
        }
      }
      depth++
      currentStatement = ""
      continue
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1)
      if (strippedAtDepth !== null) {
        if (depth === strippedAtDepth) {
          strippedAtDepth = null
          currentStatement = ""
        }
      } else {
        result.push("}")
        currentStatement = ""
      }
      continue
    }

    if (strippedAtDepth === null) {
      result.push(char)
      if (char === "\n" || char === ";") {
        currentStatement = ""
      } else {
        currentStatement += char
      }
    }
  }

  return cleanExtraBlankLines(result.join(""))
}

/**
 * Skeletonizes Python code by extracting module docstrings, imports,
 * class headers, and def function signatures while stripping bodies to `...`.
 */
export function skeletonizePython(code: string): string {
  const lines = code.split("\n")
  const out: string[] = []
  let inDocstring = false
  let docstringDelimiter = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Handle multiline docstrings
    if (!inDocstring && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
      docstringDelimiter = trimmed.slice(0, 3)
      out.push(line)
      if (trimmed.length > 3 && trimmed.slice(3).includes(docstringDelimiter)) {
        // single-line docstring
      } else {
        inDocstring = true
      }
      continue
    }
    if (inDocstring) {
      out.push(line)
      if (trimmed.includes(docstringDelimiter)) {
        inDocstring = false
      }
      continue
    }

    // Skip empty lines or pure internal comments
    if (!trimmed) {
      out.push("")
      continue
    }

    // Preserve imports
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      out.push(line)
      continue
    }

    // Preserve decorators
    if (trimmed.startsWith("@")) {
      out.push(line)
      continue
    }

    // Class definition
    if (trimmed.startsWith("class ")) {
      out.push(line)
      continue
    }

    // Function/method definition
    if (trimmed.startsWith("def ") || trimmed.startsWith("async def ")) {
      // If multiline signature, collect lines until ':'
      let fullSig = line
      while (!fullSig.trim().endsWith(":") && i + 1 < lines.length) {
        i++
        fullSig += "\n" + lines[i]
      }
      const indent = line.match(/^\s*/)?.[0] ?? ""
      out.push(fullSig)
      out.push(`${indent}    ...`)
      continue
    }

    // Constants (UPPERCASE_NAME = ...)
    if (/^[A-Z][A-Z0-9_]*\s*[:=]/.test(trimmed)) {
      out.push(line)
      continue
    }
  }

  return cleanExtraBlankLines(out.join("\n"))
}

/**
 * Skeletonizes TypeScript / JavaScript code.
 */
export function skeletonizeTypeScript(code: string): string {
  return stripBraceBodies(code)
}

/**
 * Skeletonizes Rust code.
 */
export function skeletonizeRust(code: string): string {
  return stripBraceBodies(code)
}

/**
 * Skeletonizes Go code.
 */
export function skeletonizeGo(code: string): string {
  return stripBraceBodies(code)
}

/**
 * Detect language by extension and skeletonize.
 */
export function skeletonizeCode(code: string, language: string, _options?: SkeletonOptions): string {
  const lang = language.toLowerCase().trim()
  if (["python", "py"].includes(lang)) {
    return skeletonizePython(code)
  }
  if (["typescript", "ts", "tsx", "javascript", "js", "jsx"].includes(lang)) {
    return skeletonizeTypeScript(code)
  }
  if (["rust", "rs"].includes(lang)) {
    return skeletonizeRust(code)
  }
  if (["go"].includes(lang)) {
    return skeletonizeGo(code)
  }
  // For other C-style languages (C, C++, Java, C#, PHP), brace stripping works well
  if (["c", "cpp", "cxx", "h", "hpp", "java", "cs", "php", "swift", "kotlin", "kt"].includes(lang)) {
    return stripBraceBodies(code)
  }
  return code
}

function cleanExtraBlankLines(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

/**
 * Builds a ModuleSkeleton report for a single file.
 */
export function createModuleSkeleton(
  filePath: string,
  content: string,
  language: string,
  options?: SkeletonOptions,
): ModuleSkeleton {
  const originalLines = content.split("\n").length
  const skeleton = skeletonizeCode(content, language, options)
  const skeletonLines = skeleton.split("\n").length
  const tokenSavingsRatio = originalLines > 0 ? Math.max(0, (originalLines - skeletonLines) / originalLines) : 0

  return {
    filePath,
    language,
    skeleton,
    originalLines,
    skeletonLines,
    tokenSavingsRatio: Number(tokenSavingsRatio.toFixed(2)),
  }
}

/**
 * Combines multiple file skeletons of a subsystem/package into a consolidated Markdown document
 * formatted for ingestion into LLM Wiki (`raw/sources/codebase/`).
 */
export function buildSubsystemSourceDocument(
  subsystemName: string,
  skeletons: ModuleSkeleton[],
  summaryDescription?: string,
): string {
  const totalOriginalLines = skeletons.reduce((acc, s) => acc + s.originalLines, 0)
  const totalSkeletonLines = skeletons.reduce((acc, s) => acc + s.skeletonLines, 0)
  const avgSavings = totalOriginalLines > 0 ? Math.round(((totalOriginalLines - totalSkeletonLines) / totalOriginalLines) * 100) : 0

  const lines: string[] = [
    `# Subsystem Architecture: ${subsystemName}`,
    "",
    summaryDescription ? `${summaryDescription}\n` : "",
    `**Metrics:** ${skeletons.length} modules, ${totalOriginalLines} raw lines → ${totalSkeletonLines} skeleton lines (${avgSavings}% token reduction).`,
    "",
    "## Modules & Components",
    "",
  ]

  for (const s of skeletons) {
    lines.push(`### \`${s.filePath}\``)
    lines.push(`*Language: ${s.language} | Lines: ${s.skeletonLines} (original: ${s.originalLines})*`)
    lines.push("")
    lines.push("```" + s.language)
    lines.push(s.skeleton)
    lines.push("```")
    lines.push("")
  }

  return lines.join("\n")
}

export interface CodebaseSkeletonResult {
  markdown: string
  totalOriginalLines: number
  totalSkeletonLines: number
  overallTokenSavings: number
  filesProcessed: number
}

/**
 * Scans a directory and generates a consolidated codebase skeleton markdown
 */
export function generateCodebaseSkeleton(
  rootDir: string,
  options?: SkeletonOptions
): CodebaseSkeletonResult {
  const skeletons: ModuleSkeleton[] = []

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/')
      if (shouldIgnorePath(relPath)) continue

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        let lang: string | null = null
        if (['.ts', '.tsx'].includes(ext)) lang = 'typescript'
        else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) lang = 'javascript'
        else if (['.py'].includes(ext)) lang = 'python'
        else if (['.rs'].includes(ext)) lang = 'rust'
        else if (['.go'].includes(ext)) lang = 'go'

        if (lang) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            const skel = createModuleSkeleton(relPath, content, lang, options)
            skeletons.push(skel)
          } catch {
            // ignore unreadable
          }
        }
      }
    }
  }

  walk(rootDir)

  const projectName = path.basename(path.resolve(rootDir))
  const markdown = buildSubsystemSourceDocument(projectName, skeletons, `Automated architectural skeleton extraction for ${projectName}`)
  const totalOriginal = skeletons.reduce((acc, s) => acc + s.originalLines, 0)
  const totalSkeleton = skeletons.reduce((acc, s) => acc + s.skeletonLines, 0)
  const savings = totalOriginal > 0 ? (totalOriginal - totalSkeleton) / totalOriginal : 0

  return {
    markdown,
    totalOriginalLines: totalOriginal,
    totalSkeletonLines: totalSkeleton,
    overallTokenSavings: savings,
    filesProcessed: skeletons.length,
  }
}

