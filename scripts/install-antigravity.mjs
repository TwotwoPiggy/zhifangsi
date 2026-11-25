#!/usr/bin/env node

// 职方司 (zhifangsi) - 跨环境安装与配置集成器 (支持 NPM 全局 / npx / 本地源码)
//
// 作用：
// 1. Antigravity 全局：注册 Skills (~/.gemini/antigravity/skills/)、MCP 配置与延迟加载工具 Schema
// 2. VS Code Copilot 全局 (--copilot / --vscode --global)：
//    - 注册全套 Agent Skills (~/.copilot/skills/)，自动按需加载并暴露 /zhifangsi* 斜杠命令
//    - 注入全局 Custom Instructions (~/.copilot/instructions/zhifangsi.instructions.md)
//    - 注入 Copilot Harness 全局 MCP 配置 (~/.copilot/mcp-config.json)
//    - 可选 --vscode-profile / --legacy-mcp 额外同步经典 VS Code User Profile (Code/User/mcp.json & prompts/)
// 3. 工作区级 IDE 集成 (--vscode / --copilot --local / --qoder / --claude / --cursor) 及一键卸载 (--uninstall)

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function getPackageVersion(root = projectRoot) {
  try {
    const pkgPath = path.join(root, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '1.1.2'
  } catch {
    return '1.1.2'
  }
}

function normalizePathKey(p) {
  const resolved = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function resolveHomeDir(customHomeDir) {
  if (customHomeDir) return path.resolve(customHomeDir)
  if (process.env.ZHIFANGSI_HOME_DIR) return path.resolve(process.env.ZHIFANGSI_HOME_DIR)
  return process.env.USERPROFILE || process.env.HOME || os.homedir() || ''
}

export function resolveCopilotHome(customHomeDir, customCopilotHome) {
  if (customCopilotHome) return path.resolve(customCopilotHome)
  if (process.env.ZHIFANGSI_COPILOT_HOME) return path.resolve(process.env.ZHIFANGSI_COPILOT_HOME)
  const isSandboxedHome = Boolean(customHomeDir || process.env.ZHIFANGSI_HOME_DIR)
  if (!isSandboxedHome && process.env.COPILOT_HOME) {
    return path.resolve(process.env.COPILOT_HOME)
  }
  return path.join(resolveHomeDir(customHomeDir), '.copilot')
}

export function resolveVscodeUserDir(customHomeDir, customVscodeUserDir) {
  if (customVscodeUserDir) return path.resolve(customVscodeUserDir)
  if (process.env.ZHIFANGSI_VSCODE_USER_DIR) return path.resolve(process.env.ZHIFANGSI_VSCODE_USER_DIR)
  const isSandboxedHome = Boolean(customHomeDir || process.env.ZHIFANGSI_HOME_DIR)
  const homeDir = resolveHomeDir(customHomeDir)
  if (process.platform === 'win32') {
    if (!isSandboxedHome && process.env.APPDATA) {
      return path.join(process.env.APPDATA, 'Code', 'User')
    }
    return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User')
  }
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User')
  }
  return path.join(homeDir, '.config', 'Code', 'User')
}

export function getInstallManifestPath(customHomeDir) {
  if (process.env.ZHIFANGSI_INSTALL_MANIFEST) {
    return path.resolve(process.env.ZHIFANGSI_INSTALL_MANIFEST)
  }
  const homeDir = resolveHomeDir(customHomeDir)
  return path.join(homeDir, '.zhifangsi', 'install-manifest.json')
}

export function getAntigravityManifestPath(customHomeDir) {
  const homeDir = resolveHomeDir(customHomeDir)
  return path.join(homeDir, '.gemini', 'antigravity', 'zhifangsi', 'install-manifest.json')
}

export function loadInstallManifest(customHomeDir) {
  const manifestPath = getInstallManifestPath(customHomeDir)
  const fallback = {
    version: getPackageVersion(),
    updatedAt: '',
    source: projectRoot,
    runtimes: {},
    workspaces: [],
  }
  if (!fs.existsSync(manifestPath)) {
    return fallback
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    return {
      version: parsed.version || fallback.version,
      updatedAt: parsed.updatedAt || '',
      source: parsed.source || projectRoot,
      runtimes: parsed.runtimes && typeof parsed.runtimes === 'object' ? parsed.runtimes : {},
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
    }
  } catch {
    return fallback
  }
}

function saveInstallManifest(manifest, customHomeDir) {
  const manifestPath = getInstallManifestPath(customHomeDir)
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  return manifestPath
}

function upsertWorkspaceRecord(manifest, record) {
  const key = `${record.runtime}:${normalizePathKey(record.cwd)}`
  const existingIdx = manifest.workspaces.findIndex(
    (w) => `${w.runtime}:${normalizePathKey(w.cwd)}` === key
  )
  if (existingIdx >= 0) {
    manifest.workspaces[existingIdx] = record
  } else {
    manifest.workspaces.push(record)
  }
}

function removeWorkspaceRecord(manifest, runtime, cwd) {
  const key = `${runtime}:${normalizePathKey(cwd)}`
  manifest.workspaces = manifest.workspaces.filter(
    (w) => `${w.runtime}:${normalizePathKey(w.cwd)}` !== key
  )
}

/**
 * 兼容 VS Code JSONC（含行注释、块注释、尾随逗号）的安全 JSON 对象解析
 */
export function parseJsoncObject(raw, fallback = {}) {
  if (!raw || typeof raw !== 'string') return { ...fallback }
  const trimmed = raw.trim()
  if (!trimmed) return { ...fallback }

  try {
    const direct = JSON.parse(trimmed)
    return direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : { ...fallback }
  } catch {
    // 尝试剥离 JSONC 注释与尾随逗号
  }

  let out = ''
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    const next = trimmed[i + 1]

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        out += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
    } else if (ch === '/' && next === '/') {
      inLineComment = true
      i++
    } else if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
    } else {
      out += ch
    }
  }

  // 移除字符串外的尾随逗号（如 , } 或 , ]）
  const cleaned = out.replace(/,(\s*[}\]])/g, '$1')
  try {
    const parsed = JSON.parse(cleaned)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { ...fallback }
  } catch {
    return { ...fallback }
  }
}

function upsertServerInJsonFile(filePath, rootKey, serverName, serverEntry) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  let cfg = { [rootKey]: {} }
  if (fs.existsSync(filePath)) {
    try {
      cfg = parseJsoncObject(fs.readFileSync(filePath, 'utf-8'), { [rootKey]: {} })
    } catch {
      cfg = { [rootKey]: {} }
    }
  }
  if (!cfg[rootKey] || typeof cfg[rootKey] !== 'object' || Array.isArray(cfg[rootKey])) {
    cfg[rootKey] = {}
  }
  cfg[rootKey][serverName] = serverEntry
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8')
}

function removeServerFromJsonFile(filePath, rootKey, serverName) {
  if (!fs.existsSync(filePath)) return false
  try {
    const cfg = parseJsoncObject(fs.readFileSync(filePath, 'utf-8'), {})
    if (cfg[rootKey] && cfg[rootKey][serverName]) {
      delete cfg[rootKey][serverName]
      fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8')
      return true
    }
  } catch {
    // ignore invalid json
  }
  return false
}

function collectBuiltinSkillNames(pkgRoot) {
  const names = new Set(['zhifangsi'])
  const skillsSourceFolder = path.join(pkgRoot, 'skills')
  if (fs.existsSync(skillsSourceFolder)) {
    for (const entry of fs.readdirSync(skillsSourceFolder, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(skillsSourceFolder, entry.name, 'SKILL.md'))) {
        names.add(entry.name)
      }
    }
  }
  return names
}

function syncSkillsDirectory(pkgRoot, targetSkillsBaseDir) {
  const installedSkills = []
  const skippedSymlinks = []

  const mainSkillDir = path.join(targetSkillsBaseDir, 'zhifangsi')
  const sourceMainSkill = path.join(pkgRoot, 'SKILL.md')
  if (fs.existsSync(sourceMainSkill)) {
    if (fs.existsSync(mainSkillDir) && fs.lstatSync(mainSkillDir).isSymbolicLink()) {
      skippedSymlinks.push(mainSkillDir)
    } else {
      fs.mkdirSync(mainSkillDir, { recursive: true })
      const targetMainSkill = path.join(mainSkillDir, 'SKILL.md')
      fs.copyFileSync(sourceMainSkill, targetMainSkill)
      installedSkills.push('zhifangsi')
      console.log(`   \x1b[32m✔ [主技能]\x1b[0m ${targetMainSkill} (/zhifangsi)`)
    }
  }

  const skillsSourceFolder = path.join(pkgRoot, 'skills')
  if (fs.existsSync(skillsSourceFolder)) {
    const subEntries = fs.readdirSync(skillsSourceFolder, { withFileTypes: true })
    for (const entry of subEntries) {
      if (!entry.isDirectory()) continue
      const subSkillName = entry.name
      const subSourceDir = path.join(skillsSourceFolder, subSkillName)
      const subSourceSkill = path.join(subSourceDir, 'SKILL.md')
      if (!fs.existsSync(subSourceSkill)) continue

      const subTargetDir = path.join(targetSkillsBaseDir, subSkillName)
      if (fs.existsSync(subTargetDir) && fs.lstatSync(subTargetDir).isSymbolicLink()) {
        skippedSymlinks.push(subTargetDir)
        continue
      }
      fs.mkdirSync(subTargetDir, { recursive: true })
      fs.cpSync(subSourceDir, subTargetDir, { recursive: true, force: true })
      installedSkills.push(subSkillName)
      const subTargetSkill = path.join(subTargetDir, 'SKILL.md')
      console.log(`   \x1b[32m✔ [指令技能]\x1b[0m ${subTargetSkill} (/${subSkillName})`)
    }
  }

  if (skippedSymlinks.length > 0) {
    console.log(`   \x1b[33m⚠ 已跳过符号链接技能目录 (${skippedSymlinks.length} 处)，未覆写。\x1b[0m`)
  }

  return installedSkills
}

function removeSkillsDirectory(pkgRoot, targetSkillsBaseDir, recordedSkills = []) {
  const skillSet = collectBuiltinSkillNames(pkgRoot)
  if (Array.isArray(recordedSkills)) {
    for (const s of recordedSkills) skillSet.add(s)
  }
  const removed = []
  for (const sName of skillSet) {
    const targetDir = path.join(targetSkillsBaseDir, sName)
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      removed.push(targetDir)
      console.log(`   \x1b[32m✔ 已移除技能:\x1b[0m ${targetDir}`)
    }
  }
  return removed
}

const TOOL_DEFINITIONS = [
  {
    name: 'zhifangsi_map',
    description:
      '获取并生成当前代码库的职方司全景战略舆图。包含基于 PageRank 的核心关隘文件（Hubs）、循环依赖预警、已注册模块、业务流和架构守则，支持持久化保存为 Markdown 文件。',
    parameters: {
      type: 'object',
      properties: {
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时按全局/项目配置自动解析（默认原位，支持集中外置）',
          type: 'string',
        },
        output_file: {
          description: '可选，舆图 Markdown 保存文件路径，如 CODEBASE_MAP.md',
          type: 'string',
        },
      },
    },
  },
  {
    name: 'zhifangsi_check_invariants',
    description:
      '对代码库执行架构关防守则（Invariants）静态合规检查，检测跨层越权调用、非法依赖、循环依赖及 Wiki 舆图失真（Drift），支持 status: draft 试运行。',
    parameters: {
      type: 'object',
      properties: {
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
    },
  },
  {
    name: 'zhifangsi_module_info',
    description:
      '查询特定模块的职责定义、公共 API 导出契约与深度依赖影响范围（支持模块名或目录路径）。',
    parameters: {
      type: 'object',
      properties: {
        module_name: {
          description: '模块名称或源码子目录，如 ast、invariants、src/bridge',
          type: 'string',
        },
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
      required: ['module_name'],
    },
  },
  {
    name: 'zhifangsi_workflow_trace',
    description: '追踪特定业务流的端到端调用时序与阶段步骤。',
    parameters: {
      type: 'object',
      properties: {
        workflow_name: {
          description: '业务流名称，如 ingest-pipeline 或 search-flow',
          type: 'string',
        },
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
      required: ['workflow_name'],
    },
  },
  {
    name: 'zhifangsi_search',
    description:
      '在代码库知识舆图中检索。若 LLM Wiki 桌面端在线则调用 LanceDB 混合检索，离线时自动回退到本地 Wiki + AST 导出符号混合检索。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          description: '检索关键词、符号名或意图描述',
          type: 'string',
        },
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'zhifangsi_bridge_status',
    description: '检查与 LLM Wiki 桌面端（127.0.0.1:19828）的桥接协同状态。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'zhifangsi_skeleton',
    description:
      '基于局部性原理（Inline & Spill）提取代码高信息密度骨架（85%+ Token 降噪）。指定 target 时内联该文件/模块骨架与 1 跳邻居契约，未指定时提取全库骨架。',
    parameters: {
      type: 'object',
      properties: {
        target: {
          description:
            '可选，目标文件路径或模块名（如 src/ast/parser.ts 或 ast）；省略则提取全库骨架',
          type: 'string',
        },
        hops: {
          description: '可选，局部邻域展开跳数，默认为 1',
          type: 'number',
        },
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
    },
  },
  {
    name: 'zhifangsi_impact',
    description:
      '评估拟修改文件的变更爆炸半径、波及模块、建议回归验证的业务流水线（Workflows），并检测是否触碰高 PageRank 核心关隘以防多 Worker 并发撞车。',
    parameters: {
      type: 'object',
      properties: {
        files: {
          description: '拟修改的文件路径或模块名称列表',
          type: 'array',
          items: { type: 'string' },
        },
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'zhifangsi_init',
    description:
      '一键初始化项目架构知识库并接入 LLM Wiki：自动完成目录骨架初始化 (schema.md / wiki/)、AST 模块聚类建档 (wiki/modules/*.md)、CODEBASE_MAP.md 测绘/抄送、高密度子系统代码骨架提取 (raw/sources/codebase/)，并自动探测 LLM Wiki 桌面端状态（已挂载则自动同步向量库，未挂载则给出精准挂载目录）。',
    parameters: {
      type: 'object',
      properties: {
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时按全局/项目配置自动解析',
          type: 'string',
        },
        storage_mode: {
          description: '可选，指定存储模式：local（原位 <repo>/wiki）或 centralized（集中外置不污染业务仓）',
          type: 'string',
          enum: ['local', 'centralized'],
        },
        vault_dir: {
          description: '可选，集中外置模式的 Vault 根目录',
          type: 'string',
        },
        force: {
          description: '是否覆盖已存在的架构文件与骨架，默认为 false',
          type: 'boolean',
        },
        bootstrap: {
          description: '是否同时执行 AST 聚类生成 wiki/modules/*.md，默认为 true',
          type: 'boolean',
        },
        prep_sources: {
          description: '是否提取子系统代码骨架并抄送 CODEBASE_MAP.md 到 raw/sources/，默认为 true',
          type: 'boolean',
        },
        generate_map: {
          description: '若尚无 CODEBASE_MAP.md（或 force=true），是否顺带测绘生成，默认为 true',
          type: 'boolean',
        },
        auto_sync: {
          description: '若 LLM Wiki 桌面端在线且项目已挂载，是否自动推送向量索引，默认为 true',
          type: 'boolean',
        },
      },
    },
  },
  {
    name: 'zhifangsi_bootstrap',
    description:
      '存量代码库冷启动自动建档：基于 AST 目录拓扑自动聚类生成 wiki/modules/*.md 模块档案（含核心入口、导出 API 签名契约与跨模块双链依赖）。',
    parameters: {
      type: 'object',
      properties: {
        target_dir: {
          description: '代码库根路径，缺省为当前工作目录',
          type: 'string',
        },
        wiki_dir: {
          description: '可选，自定义知识库 wiki 目录路径；缺省时自动按配置解析',
          type: 'string',
        },
        force: {
          description: '是否覆盖已存在的模块档案，默认为 false',
          type: 'boolean',
        },
      },
    },
  },
  {
    name: 'zhifangsi_repos',
    description:
      '查询 L1 跨项目路由注册表（仅返回各项目的轻量名片：slug、源码路径、Wiki 路径、职责摘要与模块名，不加载完整 Wiki）。适用于 Super-agent Router 层先定位目标 Repo，再派发 Worker 进入目标 Repo 查 Wiki 与源码。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          description: '可选，按项目名、职责、技术栈、模块名或关键词筛选目标 Repo',
          type: 'string',
        },
        vault_dir: {
          description: '可选，指定集中外置 Vault 根目录（缺省使用全局配置）',
          type: 'string',
        },
      },
    },
  },
]

const INSTRUCTIONS_CONTENT = `# 兵部职方司 (Zhifangsi) MCP 工具使用指南

职方司为代码库战略舆图与架构自愈引擎，专精于代码库静态拓扑、核心关隘识别与架构不变量守则核验。支持默认原位（\`<repo>/wiki\`）与集中外置双存储模式。

## 核心工具使用时机
0. **跨项目 L1 路由寻址（Super-agent Router 层）**：调用 \`zhifangsi_repos\` 仅检索轻量项目名片以定位目标 Repo 与 Wiki 路径，绝不预加载各 Repo 完整 Wiki。
1. **一键初始化与接入 LLM Wiki**：调用 \`zhifangsi_init\` 一站式完成 \`schema.md\`/\`wiki/\` 初始化、AST 模块聚类建档、代码骨架源预处理与 LLM Wiki 桌面端探测同步。
2. **全局架构探索**：调用 \`zhifangsi_map\` 快速测绘工程全景，获取 PageRank 权重最高的枢纽文件、循环依赖预警、已注册模块与守则状态。
3. **存量工程冷启动建档**：调用 \`zhifangsi_bootstrap\` 单独基于 AST 目录拓扑生成或刷新 \`wiki/modules/*.md\` 模块档案。
4. **局部邻域高密骨架（Inline & Spill）**：调用 \`zhifangsi_skeleton\` 传入 \`target\` 获取目标文件/模块骨架与 1 跳邻居契约，节省 85%+ Token。
5. **变更爆炸半径与防撞车评估**：修改代码前调用 \`zhifangsi_impact\` 传入拟改文件，获取波及模块、需回归测试的业务流及 Top Hub 高危预警。
6. **重构与边界守则校验**：修改或提交前调用 \`zhifangsi_check_invariants\` 拦截跨层越权调用、循环依赖与 Wiki 舆图失真。
7. **模块深入洞察**：调用 \`zhifangsi_module_info\` 查看特定模块的导出 API 契约与上下游影响闭包。
8. **业务流水线时序**：调用 \`zhifangsi_workflow_trace\` 追踪多步骤调用链。
9. **架构知识与符号检索**：调用 \`zhifangsi_search\` 在架构 Wiki 与 AST 导出符号表中混合检索。
`

export const COPILOT_INSTRUCTIONS_CONTENT = `---
name: zhifangsi
description: 兵部职方司代码库战略舆图、局部邻域骨架、变更爆炸半径与架构守则 MCP 工具指南
applyTo: '**'
---

# 兵部职方司 (Zhifangsi) — VS Code Copilot 协作指南

当前环境已集成 **兵部职方司 (zhifangsi)** MCP 军机工具集与 Agent Skills。在分析大型代码库、规划重构或修改核心代码前，优先使用职方司工具以节省上下文 Token 并防越权/撞车：

## 何时主动调用 \`zhifangsi_*\` MCP 工具
- **跨项目寻址（L1 路由）**：先调用 \`zhifangsi_repos\` 定位目标仓库与 Wiki 路径，避免盲扫多仓库。
- **首次接入/初始化知识库**：调用 \`zhifangsi_init\` 一键初始化 \`schema.md\` / \`wiki/\`、AST 模块建档与代码骨架。
- **全局架构摸底**：调用 \`zhifangsi_map\` 获取 PageRank 核心关隘（Hubs）、循环依赖预警、已注册模块与守则状态。
- **低 Token 阅读模块契约**：调用 \`zhifangsi_skeleton\`（传 \`target\`）提取目标文件/模块与 1 跳邻居骨架，可节省 85%+ Token。
- **改前爆炸半径评估**：修改核心文件前调用 \`zhifangsi_impact\`，识别直接/深层调用方、受波及模块与回归业务流。
- **改后/提交前架构守则巡检**：调用 \`zhifangsi_check_invariants\` 拦截跨层越权调用、循环依赖与 Wiki 舆图失真（Drift）。
- **模块/业务流/符号检索**：按需调用 \`zhifangsi_module_info\`、\`zhifangsi_workflow_trace\`、\`zhifangsi_search\`、\`zhifangsi_bootstrap\`、\`zhifangsi_bridge_status\`。

> 提示：调用 \`zhifangsi_*\` 工具时，建议显式传入当前工作区根路径作为 \`target_dir\`（若省略将自动通过 MCP Roots 或当前工作目录解析）。

## 可用斜杠技能（Agent Skills）
- \`/zhifangsi\`：职方司总控与架构分析
- \`/zhifangsi-init\`：一键初始化项目架构知识库与 LLM Wiki 接入
- \`/zhifangsi-map\`：测绘并持久化生成 \`CODEBASE_MAP.md\`
- \`/zhifangsi-check\`：关防守则、循环依赖与舆图失真静态巡检
- \`/zhifangsi-skeleton\`：提取高信息密度代码骨架
- \`/zhifangsi-trace\`：追踪核心业务流水线调用时序
- \`/zhifangsi-sync\`：增量同步本地架构 Wiki 至 LLM Wiki 桌面端
- \`/zhifangsi-update\`：检查并升级职方司及多宿主配置
`

export function runInstaller(rawArgs = [], options = {}) {
  const pkgRoot = options.projectRoot ? path.resolve(options.projectRoot) : projectRoot
  const version = getPackageVersion(pkgRoot)
  const homeDir = resolveHomeDir(options.homeDir)
  if (!homeDir) {
    console.error('\x1b[31m[错误]\x1b[0m 无法获取当前用户主目录 (USERPROFILE/HOME)。')
    process.exit(1)
  }

  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()
  const copilotHome = resolveCopilotHome(options.homeDir, options.copilotHome)
  const vscodeUserDir = resolveVscodeUserDir(options.homeDir, options.vscodeUserDir)

  const isUninstall = rawArgs.includes('--uninstall') || rawArgs.includes('-u')
  const hasGlobal = rawArgs.includes('--global') || rawArgs.includes('-g')
  const hasLocal = rawArgs.includes('--local') || rawArgs.includes('-l')
  const hasAll = rawArgs.includes('--all')
  const hasAntigravityFlag = rawArgs.includes('--antigravity')
  const hasCopilotFlag = rawArgs.includes('--copilot') || rawArgs.includes('--vscode-copilot')
  const hasVscodeFlag = rawArgs.includes('--vscode')
  const hasVscodeProfileFlag =
    rawArgs.includes('--vscode-profile') || rawArgs.includes('--legacy-mcp')
  const hasQoderFlag = rawArgs.includes('--qoder')
  const hasClaudeFlag = rawArgs.includes('--claude')
  const hasCursorFlag = rawArgs.includes('--cursor')

  const hasExplicitTarget =
    hasAll ||
    hasAntigravityFlag ||
    hasCopilotFlag ||
    hasVscodeFlag ||
    hasQoderFlag ||
    hasClaudeFlag ||
    hasCursorFlag

  const wantCopilotGlobal =
    hasAll ||
    (hasCopilotFlag && (!hasLocal || hasGlobal)) ||
    (hasVscodeFlag && hasGlobal)
  const wantVscodeWorkspace =
    hasAll ||
    (hasVscodeFlag && (!hasGlobal || hasLocal)) ||
    (hasCopilotFlag && hasLocal)
  const wantQoder = hasQoderFlag || hasClaudeFlag || hasAll
  const qoderOrClaudeRuntime = hasClaudeFlag && !hasQoderFlag ? 'claude' : 'qoder'
  const wantCursor = hasCursorFlag || hasAll
  const wantAntigravity = hasAll || hasAntigravityFlag || !hasExplicitTarget

  const geminiRoot = path.join(homeDir, '.gemini')
  const skillsBaseDir = path.join(geminiRoot, 'antigravity', 'skills')
  const mcpSchemaDir = path.join(geminiRoot, 'antigravity', 'mcp', 'zhifangsi')
  const antigravityManifestPath = getAntigravityManifestPath(homeDir)
  const mcpConfigFiles = [
    path.join(geminiRoot, 'config', 'mcp_config.json'),
    path.join(geminiRoot, 'antigravity', 'mcp_config.json'),
  ]

  const copilotSkillsDir = path.join(copilotHome, 'skills')
  const copilotInstructionsFile = path.join(copilotHome, 'instructions', 'zhifangsi.instructions.md')
  const copilotMcpConfigFile = path.join(copilotHome, 'mcp-config.json')
  const vscodeUserMcpFile = path.join(vscodeUserDir, 'mcp.json')
  const vscodeUserInstructionsFile = path.join(vscodeUserDir, 'prompts', 'zhifangsi.instructions.md')

  const mcpServerScript = path.join(pkgRoot, 'dist', 'mcp', 'server.js')
  const nodePath = process.execPath
  const manifest = loadInstallManifest(homeDir)
  const nowIso = new Date().toISOString()

  if (isUninstall) {
    console.log(`\x1b[36m[职方司]\x1b[0m 正在卸载职方司 (zhifangsi v${version}) 集成配置...\n`)

    const shouldUninstallCopilotGlobal =
      wantCopilotGlobal ||
      (!hasExplicitTarget &&
        (Boolean(manifest.runtimes?.copilot) ||
          fs.existsSync(path.join(copilotSkillsDir, 'zhifangsi')) ||
          fs.existsSync(copilotInstructionsFile)))

    if (wantAntigravity) {
      // 1. 移除 Skills（合并源码目录与已记录清单，防止漏删旧版本子技能）
      removeSkillsDirectory(pkgRoot, skillsBaseDir, manifest.runtimes?.antigravity?.skills)

      // 2. 移除 MCP Config
      for (const cfgFile of mcpConfigFiles) {
        if (removeServerFromJsonFile(cfgFile, 'mcpServers', 'zhifangsi')) {
          console.log(`   \x1b[32m✔ 已清理 MCP 配置:\x1b[0m ${cfgFile}`)
        }
      }

      // 3. 移除 MCP Schema
      if (fs.existsSync(mcpSchemaDir)) {
        fs.rmSync(mcpSchemaDir, { recursive: true, force: true })
        console.log(`   \x1b[32m✔ 已移除 MCP Schema 目录:\x1b[0m ${mcpSchemaDir}`)
      }

      // 4. 移除 Antigravity 安装凭证
      if (fs.existsSync(antigravityManifestPath)) {
        fs.rmSync(path.dirname(antigravityManifestPath), { recursive: true, force: true })
        console.log(`   \x1b[32m✔ 已移除安装清单:\x1b[0m ${antigravityManifestPath}`)
      }
      delete manifest.runtimes.antigravity
    }

    if (shouldUninstallCopilotGlobal) {
      const prevCopilot = manifest.runtimes?.copilot
      const targetCopilotHome = prevCopilot?.copilotHome || copilotHome
      const targetCopilotSkillsDir = path.join(targetCopilotHome, 'skills')
      const targetCopilotInstructions =
        prevCopilot?.instructionsFile ||
        path.join(targetCopilotHome, 'instructions', 'zhifangsi.instructions.md')
      const targetCopilotMcp =
        prevCopilot?.mcpConfigFile || path.join(targetCopilotHome, 'mcp-config.json')

      removeSkillsDirectory(pkgRoot, targetCopilotSkillsDir, prevCopilot?.skills)

      if (fs.existsSync(targetCopilotInstructions)) {
        fs.unlinkSync(targetCopilotInstructions)
        console.log(`   \x1b[32m✔ [VS Code Copilot]\x1b[0m 已移除全局指令: ${targetCopilotInstructions}`)
      }

      if (removeServerFromJsonFile(targetCopilotMcp, 'mcpServers', 'zhifangsi')) {
        console.log(`   \x1b[32m✔ [VS Code Copilot]\x1b[0m 已清理全局 MCP 配置: ${targetCopilotMcp}`)
      }

      const targetVscodeUserDir = prevCopilot?.vscodeUserDir || vscodeUserDir
      const legacyMcp = path.join(targetVscodeUserDir, 'mcp.json')
      const legacyInstructions = path.join(targetVscodeUserDir, 'prompts', 'zhifangsi.instructions.md')
      if (hasVscodeProfileFlag || prevCopilot?.legacyProfileEnabled) {
        if (removeServerFromJsonFile(legacyMcp, 'servers', 'zhifangsi')) {
          console.log(`   \x1b[32m✔ [VS Code Profile]\x1b[0m 已清理兼容 MCP 配置: ${legacyMcp}`)
        }
        if (fs.existsSync(legacyInstructions)) {
          fs.unlinkSync(legacyInstructions)
          console.log(`   \x1b[32m✔ [VS Code Profile]\x1b[0m 已移除兼容指令: ${legacyInstructions}`)
        }
      }

      delete manifest.runtimes.copilot
    }

    if (wantVscodeWorkspace) {
      const vscodeMcpFile = path.join(cwd, '.vscode', 'mcp.json')
      const wsSkillsDir = path.join(cwd, '.github', 'skills')
      const wsInstructionsFile = path.join(cwd, '.github', 'instructions', 'zhifangsi.instructions.md')
      const wsRecord = manifest.workspaces.find(
        (w) => w.runtime === 'vscode' && normalizePathKey(w.cwd) === normalizePathKey(cwd)
      )

      if (removeServerFromJsonFile(vscodeMcpFile, 'servers', 'zhifangsi')) {
        console.log(`   \x1b[32m✔ [VS Code]\x1b[0m 已清理 ${vscodeMcpFile}`)
      }
      removeSkillsDirectory(pkgRoot, wsSkillsDir, wsRecord?.skills)
      if (fs.existsSync(wsInstructionsFile)) {
        fs.unlinkSync(wsInstructionsFile)
        console.log(`   \x1b[32m✔ [VS Code]\x1b[0m 已移除工作区指令: ${wsInstructionsFile}`)
      }
      removeWorkspaceRecord(manifest, 'vscode', cwd)
    }

    if (wantQoder) {
      const qoderMcpFile = path.join(cwd, '.mcp.json')
      if (removeServerFromJsonFile(qoderMcpFile, 'mcpServers', 'zhifangsi')) {
        console.log(`   \x1b[32m✔ [Qoder / Claude]\x1b[0m 已清理 ${qoderMcpFile}`)
      }
      removeWorkspaceRecord(manifest, 'qoder', cwd)
      removeWorkspaceRecord(manifest, 'claude', cwd)
    }

    if (wantCursor) {
      const cursorMcpFile = path.join(cwd, '.cursor', 'mcp.json')
      if (removeServerFromJsonFile(cursorMcpFile, 'mcpServers', 'zhifangsi')) {
        console.log(`   \x1b[32m✔ [Cursor]\x1b[0m 已清理 ${cursorMcpFile}`)
      }
      removeWorkspaceRecord(manifest, 'cursor', cwd)
    }

    const globalManifestPath = getInstallManifestPath(homeDir)
    if (
      Object.keys(manifest.runtimes).length === 0 &&
      manifest.workspaces.length === 0
    ) {
      if (fs.existsSync(globalManifestPath)) {
        fs.unlinkSync(globalManifestPath)
      }
    } else {
      manifest.version = version
      manifest.updatedAt = nowIso
      saveInstallManifest(manifest, homeDir)
    }

    console.log(`\n\x1b[32m✔ 职方司 (zhifangsi) 卸载完成。\x1b[0m`)
    return {
      version,
      uninstalled: true,
      installedRuntimes: Object.keys(manifest.runtimes),
      installedWorkspaces: manifest.workspaces,
      manifestPath: globalManifestPath,
    }
  }

  console.log(`\x1b[36m[职方司]\x1b[0m 开始安装与注册职方司引擎 (v${version})...\n`)

  // 0. 检查并编译产物
  if (
    !options.skipBuild &&
    !fs.existsSync(mcpServerScript) &&
    fs.existsSync(path.join(pkgRoot, 'tsconfig.json'))
  ) {
    console.log('\x1b[33m[提示]\x1b[0m 正在编译 TypeScript 产物 (dist/)...')
    execSync('npm run build', { cwd: pkgRoot, stdio: 'inherit' })
  }

  const installedRuntimes = []
  const installedWorkspaces = []

  if (wantAntigravity) {
    // 1. 安装 Skill 技能（主技能与专项子技能）
    console.log(`1. 正在同步 Antigravity 技能组 (Skills)...`)
    let installedSkills = []
    try {
      installedSkills = syncSkillsDirectory(pkgRoot, skillsBaseDir)
    } catch (err) {
      console.error(`   \x1b[31m✖ 部署技能组失败:\x1b[0m`, err)
    }

    // 2. 注入 MCP Server 启动配置
    console.log(`\n2. 正在配置 Antigravity MCP Server...`)
    for (const cfgFile of mcpConfigFiles) {
      try {
        upsertServerInJsonFile(cfgFile, 'mcpServers', 'zhifangsi', {
          command: nodePath,
          args: [mcpServerScript],
        })
        console.log(`   \x1b[32m✔ MCP 配置已同步:\x1b[0m ${cfgFile}`)
      } catch (err) {
        console.error(`   \x1b[31m✖ 写入配置失败 (${cfgFile}):\x1b[0m`, err)
      }
    }

    // 3. 部署 MCP 延迟加载工具定义 (Lazy Tool Schemas)
    console.log(`\n3. 正在生成 Antigravity MCP 延迟加载工具 Schema (${mcpSchemaDir})...`)
    try {
      fs.mkdirSync(mcpSchemaDir, { recursive: true })
      for (const tool of TOOL_DEFINITIONS) {
        const file = path.join(mcpSchemaDir, `${tool.name}.json`)
        fs.writeFileSync(file, JSON.stringify(tool, null, 2), 'utf-8')
      }
      fs.writeFileSync(path.join(mcpSchemaDir, 'instructions.md'), INSTRUCTIONS_CONTENT, 'utf-8')
      console.log(`   \x1b[32m✔ ${TOOL_DEFINITIONS.length} 大 MCP 工具 Schema 与使用指南生成完毕！\x1b[0m`)
    } catch (err) {
      console.error(`   \x1b[31m✖ 生成 MCP Schema 失败:\x1b[0m`, err)
    }

    // 3.5 写入 Antigravity 安装凭证 (对齐 yongle-dadian install-manifest.json 规范)
    const antigravityRecord = {
      version,
      installed_at: nowIso,
      source: pkgRoot,
      runtime: 'antigravity',
      scope: 'global',
      skills: installedSkills,
      mcp_tools: TOOL_DEFINITIONS.map((t) => t.name),
    }
    try {
      fs.mkdirSync(path.dirname(antigravityManifestPath), { recursive: true })
      fs.writeFileSync(
        antigravityManifestPath,
        JSON.stringify(antigravityRecord, null, 2) + '\n',
        'utf-8'
      )
      manifest.runtimes.antigravity = antigravityRecord
      installedRuntimes.push('antigravity')
    } catch (err) {
      console.error(`   \x1b[31m✖ 写入 Antigravity 安装清单失败:\x1b[0m`, err)
    }
  }

  // 3.8 VS Code Copilot 全局安装（Copilot Harness 标准 + 可选经典 User Profile 兼容）
  if (wantCopilotGlobal) {
    console.log(`\n[VS Code Copilot] 正在同步全局 Agent Skills、Custom Instructions 与 MCP 配置...`)
    let copilotSkills = []
    try {
      copilotSkills = syncSkillsDirectory(pkgRoot, copilotSkillsDir)
    } catch (err) {
      console.error(`   \x1b[31m✖ 部署 Copilot Agent Skills 失败:\x1b[0m`, err)
    }

    try {
      fs.mkdirSync(path.dirname(copilotInstructionsFile), { recursive: true })
      fs.writeFileSync(copilotInstructionsFile, COPILOT_INSTRUCTIONS_CONTENT, 'utf-8')
      console.log(`   \x1b[32m✔ [全局指令]\x1b[0m ${copilotInstructionsFile}`)
    } catch (err) {
      console.error(`   \x1b[31m✖ 写入 Copilot 全局指令失败:\x1b[0m`, err)
    }

    try {
      upsertServerInJsonFile(copilotMcpConfigFile, 'mcpServers', 'zhifangsi', {
        type: 'local',
        command: nodePath,
        args: [mcpServerScript],
        tools: ['*'],
      })
      console.log(`   \x1b[32m✔ [Copilot MCP]\x1b[0m ${copilotMcpConfigFile}`)
    } catch (err) {
      console.error(`   \x1b[31m✖ 写入 Copilot MCP 配置失败:\x1b[0m`, err)
    }

    const legacyProfileEnabled =
      hasVscodeProfileFlag || Boolean(manifest.runtimes?.copilot?.legacyProfileEnabled)
    if (legacyProfileEnabled) {
      try {
        upsertServerInJsonFile(vscodeUserMcpFile, 'servers', 'zhifangsi', {
          type: 'stdio',
          command: nodePath,
          args: [mcpServerScript],
        })
        fs.mkdirSync(path.dirname(vscodeUserInstructionsFile), { recursive: true })
        fs.writeFileSync(vscodeUserInstructionsFile, COPILOT_INSTRUCTIONS_CONTENT, 'utf-8')
        console.log(`   \x1b[32m✔ [VS Code User Profile 兼容]\x1b[0m ${vscodeUserMcpFile}`)
        console.log(`   \x1b[32m✔ [VS Code User Profile 指令]\x1b[0m ${vscodeUserInstructionsFile}`)
      } catch (err) {
        console.error(`   \x1b[31m✖ 写入经典 VS Code User Profile 配置失败:\x1b[0m`, err)
      }
    }

    manifest.runtimes.copilot = {
      version,
      installed_at: nowIso,
      source: pkgRoot,
      runtime: 'copilot',
      scope: 'global',
      copilotHome,
      skillsDir: copilotSkillsDir,
      skills: copilotSkills,
      instructionsFile: copilotInstructionsFile,
      mcpConfigFile: copilotMcpConfigFile,
      legacyProfileEnabled,
      ...(legacyProfileEnabled
        ? {
            vscodeUserDir,
            vscodeUserMcpFile,
            vscodeUserInstructionsFile,
          }
        : {}),
      mcp_tools: TOOL_DEFINITIONS.map((t) => t.name),
    }
    installedRuntimes.push('copilot')
  }

  // 4. 可选：为当前工作区注入 VS Code Copilot / Qoder / Cursor / Claude 配置
  if (wantVscodeWorkspace) {
    const vscodeMcpFile = path.join(cwd, '.vscode', 'mcp.json')
    upsertServerInJsonFile(vscodeMcpFile, 'servers', 'zhifangsi', {
      type: 'stdio',
      command: nodePath,
      args: [mcpServerScript],
    })
    console.log(`\n   \x1b[32m✔ [VS Code 工作区 MCP]\x1b[0m 已注入 ${vscodeMcpFile}`)

    // 若同时安装了全局 Copilot 且未显式传 --local，则跳过工作区 Skills/Instructions，避免 Copilot `/` 菜单重复
    const writeWorkspaceCopilotAssets = !wantCopilotGlobal || hasLocal
    let wsSkills = []
    let wsInstructionsPath = undefined
    const wsSkillsDir = path.join(cwd, '.github', 'skills')
    const wsInstructionsFile = path.join(cwd, '.github', 'instructions', 'zhifangsi.instructions.md')

    if (writeWorkspaceCopilotAssets) {
      console.log(`   \x1b[36m▸ [VS Code 工作区 Copilot]\x1b[0m 正在注入项目级 Agent Skills 与 Custom Instructions...`)
      wsSkills = syncSkillsDirectory(pkgRoot, wsSkillsDir)
      fs.mkdirSync(path.dirname(wsInstructionsFile), { recursive: true })
      fs.writeFileSync(wsInstructionsFile, COPILOT_INSTRUCTIONS_CONTENT, 'utf-8')
      wsInstructionsPath = wsInstructionsFile
      console.log(`   \x1b[32m✔ [VS Code 工作区指令]\x1b[0m ${wsInstructionsFile}`)
    }

    const rec = {
      runtime: 'vscode',
      cwd,
      configFile: vscodeMcpFile,
      ...(writeWorkspaceCopilotAssets
        ? {
            skillsDir: wsSkillsDir,
            skills: wsSkills,
            instructionsFile: wsInstructionsPath,
          }
        : {}),
      version,
      installed_at: nowIso,
    }
    upsertWorkspaceRecord(manifest, rec)
    installedWorkspaces.push(rec)
  }

  if (wantQoder) {
    const qoderMcpFile = path.join(cwd, '.mcp.json')
    upsertServerInJsonFile(qoderMcpFile, 'mcpServers', 'zhifangsi', {
      command: nodePath,
      args: [mcpServerScript],
    })
    const rec = {
      runtime: qoderOrClaudeRuntime,
      cwd,
      configFile: qoderMcpFile,
      version,
      installed_at: nowIso,
    }
    upsertWorkspaceRecord(manifest, rec)
    installedWorkspaces.push(rec)
    console.log(`\n   \x1b[32m✔ [Qoder / Claude]\x1b[0m 已注入 ${qoderMcpFile}`)
  }

  if (wantCursor) {
    const cursorMcpFile = path.join(cwd, '.cursor', 'mcp.json')
    upsertServerInJsonFile(cursorMcpFile, 'mcpServers', 'zhifangsi', {
      command: nodePath,
      args: [mcpServerScript],
    })
    const rec = {
      runtime: 'cursor',
      cwd,
      configFile: cursorMcpFile,
      version,
      installed_at: nowIso,
    }
    upsertWorkspaceRecord(manifest, rec)
    installedWorkspaces.push(rec)
    console.log(`\n   \x1b[32m✔ [Cursor]\x1b[0m 已注入 ${cursorMcpFile}`)
  }

  // 5. 持久化统一全局安装清单 (~/.zhifangsi/install-manifest.json)
  manifest.version = version
  manifest.updatedAt = nowIso
  manifest.source = pkgRoot
  const manifestPath = saveInstallManifest(manifest, homeDir)

  const summaryLines = []
  if (installedRuntimes.includes('antigravity')) {
    summaryLines.push(
      `• \x1b[36mAntigravity (全局)\x1b[0m: 已注入 8 项 Skills、${TOOL_DEFINITIONS.length} 大懒加载 MCP 工具与 Schema。`
    )
  }
  if (installedRuntimes.includes('copilot')) {
    summaryLines.push(
      `• \x1b[36mVS Code Copilot (全局)\x1b[0m: 已注入 Agent Skills (${copilotSkillsDir})、Custom Instructions 与 Copilot MCP (${copilotMcpConfigFile})；在 VS Code 中执行 \`Developer: Reload Window\` 后即可使用 \`/zhifangsi*\` 与 \`zhifangsi_*\` 工具。`
    )
    if (!manifest.runtimes.copilot?.legacyProfileEnabled) {
      summaryLines.push(
        `  \x1b[2m(若使用旧版 VS Code Local harness，可附加 --vscode-profile 同步至 Code/User/mcp.json)\x1b[0m`
      )
    }
  }
  for (const ws of installedWorkspaces) {
    summaryLines.push(
      `• \x1b[36m${ws.runtime} (工作区)\x1b[0m: ${ws.configFile}${ws.skillsDir ? ` + ${ws.skillsDir}` : ''}`
    )
  }

  console.log(`
\x1b[32m========================================================\x1b[0m
\x1b[32m✔ 职方司 (zhifangsi v${version}) 已成功完成安装与集成！\x1b[0m
\x1b[32m========================================================\x1b[0m

生效组件：
${summaryLines.join('\n')}
• \x1b[36mNode 绝对路径绑定\x1b[0m: ${nodePath} -> ${mcpServerScript}
• \x1b[36m安装清单记录\x1b[0m: ${manifestPath}
• \x1b[36m全局命令行\x1b[0m: 可在系统任何终端直接运行 \`zhifangsi map\` / \`zhifangsi check\` / \`zhifangsi update\` / \`zhifangsi impact\`。
`)

  return {
    version,
    uninstalled: false,
    installedRuntimes,
    installedWorkspaces,
    manifestPath,
  }
}

// 当直接作为脚本执行时立即运行
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase()
if (isMain) {
  runInstaller(process.argv.slice(2))
}
