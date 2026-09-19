#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import {
  buildWorkspaceGraph,
  formatZhifangsiMap,
} from '../dist/mcp/helpers.js'
import {
  loadInvariantsFromWorkspace,
  checkInvariants,
  formatInvariantReport,
} from '../dist/invariants/checker.js'
import { LLMWikiBridge } from '../dist/bridge/client.js'
import { syncToLLMWiki } from '../dist/bridge/sync.js'
import { generateCodebaseSkeleton } from '../dist/ast/skeletonizer.js'
import { runZhifangsiMcpServer } from '../dist/mcp/server.js'

const args = process.argv.slice(2)
const command = args[0] || 'help'

async function main() {
  switch (command) {
    case 'map': {
      const targetDir = path.resolve(args[1] || process.cwd())
      console.log(`\x1b[36m[职方司]\x1b[0m 正在测绘代码库舆图: ${targetDir}...`)
      const bridge = new LLMWikiBridge()
      const bridgeOnline = await bridge.isAvailable()
      const graph = buildWorkspaceGraph(targetDir)
      const output = formatZhifangsiMap(targetDir, graph, bridgeOnline)
      console.log('\n' + output)
      break
    }

    case 'skeleton': {
      const targetDir = path.resolve(args[1] || process.cwd())
      const outFile = path.resolve(args[2] || path.join(targetDir, 'codebase-skeleton.md'))
      console.log(`\x1b[36m[职方司]\x1b[0m 正在提取代码骨架: ${targetDir}...`)
      const result = generateCodebaseSkeleton(targetDir)
      fs.writeFileSync(outFile, result.markdown, 'utf-8')
      console.log(`\x1b[32m✔ 提取完成:\x1b[0m ${outFile}`)
      console.log(`  原代码行数: ${result.totalOriginalLines} -> 骨架行数: ${result.totalSkeletonLines}`)
      console.log(`  压缩率: \x1b[33m${(result.overallTokenSavings * 100).toFixed(1)}%\x1b[0m (文件数: ${result.filesProcessed})`)
      break
    }

    case 'bridge': {
      const bridge = new LLMWikiBridge()
      console.log(`\x1b[36m[职方司]\x1b[0m 正在探测 LLM Wiki 桌面端连接 (127.0.0.1:19828)...`)
      const isOnline = await bridge.isAvailable()
      if (!isOnline) {
        console.log(`\x1b[33m[离线]\x1b[0m LLM Wiki 桌面端未开启。职方司处于纯本地独立模式。`)
        console.log(`提示: 启动 LLM Wiki 桌面端并在设置开启 API 后，可获得知识图谱可视化与向量检索支持。`)
      } else {
        console.log(`\x1b[32m[在线]\x1b[0m 成功连接至 LLM Wiki 桌面服务！`)
        const projects = await bridge.listProjects()
        console.log(`已挂载项目数: ${projects.length}`)
        projects.forEach((p) => console.log(`  - ${p.name} (\`${p.path}\`)`))
      }
      break
    }

    case 'sync': {
      const targetDir = path.resolve(args[1] || process.cwd())
      console.log(`\x1b[36m[职方司]\x1b[0m 同步本地 Wiki 页面至 LLM Wiki 桌面端...`)
      const report = await syncToLLMWiki({ projectDir: targetDir })
      if (!report.bridgeActive) {
        console.log(`\x1b[33m[跳过]\x1b[0m LLM Wiki 桌面端未运行，本地 Wiki 页面保持纯本地存储。`)
      } else {
        console.log(`\x1b[32m✔ 同步成功:\x1b[0m 嵌入了 ${report.pagesSynced.length} 个架构页面`)
        report.pagesSynced.forEach((p) => console.log(`  - ${p}`))
        if (report.errors.length > 0) {
          console.warn(`警告:`, report.errors)
        }
      }
      break
    }

    case 'check':
    case 'lint':
    case 'invariants': {
      const targetDir = path.resolve(args[1] || process.cwd())
      console.log(`\x1b[36m[职方司]\x1b[0m 正在巡检查验关防守则与架构不变量: ${targetDir}...`)
      const invariants = loadInvariantsFromWorkspace(targetDir)
      if (invariants.length === 0) {
        console.log(`\x1b[33m[提示]\x1b[0m 未在 \`${path.join(targetDir, 'wiki', 'invariants')}\` 发现任何关防守则 (.md 文件)。`)
        console.log(`您可在该目录下创建规范文档，定义诸如跨层调用限制与单向数据流规则。`)
        break
      }
      const graph = buildWorkspaceGraph(targetDir)
      const report = checkInvariants(invariants, graph, { rootDir: targetDir })
      const formatted = formatInvariantReport(report, { colored: true })
      console.log('\n' + formatted)
      if (!report.passed) {
        process.exitCode = 1
      }
      break
    }

    case 'mcp': {
      // Run MCP server over stdio
      await runZhifangsiMcpServer()
      break
    }

    case 'help':
    default: {
      console.log(`
\x1b[36m职方司 (zhifangsi) - 代码库战略舆图与架构自愈引擎\x1b[0m
版本: 1.0.0 (支持独立运行与 LLM Wiki 桌面联动双模)

用法:
  zhifangsi map [dir]          测绘并输出代码库拓扑、PageRank 核心关隘与模块列表
  zhifangsi skeleton [dir]     提取高信息密度代码骨架 (85%+ 压缩率)
  zhifangsi check [dir]        执行关防守则与架构不变量静态合规核查 (阻断越权与非法依赖)
  zhifangsi bridge             探测与 LLM Wiki 桌面端的联动状态
  zhifangsi sync [dir]         将本地架构页面同步至 LLM Wiki 桌面端嵌入索引
  zhifangsi mcp                启动 stdio MCP 服务 (供 Antigravity / Qoder / Copilot 调用)
  zhifangsi help               显示帮助信息
`)
      break
    }
  }
}

main().catch((err) => {
  console.error('\x1b[31m[职方司错误]\x1b[0m', err)
  process.exit(1)
})
