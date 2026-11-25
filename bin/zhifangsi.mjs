#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
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
import { onboardWikiWorkspace, formatOnboardReport } from '../dist/mcp/onboard.js'
import {
  getDefaultConfigPath,
  loadGlobalConfig,
  saveGlobalConfig,
  resetGlobalConfig,
  setRepoOverride,
  unsetRepoOverride,
  resolveStoragePaths,
  upsertRepoRegistry,
  searchRepoRegistry,
  formatRepoRegistryReport,
} from '../dist/config/storage.js'
import { runInstaller } from '../scripts/install-antigravity.mjs'
import { runUpdater } from '../scripts/zhifangsi-update.mjs'

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

const args = process.argv.slice(2)
let command = args[0] || 'help'

/**
 * 解析通用命令行标志与位置参数，避免把 --wiki-dir / --force 等标志误识别为位置参数
 */
function parseCommandArgs(rawArgs) {
  const positional = []
  const flags = {
    force: false,
    minimal: false,
    noBootstrap: false,
    noPrep: false,
    noMap: false,
    noSync: false,
    wikiDir: undefined,
    vaultDir: undefined,
    storageMode: undefined,
    target: undefined,
    register: false,
    json: false,
  }

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i]
    if (token === '--force' || token === '-f') {
      flags.force = true
    } else if (token === '--minimal' || token === '--scaffold-only') {
      flags.minimal = true
    } else if (token === '--no-bootstrap') {
      flags.noBootstrap = true
    } else if (token === '--no-prep') {
      flags.noPrep = true
    } else if (token === '--no-map') {
      flags.noMap = true
    } else if (token === '--no-sync') {
      flags.noSync = true
    } else if (token === '--centralized') {
      flags.storageMode = 'centralized'
    } else if (token === '--local') {
      flags.storageMode = 'local'
    } else if (token === '--register') {
      flags.register = true
    } else if (token === '--json') {
      flags.json = true
    } else if (token === '--wiki-dir' && rawArgs[i + 1]) {
      flags.wikiDir = rawArgs[++i]
    } else if (token.startsWith('--wiki-dir=')) {
      flags.wikiDir = token.slice('--wiki-dir='.length)
    } else if (token === '--vault-dir' && rawArgs[i + 1]) {
      flags.vaultDir = rawArgs[++i]
    } else if (token.startsWith('--vault-dir=')) {
      flags.vaultDir = token.slice('--vault-dir='.length)
    } else if (token === '--target' && rawArgs[i + 1]) {
      flags.target = rawArgs[++i]
    } else if (token.startsWith('--target=')) {
      flags.target = token.slice('--target='.length)
    } else if (!token.startsWith('-')) {
      positional.push(token)
    }
  }

  const storageOptions = {}
  if (flags.wikiDir) storageOptions.wikiDir = flags.wikiDir
  if (flags.vaultDir) storageOptions.vaultDir = flags.vaultDir
  if (flags.storageMode) storageOptions.storageMode = flags.storageMode

  return { positional, flags, storageOptions }
}

// 支持类似 `npx zhifangsi --antigravity`、`npx zhifangsi --copilot` 或 `npx zhifangsi --vscode --global` 的直接标志调用
if (
  command.startsWith('-') &&
  (args.includes('--antigravity') ||
    args.includes('--copilot') ||
    args.includes('--vscode-copilot') ||
    args.includes('--vscode') ||
    args.includes('--vscode-profile') ||
    args.includes('--legacy-mcp') ||
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
      const result = await runUpdater(args.slice(1))
      if (result && result.exitCode) {
        process.exitCode = result.exitCode
      }
      break
    }

    case 'config': {
      const subArgs = args.slice(1)
      const subCmd = subArgs[0] || 'show'
      const configPath = getDefaultConfigPath()

      if (subCmd === 'set-mode') {
        const mode = subArgs[1]
        if (mode !== 'local' && mode !== 'centralized') {
          console.error(`\x1b[31m[错误]\x1b[0m 模式仅支持 local 或 centralized，示例: zhifangsi config set-mode centralized`)
          process.exitCode = 1
          break
        }
        const saved = saveGlobalConfig({ storageMode: mode })
        console.log(`\x1b[32m✔ 全局存储模式已更新:\x1b[0m ${saved.storageMode}`)
        console.log(`  - 配置文件: ${configPath}`)
        console.log(`  - 集中外置 Vault: ${saved.vaultDir}`)
        break
      }

      if (subCmd === 'set-vault') {
        const vaultDir = subArgs[1]
        if (!vaultDir) {
          console.error(`\x1b[31m[错误]\x1b[0m 请指定集中外置 Vault 根目录，示例: zhifangsi config set-vault D:/zhifangsi-vault`)
          process.exitCode = 1
          break
        }
        const alsoSwitch = subArgs.includes('--centralized')
        const patch = alsoSwitch ? { vaultDir, storageMode: 'centralized' } : { vaultDir }
        const saved = saveGlobalConfig(patch)
        console.log(`\x1b[32m✔ 集中外置 Vault 目录已更新:\x1b[0m ${saved.vaultDir}`)
        console.log(`  - 当前默认模式: ${saved.storageMode}`)
        if (saved.storageMode !== 'centralized') {
          console.log(`  - 提示: 如需全局默认使用集中外置，请再运行 \`zhifangsi config set-mode centralized\``)
        }
        break
      }

      if (subCmd === 'set-repo') {
        const rest = subArgs.slice(1).filter((t) => !t.startsWith('-'))
        if (rest.length === 0) {
          console.error(`\x1b[31m[错误]\x1b[0m 用法: zhifangsi config set-repo [repoDir] <wikiDir>`)
          process.exitCode = 1
          break
        }
        const repoDir = rest.length === 1 ? process.cwd() : rest[0]
        const wikiDir = rest.length === 1 ? rest[0] : rest[1]
        const saved = setRepoOverride(repoDir, wikiDir)
        const resolved = resolveStoragePaths(repoDir)
        console.log(`\x1b[32m✔ 已设置单仓库知识库覆盖:\x1b[0m`)
        console.log(`  - 源码仓库: ${resolved.repoRoot}`)
        console.log(`  - 知识库目录: ${resolved.wikiDir}`)
        console.log(`  - 已配置覆盖数: ${Object.keys(saved.repoOverrides).length}`)
        break
      }

      if (subCmd === 'unset-repo') {
        const repoDir = subArgs[1] || process.cwd()
        unsetRepoOverride(repoDir)
        const resolved = resolveStoragePaths(repoDir)
        console.log(`\x1b[32m✔ 已移除单仓库覆盖:\x1b[0m ${resolved.repoRoot}`)
        console.log(`  - 当前生效知识库: ${resolved.wikiDir} (${resolved.mode} / ${resolved.source})`)
        break
      }

      if (subCmd === 'reset') {
        const saved = resetGlobalConfig()
        console.log(`\x1b[32m✔ 已恢复默认配置:\x1b[0m storageMode=${saved.storageMode}, vaultDir=${saved.vaultDir}`)
        break
      }

      // default: show
      const { positional, storageOptions } = parseCommandArgs(subCmd === 'show' ? subArgs.slice(1) : subArgs)
      const inspectDir = path.resolve(positional[0] || process.cwd())
      const globalCfg = loadGlobalConfig()
      const resolved = resolveStoragePaths(inspectDir, storageOptions)

      console.log(`\x1b[36m[职方司存储配置]\x1b[0m`)
      console.log(`  - 配置文件路径: ${configPath}`)
      console.log(`  - 全局默认模式: ${globalCfg.storageMode} (默认 local 原位，可选 centralized 集中外置)`)
      console.log(`  - 集中外置 Vault: ${globalCfg.vaultDir}`)
      console.log(`  - L1 路由注册表: ${resolved.registryPath}`)
      console.log(`  - 单仓库覆盖数: ${Object.keys(globalCfg.repoOverrides).length}`)
      console.log(`\n\x1b[36m[当前项目解析结果]\x1b[0m`)
      console.log(`  - 源码仓库 (Repo): ${resolved.repoRoot}`)
      console.log(`  - 知识库根目录 (StorageRoot): ${resolved.storageRoot}`)
      console.log(`  - Wiki 目录 (WikiDir): ${resolved.wikiDir}`)
      console.log(`  - 生效模式: ${resolved.mode} (来源: ${resolved.source} | slug: ${resolved.slug})`)
      break
    }

    case 'repos':
    case 'registry': {
      const { positional, flags, storageOptions } = parseCommandArgs(args.slice(1))
      if (flags.register) {
        const targetDir = path.resolve(positional[0] || process.cwd())
        const storage = resolveStoragePaths(targetDir, storageOptions)
        const entry = upsertRepoRegistry(storage, {}, { force: true })
        console.log(`\x1b[32m✔ 已登记至 L1 跨项目路由注册表:\x1b[0m ${storage.registryPath}`)
        if (entry) {
          console.log(`  - Slug: ${entry.slug}`)
          console.log(`  - Repo: ${entry.repoPath}`)
          console.log(`  - Wiki: ${entry.wikiDir} (${entry.storageMode})`)
        }
        break
      }

      const query = positional.join(' ').trim() || undefined
      const globalCfg = loadGlobalConfig()
      const vaultDir = flags.vaultDir || process.env.ZHIFANGSI_VAULT_DIR || globalCfg.vaultDir
      const entries = searchRepoRegistry(query, flags.vaultDir)
      if (flags.json) {
        console.log(JSON.stringify(entries, null, 2))
      } else {
        console.log(
          formatRepoRegistryReport(entries, {
            query,
            vaultDir,
            storageMode: globalCfg.storageMode,
          })
        )
      }
      break
    }

    case 'init': {
      const { positional, flags, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())

      if (flags.minimal) {
        console.log(`\x1b[36m[职方司]\x1b[0m 正在初始化 Codebase Map 架构契约与 Wiki 目录 (极简模式): ${targetDir}...`)
        const result = initWikiProject(targetDir, { ...storageOptions, force: flags.force })
        console.log(`\x1b[32m✔ 初始化完成:\x1b[0m 项目「${result.projectName}」 (模式: ${result.storageMode})`)
        console.log(`  - 源码仓库: ${result.repoRoot}`)
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
        console.log(`\n\x1b[32m✔ 现在可在 LLM Wiki 桌面端直接「打开项目 (Open Project)」挂载 ${result.storageRoot}！\x1b[0m`)
        break
      }

      console.log(`\x1b[36m[职方司]\x1b[0m 正在一键初始化架构知识库并准备 LLM Wiki 接入: ${targetDir}...`)
      const result = await onboardWikiWorkspace({
        targetDir,
        ...storageOptions,
        force: flags.force,
        bootstrap: !flags.noBootstrap,
        prepSources: !flags.noPrep,
        generateMap: !flags.noMap,
        autoSync: !flags.noSync,
      })
      console.log('\n' + formatOnboardReport(result))
      break
    }

    case 'bootstrap': {
      const { positional, flags, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())
      console.log(`\x1b[36m[职方司]\x1b[0m 正在基于 AST 拓扑逆向聚类生成模块档案: ${targetDir}...`)
      const graph = buildWorkspaceGraph(targetDir)
      const res = bootstrapWikiModules(targetDir, graph, { ...storageOptions, force: flags.force })
      console.log(`\x1b[32m✔ 冷启动模块建档完成:\x1b[0m (知识库: ${res.wikiDir} | 模式: ${res.storageMode})`)
      res.modulesCreated.forEach((m) => console.log(`  + ${m}`))
      if (res.modulesSkipped.length > 0) {
        console.log(`  跳过已存在模块 (${res.modulesSkipped.length} 个，使用 --force 覆盖):`)
        res.modulesSkipped.forEach((m) => console.log(`  - ${m}`))
      }
      break
    }

    case 'map': {
      const { positional, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())
      const outFile = positional[1] ? path.resolve(positional[1]) : null
      console.log(`\x1b[36m[职方司]\x1b[0m 正在测绘代码库舆图: ${targetDir}...`)
      const bridge = new LLMWikiBridge()
      const bridgeOnline = await bridge.isAvailable()
      const graph = buildWorkspaceGraph(targetDir)
      const storage = resolveStoragePaths(targetDir, storageOptions)
      const output = formatZhifangsiMap(targetDir, graph, bridgeOnline, storageOptions)
      if (fs.existsSync(storage.wikiDir)) {
        upsertRepoRegistry(storage)
      }
      console.log('\n' + output)
      if (outFile) {
        fs.writeFileSync(outFile, output, 'utf-8')
        console.log(`\x1b[32m✔ 战略舆图已保存至:\x1b[0m ${outFile}`)
      }
      break
    }

    case 'skeleton': {
      const { positional, flags, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())
      if (flags.target) {
        const graph = buildWorkspaceGraph(targetDir)
        console.log(generateNeighborhoodSkeleton(targetDir, flags.target, graph, 1, storageOptions))
        break
      }
      const outFile = path.resolve(positional[1] || path.join(targetDir, 'codebase-skeleton.md'))
      console.log(`\x1b[36m[职方司]\x1b[0m 正在提取代码骨架: ${targetDir}...`)
      const result = generateCodebaseSkeleton(targetDir)
      fs.writeFileSync(outFile, result.markdown, 'utf-8')
      console.log(`\x1b[32m✔ 提取完成:\x1b[0m ${outFile}`)
      console.log(`  原代码行数: ${result.totalOriginalLines} -> 骨架行数: ${result.totalSkeletonLines}`)
      console.log(`  压缩率: \x1b[33m${(result.overallTokenSavings * 100).toFixed(1)}%\x1b[0m (文件数: ${result.filesProcessed})`)
      break
    }

    case 'impact': {
      const { positional, storageOptions } = parseCommandArgs(args.slice(1))
      const targetArg = positional[0] || ''
      const targetDir = path.resolve(positional[1] || process.cwd())
      if (!targetArg) {
        console.log(`用法: zhifangsi impact <file1,file2|module> [dir] [--wiki-dir <path>]`)
        break
      }
      const files = targetArg.split(',').map((s) => s.trim()).filter(Boolean)
      const graph = buildWorkspaceGraph(targetDir)
      const result = analyzeChangeImpact(targetDir, files, graph, storageOptions)
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
      const { positional, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())
      console.log(`\x1b[36m[职方司]\x1b[0m 同步本地 Wiki 页面至 LLM Wiki 桌面端...`)
      const report = await syncToLLMWiki({ projectDir: targetDir, ...storageOptions })
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
      const { positional, storageOptions } = parseCommandArgs(args.slice(1))
      const targetDir = path.resolve(positional[0] || process.cwd())
      const storage = resolveStoragePaths(targetDir, storageOptions)
      console.log(`\x1b[36m[职方司]\x1b[0m 正在巡检查验关防守则与架构不变量: ${targetDir} (知识库: ${storage.wikiDir})...`)
      const invariants = loadInvariantsFromWorkspace(targetDir, storageOptions)
      if (invariants.length === 0) {
        console.log(`\x1b[33m[提示]\x1b[0m 未在 \`${path.join(storage.wikiDir, 'invariants')}\` 发现任何关防守则 (.md 文件)。`)
        console.log(`您可在该目录下创建规范文档，定义诸如跨层调用限制与单向数据流规则。`)
        break
      }
      const graph = buildWorkspaceGraph(targetDir)
      const report = checkInvariants(invariants, graph, { rootDir: targetDir, ...storageOptions })
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
版本: ${getLocalVersion()} (支持独立运行与 LLM Wiki 桌面联动双模 | 原位/集中外置双存储)

安装与环境集成:
  zhifangsi install --copilot [--vscode-profile]                           全局注入 VS Code Copilot 8 项 Agent Skills、Instructions 与 MCP
  zhifangsi install --vscode [--global|--local]                            注入 VS Code 工作区套件 (.vscode/mcp.json + .github/skills + instructions)
  zhifangsi install [--antigravity|--copilot|--vscode|--qoder|--cursor|--claude|--all]
  zhifangsi update [target] [--check] [--git] [--force] [--proxy <url>]    自动识别 Git/NPM 升级、支持回滚并同步多宿主配置
  zhifangsi uninstall [--antigravity|--copilot|--vscode|--qoder|--cursor|--all]  从宿主环境中卸载技能、指令与 MCP 配置

存储配置与 L1 跨项目路由 (默认原位 <repo>/wiki，支持集中外置):
  zhifangsi config [show] [dir]                   查看全局存储配置与当前项目的知识库解析结果
  zhifangsi config set-mode <local|centralized>   切换默认存储模式 (local 原位 / centralized 集中外置)
  zhifangsi config set-vault <dir> [--centralized] 设置集中外置 Vault 根目录
  zhifangsi config set-repo [repoDir] <wikiDir>   为单个项目设置自定义知识库覆盖路径
  zhifangsi config unset-repo [repoDir]           移除单个项目的知识库路径覆盖
  zhifangsi config reset                          恢复默认配置 (local + ~/.zhifangsi/vault)
  zhifangsi repos [query] [--register [dir]]      检索或登记 L1 跨项目路由注册表 (供 Super-agent Router 定位 Repo)

核心测绘与巡检命令 (均支持 --wiki-dir / --vault-dir / --centralized / --local 覆盖):
  zhifangsi init [dir] [--force] [--minimal] 一键初始化架构契约、AST 模块建档、代码骨架源并联动 LLM Wiki
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
