#!/usr/bin/env node

/**
 * 职方司 (zhifangsi) - Antigravity 深度安装与配置集成脚本
 * 
 * 作用：
 * 1. 注册 Antigravity 核心技能 (Skill) -> ~/.gemini/antigravity/skills/zhifangsi/SKILL.md
 * 2. 注入 Antigravity MCP Server 配置 -> ~/.gemini/config/mcp_config.json 与 ~/.gemini/antigravity/mcp_config.json
 * 3. 注册 Antigravity MCP 延迟加载工具架构 -> ~/.gemini/antigravity/mcp/zhifangsi/*.json & instructions.md
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const homeDir = process.env.USERPROFILE || process.env.HOME || ''
if (!homeDir) {
  console.error('\x1b[31m[错误]\x1b[0m 无法获取当前用户主目录 (USERPROFILE/HOME)。')
  process.exit(1)
}

const geminiRoot = path.join(homeDir, '.gemini')
const skillsDir = path.join(geminiRoot, 'antigravity', 'skills', 'zhifangsi')
const mcpSchemaDir = path.join(geminiRoot, 'antigravity', 'mcp', 'zhifangsi')
const mcpConfigFiles = [
  path.join(geminiRoot, 'config', 'mcp_config.json'),
  path.join(geminiRoot, 'antigravity', 'mcp_config.json'),
]
const mcpServerScript = path.join(projectRoot, 'dist', 'mcp', 'server.js')
const nodePath = process.execPath // 精准使用当前 Node.js 完整可执行路径

console.log('\x1b[36m[职方司]\x1b[0m 开始为 Antigravity 深度安装与注册职方司引擎...\n')

// 0. 检查并编译产物
if (!fs.existsSync(mcpServerScript)) {
  console.log('\x1b[33m[提示]\x1b[0m 正在编译 TypeScript 产物 (dist/)...')
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
}

// 1. 安装 Skill 技能
console.log(`1. 正在同步 Antigravity 核心技能 (Skill)...`)
try {
  fs.mkdirSync(skillsDir, { recursive: true })
  const sourceSkill = path.join(projectRoot, 'SKILL.md')
  const targetSkill = path.join(skillsDir, 'SKILL.md')
  
  if (fs.existsSync(sourceSkill)) {
    fs.copyFileSync(sourceSkill, targetSkill)
    console.log(`   \x1b[32m✔ 技能文件已部署:\x1b[0m ${targetSkill}`)
  }
} catch (err) {
  console.error(`   \x1b[31m✖ 部署 Skill 失败:\x1b[0m`, err)
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

    // 使用明确的 Node 可执行路径，防止 GUI 进程缺少环境变量
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

  const toolDefinitions = [
    {
      name: 'zhifangsi_map',
      description: '获取当前代码库的职方司全景战略舆图。包含基于 PageRank 的核心关隘文件（Hubs）、已注册模块、业务流和架构守则。',
      parameters: {
        type: 'object',
        properties: {
          target_dir: {
            description: '代码库根路径，缺省为当前工作目录',
            type: 'string',
          },
        },
      },
    },
    {
      name: 'zhifangsi_check_invariants',
      description: '对代码库执行架构关防守则（Invariants）静态合规检查，检测是否存在跨层越权调用、非法依赖或单向数据流违规。',
      parameters: {
        type: 'object',
        properties: {
          target_dir: {
            description: '代码库根路径，缺省为当前工作目录',
            type: 'string',
          },
        },
      },
    },
    {
      name: 'zhifangsi_module_info',
      description: '查询特定模块的职责定义、公共 API 导出契约与深度依赖影响范围。',
      parameters: {
        type: 'object',
        properties: {
          module_name: {
            description: '模块名称，如 graph-renderer 或 wiki-store',
            type: 'string',
          },
          target_dir: {
            description: '代码库根路径，缺省为当前工作目录',
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
        },
        required: ['workflow_name'],
      },
    },
    {
      name: 'zhifangsi_search',
      description: '在代码库知识舆图中检索。若 LLM Wiki 桌面端在线，将自动调用 LanceDB 向量+关键词混合检索。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            description: '检索关键词或意图描述',
            type: 'string',
          },
          target_dir: {
            description: '代码库根路径，缺省为当前工作目录',
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
  ]

  for (const tool of toolDefinitions) {
    const file = path.join(mcpSchemaDir, `${tool.name}.json`)
    fs.writeFileSync(file, JSON.stringify(tool, null, 2), 'utf-8')
  }

  const instructionsContent = `# 兵部职方司 (Zhifangsi) MCP 工具使用指南

职方司为代码库战略舆图与架构自愈引擎，专精于代码库静态拓扑、核心关隘识别与架构不变量守则核验。

## 核心工具使用时机
1. **全局架构探索**：调用 \`zhifangsi_map\` 快速测绘工程全景，获取 PageRank 权重最高的枢纽文件、已注册模块与守则状态。
2. **重构与边界守则校验**：在修改代码或提交代码前，调用 \`zhifangsi_check_invariants\` 拦截跨层越权调用与非法耦合。
3. **模块深入洞察**：调用 \`zhifangsi_module_info\` 查看特定模块的 API 契约与上下游影响闭包。
4. **业务流水线时序**：调用 \`zhifangsi_workflow_trace\` 追踪多步骤调用链。
5. **架构知识检索**：调用 \`zhifangsi_search\` 在架构 Wiki 中检索。
`
  fs.writeFileSync(path.join(mcpSchemaDir, 'instructions.md'), instructionsContent, 'utf-8')
  console.log(`   \x1b[32m✔ 6 大 MCP 工具 Schema 与使用指南生成完毕！\x1b[0m`)
} catch (err) {
  console.error(`   \x1b[31m✖ 生成 MCP Schema 失败:\x1b[0m`, err)
}

console.log(`
\x1b[32m========================================================\x1b[0m
\x1b[32m✔ 职方司 (zhifangsi) 已成功深度安装至 Antigravity！\x1b[0m
\x1b[32m========================================================\x1b[0m

生效组件：
1. \x1b[36mSkill 技能\x1b[0m: Antigravity 对话中自动具备职方司战略舆图思维；
2. \x1b[36mMCP 军机工具\x1b[0m: 原生注入 6 大懒加载工具 (zhifangsi_*)；
3. \x1b[36mNode 绝对路径绑定\x1b[0m: ${nodePath}，避免环境异常；
4. \x1b[36m全局命令行\x1b[0m: 可在系统任何终端直接运行 \`zhifangsi map\` / \`zhifangsi check\`。
`)
