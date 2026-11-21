#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import {
  buildWorkspaceGraph,
  formatZhifangsiMap,
  generateNeighborhoodSkeleton,
  analyzeChangeImpact,
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
import { initWikiProject, bootstrapWikiModules } from '../dist/init/scaffold.js'
import { runInstaller } from '../scripts/install-antigravity.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pkgRoot = path.resolve(__dirname, '..')

function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8'))
    return pkg.version || '1.1.0'
  } catch {
    return '1.1.0'
  }
}

async function getRemoteNpmVersion(pkgName = 'zhifangsi') {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data && data.version) return String(data.version).trim()
    }
  } catch {
    // ignore
  }
  return null
}

const args = process.argv.slice(2)
let command = args[0] || 'help'

// 支持类似 `npx zhifangsi --antigravity` 或 `npx zhifangsi --global --antigravity` 的直接标志调用
if (
  command.startsWith('-') &&
  (args.includes('--antigravity') ||
    args.includes('--vscode') ||
    args.includes('--qoder') ||
    args.includes('--cursor') ||
    args.includes('--claude') ||
    args.includes('--all') ||
    args.includes('--uninstall') ||
    args.includes('-u'))
) {
  command = 'install'
}

async function main() {
  switch (command) {
    case '-v':
    case '--version':
    case 'version': {
      console.log(`zhifangsi v${getLocalVersion()}`)
      break
    }

    case 'install':
    case 'setup': {
      const installArgs = args[0] === 'install' || args[0] === 'setup' ? args.slice(1) : args
      runInstaller(installArgs)
      break
    }

    case 'uninstall': {
      runInstaller(['--uninstall', ...args.slice(1)])
      break
    }

    case 'update':
    case 'upgrade': {
      const localVer = getLocalVersion()
      const useGit = args.includes('--git')
      console.log(`\x1b[36m[职方司]\x1b[0m 当前本地版本: v${localVer}，正在检查更新...`)

      const remoteVer = useGit ? null : await getRemoteNpmVersion('zhifangsi')
      if (remoteVer) {
        if (remoteVer === localVer && !args.includes('--force')) {
          console.log(`\x1b[32m✔ 当前已是 NPM 最新版本 (v${localVer})！\x1b[0m`)
          runInstaller(['--antigravity'])
          break
        }
        console.log(`\x1b[36m[职方司]\x1b[0m 发现 NPM 最新版本 v${remoteVer}，正在通过 NPM 全局升级...`)
        execSync('npm install -g zhifangsi@latest', { stdio: 'inherit' })
      } else {
        const repoUrl = 'git+https://github.com/TwotwoPiggy/zhifangsi.git'
        console.log(`\x1b[33m[提示]\x1b[0m 正在从 GitHub 远端源 (${repoUrl}) 拉取最新稳定版并全局安装...`)
        execSync(`npm install -g ${repoUrl}`, { stdio: 'inherit' })
      }

      console.log(`\x1b[36m[职方司]\x1b[0m 正在同步更新宿主环境 Skills 与 MCP 工具配置...`)
      runInstaller(['--antigravity'])
      break
    }

    case 'init': {
      const targetDir = path.resolve(args[1] || process.cwd())
      const isForce = args.includes('--force') || args.includes('-f')
      console.log(`\x1b[36m[职方司]\x1b[0m 正在初始化 Codebase Map 架构契约与 Wiki 目录: ${targetDir}...`)
      const result = initWikiProject(targetDir, { force: isForce })
      console.log(`\x1b[32m✔ 初始化完成:\x1b[0m 项目「${result.projectName}」`)
      console.log(`  - 架构契约: ${result.schemaPath}`)
      console.log(`  - 知识库根目录: ${result.wikiPath}`)
      if (result.createdFiles.length > 0) {
        console.log(`  已生成架构文件 (${result.createdFiles.length} 个):`)
        result.createdFiles.forEach((f) => console.log(`    + ${f}`))
      }
      if (result.skippedFiles.length > 0) {
        console.log(`  已存在并跳过文件 (${result.skippedFiles.length} 个，使用 --force 覆盖):`)
        result.skippedFiles.forEach((f) => console.log(`    - ${f}`))
      }
      console.log(`\n\x1b[32m✔ 现在可在 LLM Wiki 桌面端直接「打开项目 (Open Project)」挂载此代码库！\x1b[0m`)
      break
    }

    case 'bootstrap': {
      const targetDir = path.resolve(args[1] || process.cwd())
      const isForce = args.includes('--force') || args.includes('-f')
      console.log(`\x1b[36m[职方司]\x1b[0m 正在基于 AST 拓扑逆向聚类生成模块档案: ${targetDir}...`)
      const graph = buildWorkspaceGraph(targetDir)
      const res = bootstrapWikiModules(targetDir, graph, { force: isForce })
      console.log(`\x1b[32m✔ 冷启动模块建档完成:\x1b[0m`)
      res.modulesCreated.forEach((m) => console.log(`  + ${m}`))
      if (res.modulesSkipped.length > 0) {
        console.log(`  跳过已存在模块 (${res.modulesSkipped.length} 个，使用 --force 覆盖):`)
        res.modulesSkipped.forEach((m) => console.log(`  - ${m}`))
      }
      break
    }

    case 'map': {
      const targetDir = path.resolve(args[1] || process.cwd())
      const outFile = args[2] ? path.resolve(args[2]) : null
      console.log(`\x1b[36m[职方司]\x1b[0m 正在测绘代码库舆图: ${targetDir}...`)
      const bridge = new LLMWikiBridge()
      const bridgeOnline = await bridge.isAvailable()
      const graph = buildWorkspaceGraph(targetDir)
      const output = formatZhifangsiMap(targetDir, graph, bridgeOnline)
      console.log('\n' + output)
      if (outFile) {
        fs.writeFileSync(outFile, output, 'utf-8')
        console.log(`\x1b[32m✔ 战略舆图已保存至:\x1b[0m ${outFile}`)
      }
      break
    }

    case 'skeleton': {
      const targetDir = path.resolve(args[1] || process.cwd())
      const targetFilterIdx = args.indexOf('--target')
      if (targetFilterIdx !== -1 && args[targetFilterIdx + 1]) {
        const target = args[targetFilterIdx + 1]
        const graph = buildWorkspaceGraph(targetDir)
        console.log(generateNeighborhoodSkeleton(targetDir, target, graph, 1))
        break
      }
      const outFile = path.resolve(args[2] || path.join(targetDir, 'codebase-skeleton.md'))
      console.log(`\x1b[36m[职方司]\x1b[0m 正在提取代码骨架: ${targetDir}...`)
      const result = generateCodebaseSkeleton(targetDir)
      fs.writeFileSync(outFile, result.markdown, 'utf-8')
      console.log(`\x1b[32m✔ 提取完成:\x1b[0m ${outFile}`)
      console.log(`  原代码行数: ${result.totalOriginalLines} -> 骨架行数: ${result.totalSkeletonLines}`)
      console.log(`  压缩率: \x1b[33m${(result.overallTokenSavings * 100).toFixed(1)}%\x1b[0m (文件数: ${result.filesProcessed})`)
      break
    }

    case 'impact': {
      const targetArg = args[1] || ''
      const targetDir = path.resolve(args[2] || process.cwd())
      if (!targetArg) {
        console.log(`用法: zhifangsi impact <file1,file2|module> [dir]`)
        break
      }
      const files = targetArg.split(',').map((s) => s.trim()).filter(Boolean)
      const graph = buildWorkspaceGraph(targetDir)
      const result = analyzeChangeImpact(targetDir, files, graph)
      console.log('\n' + result.markdown)
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
      await runZhifangsiMcpServer()
      break
    }

    case 'help':
    case '-h':
    case '--help':
    default: {
      console.log(`
\x1b[36m职方司 (zhifangsi) - 代码库战略舆图与架构自愈引擎\x1b[0m
版本: ${getLocalVersion()} (支持独立运行与 LLM Wiki 桌面联动双模)

安装与环境集成:
  zhifangsi install [--antigravity|--vscode|--qoder|--cursor|--all]  注入宿主 Agent 技能组与 MCP 配置
  zhifangsi update [--git]                                           从 NPM / GitHub 自动升级并同步配置
  zhifangsi uninstall                                                从宿主环境中卸载技能与 MCP 配置

核心测绘与巡检命令:
  zhifangsi init [dir] [--force]       原位初始化代码库 Codebase Map 架构契约 (生成 schema.md 及 wiki/ 目录)
  zhifangsi bootstrap [dir] [--force]  基于 AST 目录拓扑自动聚类生成 wiki/modules/*.md 模块档案
  zhifangsi map [dir] [outfile]        测绘并输出代码库拓扑、PageRank 核心关隘与循环依赖预警
  zhifangsi skeleton [dir] [out]       提取高信息密度代码骨架 (支持 --target <file|module> 局部邻域骨架)
  zhifangsi impact <files> [dir]       评估变更爆炸半径、波及模块、回归业务流与核心关隘防撞车预警
  zhifangsi check [dir]                执行关防守则、循环依赖与 Wiki 舆图失真 (Drift) 静态合规核查
  zhifangsi bridge                     探测与 LLM Wiki 桌面端的联动状态
  zhifangsi sync [dir]                 将本地架构页面同步至 LLM Wiki 桌面端嵌入索引
  zhifangsi mcp                        启动 stdio MCP 服务 (供 Antigravity / Qoder / Copilot 调用)
  zhifangsi --version                  查看当前版本号
  zhifangsi help                       显示帮助信息
`)
      break
    }
  }
}

main().catch((err) => {
  console.error('\x1b[31m[职方司错误]\x1b[0m', err)
  process.exit(1)
})
