#!/usr/bin/env node

// 职方司 (zhifangsi) - 跨环境安装与配置集成器 (支持 NPM 全局 / npx / 本地源码)
//
// 作用：
// 1. 注册 Antigravity 核心技能与子技能 -> ~/.gemini/antigravity/skills/
// 2. 注入 Antigravity MCP Server 配置 -> ~/.gemini/config/mcp_config.json 与 ~/.gemini/antigravity/mcp_config.json
// 3. 注册 Antigravity MCP 延迟加载工具架构 -> ~/.gemini/antigravity/mcp/zhifangsi/
// 4. 可选支持注入本地项目 IDE 配置 (--vscode / --qoder / --cursor / --claude) 及一键卸载 (--uninstall)

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function getPackageVersion() {
  try {
    const pkgPath = path.join(projectRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '1.1.0'
  } catch {
    return '1.1.0'
  }
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
1. **全局架构探索**：调用 \`zhifangsi_map\` 快速测绘工程全景，获取 PageRank 权重最高的枢纽文件、循环依赖预警、已注册模块与守则状态。
2. **存量工程冷启动建档**：调用 \`zhifangsi_bootstrap\` 基于 AST 目录拓扑自动生成 \`wiki/modules/*.md\` 模块档案。
3. **局部邻域高密骨架（Inline & Spill）**：调用 \`zhifangsi_skeleton\` 传入 \`target\` 获取目标文件/模块骨架与 1 跳邻居契约，节省 85%+ Token。
4. **变更爆炸半径与防撞车评估**：修改代码前调用 \`zhifangsi_impact\` 传入拟改文件，获取波及模块、需回归测试的业务流及 Top Hub 高危预警。
5. **重构与边界守则校验**：修改或提交前调用 \`zhifangsi_check_invariants\` 拦截跨层越权调用、循环依赖与 Wiki 舆图失真。
6. **模块深入洞察**：调用 \`zhifangsi_module_info\` 查看特定模块的导出 API 契约与上下游影响闭包。
7. **业务流水线时序**：调用 \`zhifangsi_workflow_trace\` 追踪多步骤调用链。
8. **架构知识与符号检索**：调用 \`zhifangsi_search\` 在架构 Wiki 与 AST 导出符号表中混合检索。
`

export function runInstaller(rawArgs = []) {
  const version = getPackageVersion()
  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  if (!homeDir) {
    console.error('\x1b[31m[错误]\x1b[0m 无法获取当前用户主目录 (USERPROFILE/HOME)。')
    process.exit(1)
  }

  const isUninstall = rawArgs.includes('--uninstall') || rawArgs.includes('-u')
  const wantVscode = rawArgs.includes('--vscode') || rawArgs.includes('--all')
  const wantQoder = rawArgs.includes('--qoder') || rawArgs.includes('--claude') || rawArgs.includes('--all')
  const wantCursor = rawArgs.includes('--cursor') || rawArgs.includes('--all')
  const hasExplicitIdeOnly =
    (rawArgs.includes('--vscode') ||
      rawArgs.includes('--qoder') ||
      rawArgs.includes('--claude') ||
      rawArgs.includes('--cursor')) &&
    !rawArgs.includes('--antigravity') &&
    !rawArgs.includes('--all') &&
    !rawArgs.includes('--global') &&
    !rawArgs.includes('-g')
  const wantAntigravity = !hasExplicitIdeOnly

  const geminiRoot = path.join(homeDir, '.gemini')
  const skillsBaseDir = path.join(geminiRoot, 'antigravity', 'skills')
  const mcpSchemaDir = path.join(geminiRoot, 'antigravity', 'mcp', 'zhifangsi')
  const mcpConfigFiles = [
    path.join(geminiRoot, 'config', 'mcp_config.json'),
    path.join(geminiRoot, 'antigravity', 'mcp_config.json'),
  ]
  const mcpServerScript = path.join(projectRoot, 'dist', 'mcp', 'server.js')
  const nodePath = process.execPath

  if (isUninstall) {
    console.log(`\x1b[36m[职方司]\x1b[0m 正在卸载职方司 (zhifangsi v${version}) 集成配置...\n`)

    // 1. 移除 Skills
    const skillNames = ['zhifangsi']
    const skillsSourceFolder = path.join(projectRoot, 'skills')
    if (fs.existsSync(skillsSourceFolder)) {
      for (const entry of fs.readdirSync(skillsSourceFolder, { withFileTypes: true })) {
        if (entry.isDirectory()) skillNames.push(entry.name)
      }
    }
    for (const sName of skillNames) {
      const targetDir = path.join(skillsBaseDir, sName)
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
        console.log(`   \x1b[32m✔ 已移除技能:\x1b[0m ${targetDir}`)
      }
    }

    // 2. 移除 MCP Config
    for (const cfgFile of mcpConfigFiles) {
      if (fs.existsSync(cfgFile)) {
        try {
          const mcpConfig = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
          if (mcpConfig.mcpServers && mcpConfig.mcpServers['zhifangsi']) {
            delete mcpConfig.mcpServers['zhifangsi']
            fs.writeFileSync(cfgFile, JSON.stringify(mcpConfig, null, 2), 'utf-8')
            console.log(`   \x1b[32m✔ 已清理 MCP 配置:\x1b[0m ${cfgFile}`)
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. 移除 MCP Schema
    if (fs.existsSync(mcpSchemaDir)) {
      fs.rmSync(mcpSchemaDir, { recursive: true, force: true })
      console.log(`   \x1b[32m✔ 已移除 MCP Schema 目录:\x1b[0m ${mcpSchemaDir}`)
    }

    console.log(`\n\x1b[32m✔ 职方司 (zhifangsi) 卸载完成。\x1b[0m`)
    return
  }

  console.log(`\x1b[36m[职方司]\x1b[0m 开始安装与注册职方司引擎 (v${version})...\n`)

  // 0. 检查并编译产物
  if (!fs.existsSync(mcpServerScript) && fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
    console.log('\x1b[33m[提示]\x1b[0m 正在编译 TypeScript 产物 (dist/)...')
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
  }

  if (wantAntigravity) {
    // 1. 安装 Skill 技能（主技能与专项子技能）
    console.log(`1. 正在同步 Antigravity 技能组 (Skills)...`)
    try {
      const mainSkillDir = path.join(skillsBaseDir, 'zhifangsi')
      fs.mkdirSync(mainSkillDir, { recursive: true })
      const sourceMainSkill = path.join(projectRoot, 'SKILL.md')
      const targetMainSkill = path.join(mainSkillDir, 'SKILL.md')
      if (fs.existsSync(sourceMainSkill)) {
        fs.copyFileSync(sourceMainSkill, targetMainSkill)
        console.log(`   \x1b[32m✔ [主技能]\x1b[0m ${targetMainSkill} (/zhifangsi)`)
      }

      const skillsSourceFolder = path.join(projectRoot, 'skills')
      if (fs.existsSync(skillsSourceFolder)) {
        const subEntries = fs.readdirSync(skillsSourceFolder, { withFileTypes: true })
        for (const entry of subEntries) {
          if (entry.isDirectory()) {
            const subSkillName = entry.name
            const subSourceSkill = path.join(skillsSourceFolder, subSkillName, 'SKILL.md')
            if (fs.existsSync(subSourceSkill)) {
              const subTargetDir = path.join(skillsBaseDir, subSkillName)
              fs.mkdirSync(subTargetDir, { recursive: true })
              const subTargetSkill = path.join(subTargetDir, 'SKILL.md')
              fs.copyFileSync(subSourceSkill, subTargetSkill)
              console.log(`   \x1b[32m✔ [指令技能]\x1b[0m ${subTargetSkill} (/${subSkillName})`)
            }
          }
        }
      }
    } catch (err) {
      console.error(`   \x1b[31m✖ 部署技能组失败:\x1b[0m`, err)
    }

    // 2. 注入 MCP Server 启动配置
    console.log(`\n2. 正在配置 Antigravity MCP Server...`)
    for (const cfgFile of mcpConfigFiles) {
      try {
        let mcpConfig = { mcpServers: {} }
        if (fs.existsSync(cfgFile)) {
          try {
            const raw = fs.readFileSync(cfgFile, 'utf-8').trim()
            if (raw) mcpConfig = JSON.parse(raw)
          } catch {
            // 重置
          }
        } else {
          fs.mkdirSync(path.dirname(cfgFile), { recursive: true })
        }

        if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {}

        mcpConfig.mcpServers['zhifangsi'] = {
          command: nodePath,
          args: [mcpServerScript],
        }

        fs.writeFileSync(cfgFile, JSON.stringify(mcpConfig, null, 2), 'utf-8')
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
  }

  // 4. 可选：为当前工作区注入 VS Code / Qoder / Cursor / Claude MCP 配置
  const cwd = process.cwd()
  if (wantVscode) {
    const vscodeMcpFile = path.join(cwd, '.vscode', 'mcp.json')
    fs.mkdirSync(path.dirname(vscodeMcpFile), { recursive: true })
    let cfg = { servers: {} }
    if (fs.existsSync(vscodeMcpFile)) {
      try {
        cfg = JSON.parse(fs.readFileSync(vscodeMcpFile, 'utf-8'))
      } catch {}
    }
    if (!cfg.servers) cfg.servers = {}
    cfg.servers['zhifangsi'] = {
      type: 'stdio',
      command: nodePath,
      args: [mcpServerScript],
    }
    fs.writeFileSync(vscodeMcpFile, JSON.stringify(cfg, null, 2), 'utf-8')
    console.log(`\n   \x1b[32m✔ [VS Code]\x1b[0m 已注入 ${vscodeMcpFile}`)
  }

  if (wantQoder) {
    const qoderMcpFile = path.join(cwd, '.mcp.json')
    let cfg = { mcpServers: {} }
    if (fs.existsSync(qoderMcpFile)) {
      try {
        cfg = JSON.parse(fs.readFileSync(qoderMcpFile, 'utf-8'))
      } catch {}
    }
    if (!cfg.mcpServers) cfg.mcpServers = {}
    cfg.mcpServers['zhifangsi'] = {
      command: nodePath,
      args: [mcpServerScript],
    }
    fs.writeFileSync(qoderMcpFile, JSON.stringify(cfg, null, 2), 'utf-8')
    console.log(`\n   \x1b[32m✔ [Qoder / Claude]\x1b[0m 已注入 ${qoderMcpFile}`)
  }

  if (wantCursor) {
    const cursorMcpFile = path.join(cwd, '.cursor', 'mcp.json')
    fs.mkdirSync(path.dirname(cursorMcpFile), { recursive: true })
    let cfg = { mcpServers: {} }
    if (fs.existsSync(cursorMcpFile)) {
      try {
        cfg = JSON.parse(fs.readFileSync(cursorMcpFile, 'utf-8'))
      } catch {}
    }
    if (!cfg.mcpServers) cfg.mcpServers = {}
    cfg.mcpServers['zhifangsi'] = {
      command: nodePath,
      args: [mcpServerScript],
    }
    fs.writeFileSync(cursorMcpFile, JSON.stringify(cfg, null, 2), 'utf-8')
    console.log(`\n   \x1b[32m✔ [Cursor]\x1b[0m 已注入 ${cursorMcpFile}`)
  }

  console.log(`
\x1b[32m========================================================\x1b[0m
\x1b[32m✔ 职方司 (zhifangsi v${version}) 已成功完成安装与集成！\x1b[0m
\x1b[32m========================================================\x1b[0m

生效组件：
1. \x1b[36mSkill 技能\x1b[0m: Antigravity 对话中自动具备职方司战略舆图思维；
2. \x1b[36mMCP 军机工具\x1b[0m: 原生注入 ${TOOL_DEFINITIONS.length} 大懒加载工具 (zhifangsi_*)；
3. \x1b[36mNode 绝对路径绑定\x1b[0m: ${nodePath} -> ${mcpServerScript}；
4. \x1b[36m全局命令行\x1b[0m: 可在系统任何终端直接运行 \`zhifangsi map\` / \`zhifangsi check\` / \`zhifangsi bootstrap\` / \`zhifangsi impact\`。
`)
}

// 当直接作为脚本执行时立即运行
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase()
if (isMain) {
  runInstaller(process.argv.slice(2))
}
