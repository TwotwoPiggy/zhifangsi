#!/usr/bin/env node

/**
 * 职方司 (zhifangsi) - Antigravity 一键安装与配置集成脚本
 * 
 * 作用：
 * 1. 注册 Antigravity 核心技能 (Skill) -> ~/.gemini/antigravity/skills/zhifangsi/SKILL.md
 * 2. 挂载 Antigravity MCP Server -> ~/.gemini/config/mcp_config.json
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

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
const mcpConfigFile = path.join(geminiRoot, 'config', 'mcp_config.json')
const mcpServerScript = path.join(projectRoot, 'dist', 'mcp', 'server.js')

console.log('\x1b[36m[职方司]\x1b[0m 开始为 Antigravity 安装与注册职方司引擎...\n')

// 0. 检查项目是否已构建
if (!fs.existsSync(mcpServerScript)) {
  console.log('\x1b[33m[提示]\x1b[0m 正在编译 TypeScript 产物 (dist/)...')
  const { execSync } = await import('child_process')
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
}

// 1. 安装 Skill 技能
console.log(`1. 正在注册 Antigravity Skill...`)
try {
  fs.mkdirSync(skillsDir, { recursive: true })
  const sourceSkill = path.join(projectRoot, 'SKILL.md')
  const targetSkill = path.join(skillsDir, 'SKILL.md')
  
  if (fs.existsSync(sourceSkill)) {
    fs.copyFileSync(sourceSkill, targetSkill)
    console.log(`   \x1b[32m✔ 技能同步就绪:\x1b[0m ${targetSkill}`)
  } else {
    console.warn(`   \x1b[33m⚠ 未找到源 SKILL.md 文件\x1b[0m`)
  }
} catch (err) {
  console.error(`   \x1b[31m✖ 注册 Skill 失败:\x1b[0m`, err)
}

// 2. 注册 MCP Server
console.log(`\n2. 正在配置 Antigravity MCP Server...`)
try {
  let mcpConfig = { mcpServers: {} }
  if (fs.existsSync(mcpConfigFile)) {
    try {
      const content = fs.readFileSync(mcpConfigFile, 'utf-8').trim()
      if (content) {
        mcpConfig = JSON.parse(content)
      }
    } catch {
      console.warn(`   \x1b[33m⚠ 原配置解析异常，将重置为标准格式\x1b[0m`)
    }
  } else {
    fs.mkdirSync(path.dirname(mcpConfigFile), { recursive: true })
  }

  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {}
  }

  // 注册 zhifangsi 服务
  mcpConfig.mcpServers['zhifangsi'] = {
    command: 'node',
    args: [mcpServerScript],
  }

  fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpConfig, null, 2), 'utf-8')
  console.log(`   \x1b[32m✔ MCP 配置已注入:\x1b[0m ${mcpConfigFile}`)
  console.log(`   - 启动命令: node "${mcpServerScript}"`)
} catch (err) {
  console.error(`   \x1b[31m✖ 注入 MCP 配置失败:\x1b[0m`, err)
}

console.log(`
\x1b[32m========================================================\x1b[0m
\x1b[32m✔ 职方司 (zhifangsi) 已成功安装至 Antigravity！\x1b[0m
\x1b[32m========================================================\x1b[0m

生效组件：
1. \x1b[36mSkill 技能\x1b[0m: 在任意对话中，Agent 将自动遵循职方司架构测绘与关防规则；
2. \x1b[36mMCP 军机处工具\x1b[0m: Agent 将拥有以下原生工具直接调用能力：
   - \`zhifangsi_map\`: 获取战略舆图与 PageRank 核心关隘
   - \`zhifangsi_check_invariants\`: 运行关防守则静态合规巡检
   - \`zhifangsi_module_info\`: 查询模块职责契约与影响闭包
   - \`zhifangsi_workflow_trace\`: 追踪核心业务流时序
   - \`zhifangsi_search\`: 架构舆图混合检索
   - \`zhifangsi_bridge_status\`: 探测与 LLM Wiki 桌面端连接

提示: 重启 Antigravity 或新开启一个任务对话，即可直接在工具栏与提示词中使用职方司！
`)
