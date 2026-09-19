#!/usr/bin/env node
/**
 * Codebase Preparation & Skeletonization CLI
 *
 * Scans a code repository, filters out noise, extracts architectural skeletons
 * (interfaces, types, class/function signatures, docstrings), and produces
 * high-density Markdown sources ready to be ingested into LLM Wiki.
 *
 * Usage:
 *   node scripts/codebase-prep.mjs <repo-path> [options]
 *
 * Options:
 *   --output <dir>       Target output directory (default: <repo-path>/raw/sources/codebase)
 *   --max-lines <n>      Max lines per source file before truncation (default: 500)
 *   --help               Show this help message
 */

import fs from "node:fs"
import path from "node:path"

const DEFAULT_IGNORED = [
  /^[.](git|svn|hg|github|vscode|idea)($|[\\/])/i,
  /(^|[\\/])(node_modules|dist|build|target|out|coverage|__pycache__|[.]next|[.]nuxt|venv|[.]venv|env)[\\/]/i,
  /(^|[\\/])(package-lock[.]json|yarn[.]lock|pnpm-lock[.]yaml|cargo[.]lock|poetry[.]lock|composer[.]lock)$/i,
  /[.](min[.]js|min[.]css|map|bundle[.]js|d[.]ts[.]map)$/i,
  /[.](png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|tar|gz|exe|dll|dylib|so|bin|woff|woff2|ttf|eot)$/i,
]

const EXT_LANG_MAP = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".sql": "sql",
  ".sh": "bash",
}

function shouldIgnore(relPath) {
  const norm = relPath.replace(/\\/g, "/")
  return DEFAULT_IGNORED.some((re) => re.test(norm))
}

function isPreservedOpening(trimmedStmt) {
  if (
    /^(import|export)\b/.test(trimmedStmt) &&
    !/\b(function)\b/.test(trimmedStmt) &&
    !/[)=]\s*$/.test(trimmedStmt)
  ) {
    return true
  }
  if (/\b(interface|type|enum|struct|class|impl|trait)\b/.test(trimmedStmt)) {
    return true
  }
  if (trimmedStmt.endsWith("=")) {
    return true
  }
  return false
}

function stripBraces(code) {
  const result = []
  let depth = 0
  let strippedAtDepth = null
  let inString = null
  let inLineComment = false
  let inBlockComment = false
  let currentStmt = ""

  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const prevChar = i > 0 ? code[i - 1] : ""
    const nextChar = i + 1 < code.length ? code[i + 1] : ""

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        if (strippedAtDepth === null) result.push("\n")
      } else if (strippedAtDepth === null) {
        result.push(char)
      }
      continue
    }

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

    if (inString) {
      if (char === inString && prevChar !== "\\") inString = null
      if (strippedAtDepth === null) result.push(char)
      continue
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char
      if (strippedAtDepth === null) result.push(char)
      continue
    }

    if (char === "{") {
      const alreadyHasSpace = result.length > 0 && /\s$/.test(result[result.length - 1])
      const spacer = alreadyHasSpace ? "" : " "

      if (strippedAtDepth === null) {
        const trimmed = currentStmt.trim()
        if (isPreservedOpening(trimmed)) {
          result.push(`${spacer}{`)
        } else {
          strippedAtDepth = depth
          result.push(`${spacer}{ /* implementation omitted */ }`)
        }
      }
      depth++
      currentStmt = ""
      continue
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1)
      if (strippedAtDepth !== null) {
        if (depth === strippedAtDepth) {
          strippedAtDepth = null
          currentStmt = ""
        }
      } else {
        result.push("}")
        currentStmt = ""
      }
      continue
    }

    if (strippedAtDepth === null) {
      result.push(char)
      if (char === "\n" || char === ";") {
        currentStmt = ""
      } else {
        currentStmt += char
      }
    }
  }

  return cleanExtraBlankLines(result.join(""))
}

function cleanExtraBlankLines(text) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim()
}

function skeletonizePython(code) {
  const lines = code.split("\n")
  const out = []
  let inDocstring = false
  let delimiter = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!inDocstring && (trimmed.startsWith('"""') || trimmed.startsWith("'''"))) {
      delimiter = trimmed.slice(0, 3)
      out.push(line)
      if (trimmed.length > 3 && trimmed.slice(3).includes(delimiter)) {
        // inline docstring
      } else {
        inDocstring = true
      }
      continue
    }
    if (inDocstring) {
      out.push(line)
      if (trimmed.includes(delimiter)) inDocstring = false
      continue
    }

    if (!trimmed) {
      out.push("")
      continue
    }
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      out.push(line)
      continue
    }
    if (trimmed.startsWith("@") || trimmed.startsWith("class ")) {
      out.push(line)
      continue
    }
    if (trimmed.startsWith("def ") || trimmed.startsWith("async def ")) {
      let sig = line
      while (!sig.trim().endsWith(":") && i + 1 < lines.length) {
        i++
        sig += "\n" + lines[i]
      }
      const indent = line.match(/^\s*/)?.[0] ?? ""
      out.push(sig)
      out.push(`${indent}    ...`)
      continue
    }
    if (/^[A-Z][A-Z0-9_]*\s*[:=]/.test(trimmed)) {
      out.push(line)
      continue
    }
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractSkeleton(content, lang) {
  if (lang === "python") return skeletonizePython(content)
  if (["typescript", "javascript", "rust", "go", "java", "c", "cpp", "csharp"].includes(lang)) {
    return stripBraces(content)
  }
  return content
}

function scanDir(dir, baseDir = dir) {
  const files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/")

    if (shouldIgnore(relPath)) continue

    if (entry.isDirectory()) {
      files.push(...scanDir(fullPath, baseDir))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (EXT_LANG_MAP[ext]) {
        files.push({ fullPath, relPath, ext, lang: EXT_LANG_MAP[ext] })
      }
    }
  }
  return files
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Codebase Preparation & Skeletonization CLI for LLM Wiki

Usage:
  node scripts/codebase-prep.mjs <repo-directory> [options]

Options:
  --output <dir>    Output directory for skeleton markdown files
  --help            Show this help message
`)
    process.exit(0)
  }

  const repoDir = path.resolve(args[0])
  if (!fs.existsSync(repoDir)) {
    console.error(`Error: Directory "${repoDir}" does not exist.`)
    process.exit(1)
  }

  let outDir = path.join(repoDir, "raw", "sources", "codebase")
  const outIdx = args.indexOf("--output")
  if (outIdx !== -1 && args[outIdx + 1]) {
    outDir = path.resolve(args[outIdx + 1])
  }

  console.log(`Scanning repository: ${repoDir}`)
  const files = scanDir(repoDir)
  console.log(`Found ${files.length} code files. Extracting skeletons...`)

  if (files.length === 0) {
    console.log("No source files found to skeletonize.")
    process.exit(0)
  }

  // Group files by primary subsystem/directory (e.g. "src/lib", "src/components", "src-tauri")
  const groups = new Map()
  let totalOriginal = 0
  let totalSkeleton = 0

  for (const f of files) {
    let content = ""
    try {
      content = fs.readFileSync(f.fullPath, "utf8")
    } catch {
      continue
    }

    const originalLines = content.split("\n").length
    const skeleton = extractSkeleton(content, f.lang)
    const skeletonLines = skeleton.split("\n").length

    totalOriginal += originalLines
    totalSkeleton += skeletonLines

    // Determine group: first 1 or 2 path segments
    const parts = f.relPath.split("/")
    const groupKey = parts.length > 2 ? `${parts[0]}-${parts[1]}` : (parts[0] || "root")

    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push({
      relPath: f.relPath,
      lang: f.lang,
      originalLines,
      skeletonLines,
      skeleton,
    })
  }

  fs.mkdirSync(outDir, { recursive: true })

  // Write grouped subsystem files
  const manifest = [
    `# Codebase Architecture Manifest`,
    "",
    `Generated by LLM Wiki Code Skeletonizer on ${new Date().toISOString().split("T")[0]}.`,
    `Total Files: ${files.length} | Raw Lines: ${totalOriginal} | Skeleton Lines: ${totalSkeleton} (${Math.round((1 - totalSkeleton / totalOriginal) * 100)}% token reduction).`,
    "",
    `## Subsystems`,
    "",
  ]

  for (const [groupKey, groupFiles] of groups.entries()) {
    const slug = groupKey.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    const fileName = `subsystem-${slug}.md`
    const filePath = path.join(outDir, fileName)

    const docLines = [
      `# Subsystem: ${groupKey}`,
      "",
      `Contains ${groupFiles.length} modules from directory \`${groupKey}\`.`,
      "",
      `## Components`,
      "",
    ]

    for (const mod of groupFiles) {
      docLines.push(`### \`${mod.relPath}\``)
      docLines.push(`*Lines: ${mod.skeletonLines} (original: ${mod.originalLines})*`)
      docLines.push("")
      docLines.push("```" + mod.lang)
      docLines.push(mod.skeleton)
      docLines.push("```")
      docLines.push("")
    }

    fs.writeFileSync(filePath, docLines.join("\n"), "utf8")
    manifest.push(`- **[[subsystem-${slug}]]** — ${groupFiles.length} files in \`${groupKey}\``)
    console.log(`  ✓ Generated: ${fileName} (${groupFiles.length} files)`)
  }

  const manifestPath = path.join(outDir, "codebase-manifest.md")
  fs.writeFileSync(manifestPath, manifest.join("\n"), "utf8")
  console.log(`  ✓ Generated: codebase-manifest.md`)

  const savingsPct = Math.round((1 - totalSkeleton / totalOriginal) * 100)
  console.log(`\nDone! Prepared ${groups.size} subsystem documents in:\n  ${outDir}`)
  console.log(`Compression: ${totalOriginal} lines -> ${totalSkeleton} lines (${savingsPct}% token reduction)`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
