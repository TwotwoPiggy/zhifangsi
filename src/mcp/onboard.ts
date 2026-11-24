import * as fs from 'fs'
import * as path from 'path'
import {
  initWikiProject,
  bootstrapWikiModules,
  prepareCodebaseSources,
  type InitProjectResult,
  type BootstrapModulesResult,
  type PrepareSourcesResult,
} from '../init/scaffold.js'
import { LLMWikiBridge } from '../bridge/client.js'
import { syncToLLMWiki, type SyncReport } from '../bridge/sync.js'
import {
  resolveStoragePaths,
  type StorageResolveOptions,
} from '../config/storage.js'
import { buildWorkspaceGraph, formatZhifangsiMap } from './helpers.js'

export interface OnboardOptions extends StorageResolveOptions {
  targetDir: string
  projectName?: string
  force?: boolean
  /** 是否执行 AST 聚类生成 wiki/modules/*.md，默认 true */
  bootstrap?: boolean
  /** 是否提取子系统代码骨架并抄送 CODEBASE_MAP.md 到 raw/sources/，默认 true */
  prepSources?: boolean
  /** 若 <repoRoot>/CODEBASE_MAP.md 尚不存在（或 force=true），是否自动测绘生成，默认 true */
  generateMap?: boolean
  /** 若 LLM Wiki 桌面端在线且项目已挂载，是否自动执行向量同步与源重扫，默认 true */
  autoSync?: boolean
  registerRegistry?: boolean
}

export type OnboardBridgeState =
  | 'synced'
  | 'online-mounted'
  | 'online-unmounted'
  | 'offline'

export interface OnboardResult {
  projectName: string
  repoRoot: string
  storageRoot: string
  wikiDir: string
  storageMode: 'local' | 'centralized' | 'custom'
  init: InitProjectResult
  bootstrap?: BootstrapModulesResult
  codebaseMapPath?: string
  codebaseMapGenerated: boolean
  codebaseMapExisted: boolean
  prepSources?: PrepareSourcesResult
  bridgeState: OnboardBridgeState
  bridgeProjectId?: string
  bridgeProjectName?: string
  sync?: SyncReport
  sourcesRescanned: boolean
}

/**
 * 一键完成代码库冷启动建档与 LLM Wiki 接入编排：
 * 1. 初始化 schema.md / purpose.md / wiki/ 10类子目录 / raw/sources/ / .obsidian/
 * 2. AST 拓扑聚类生成 wiki/modules/*.md 档案与双链
 * 3. 复用或生成 CODEBASE_MAP.md 战略舆图
 * 4. 提取高密度子系统代码骨架与舆图副本到 raw/sources/
 * 5. 探测 LLM Wiki 桌面端：已挂载则自动同步向量库与重扫源，未挂载则给出精准挂载指引
 */
export async function onboardWikiWorkspace(
  options: OnboardOptions,
  bridge = new LLMWikiBridge()
): Promise<OnboardResult> {
  const storageOptions: StorageResolveOptions = {
    wikiDir: options.wikiDir,
    storageMode: options.storageMode,
    vaultDir: options.vaultDir,
    configPath: options.configPath,
  }
  const storage = resolveStoragePaths(options.targetDir, storageOptions)

  // Step 1: 初始化 Wiki 骨架与 L1 注册表
  const initResult = initWikiProject(options.targetDir, {
    ...storageOptions,
    projectName: options.projectName,
    force: options.force,
    registerRegistry: options.registerRegistry,
  })

  // Step 2: 构建 AST 图（供 bootstrap 与 map 共用）
  const wantBootstrap = options.bootstrap !== false
  const wantMap = options.generateMap !== false
  const mapFilePath = path.join(storage.repoRoot, 'CODEBASE_MAP.md')
  const mapAlreadyExists = fs.existsSync(mapFilePath)
  const needGenerateMap = wantMap && (!mapAlreadyExists || Boolean(options.force))

  const bridgeOnline = await bridge.isAvailable()

  let graph = wantBootstrap || needGenerateMap ? buildWorkspaceGraph(storage.repoRoot) : undefined

  let bootstrapResult: BootstrapModulesResult | undefined
  if (wantBootstrap && graph) {
    bootstrapResult = bootstrapWikiModules(storage.repoRoot, graph, {
      ...storageOptions,
      force: options.force,
      registerRegistry: options.registerRegistry,
    })
  }

  // Step 3: 复用已有或生成 CODEBASE_MAP.md
  let codebaseMapGenerated = false
  if (needGenerateMap && graph) {
    const mapMarkdown = formatZhifangsiMap(storage.repoRoot, graph, bridgeOnline, storageOptions)
    fs.writeFileSync(mapFilePath, mapMarkdown, 'utf-8')
    codebaseMapGenerated = true
  }

  // Step 4: 提取代码骨架 & 抄送 CODEBASE_MAP.md 到 raw/sources/
  let prepResult: PrepareSourcesResult | undefined
  if (options.prepSources !== false) {
    prepResult = prepareCodebaseSources(storage.repoRoot, {
      ...storageOptions,
      force: options.force,
      copyCodebaseMap: true,
    })
  }

  // Step 5: 探测 LLM Wiki 桌面桥接并决定自动同步或给出挂载指引
  let bridgeState: OnboardBridgeState = 'offline'
  let bridgeProjectId: string | undefined
  let bridgeProjectName: string | undefined
  let syncReport: SyncReport | undefined
  let sourcesRescanned = false

  if (bridgeOnline) {
    const matchedProject =
      (await bridge.findProjectByPath(storage.repoRoot)) ||
      (storage.storageRoot !== storage.repoRoot
        ? await bridge.findProjectByPath(storage.storageRoot)
        : null)

    if (!matchedProject) {
      bridgeState = 'online-unmounted'
    } else {
      bridgeProjectId = matchedProject.id
      bridgeProjectName = matchedProject.name

      if (options.autoSync !== false) {
        syncReport = await syncToLLMWiki(
          {
            projectDir: storage.repoRoot,
            ...storageOptions,
          },
          bridge
        )
        bridgeState = 'synced'
        if (prepResult && (prepResult.subsystemFiles.length > 0 || prepResult.copiedCodebaseMap)) {
          try {
            sourcesRescanned = await bridge.rescanSources(matchedProject.id)
          } catch {
            sourcesRescanned = false
          }
        }
      } else {
        bridgeState = 'online-mounted'
      }
    }
  }

  return {
    projectName: initResult.projectName,
    repoRoot: storage.repoRoot,
    storageRoot: storage.storageRoot,
    wikiDir: storage.wikiDir,
    storageMode: storage.mode,
    init: initResult,
    bootstrap: bootstrapResult,
    codebaseMapPath: fs.existsSync(mapFilePath) ? mapFilePath : undefined,
    codebaseMapGenerated,
    codebaseMapExisted: mapAlreadyExists,
    prepSources: prepResult,
    bridgeState,
    bridgeProjectId,
    bridgeProjectName,
    sync: syncReport,
    sourcesRescanned,
  }
}

/**
 * 将一键初始化与接入结果格式化为清晰易读的 Markdown 报告
 */
export function formatOnboardReport(result: OnboardResult): string {
  const lines: string[] = []
  const modeLabel =
    result.storageMode === 'centralized'
      ? '集中外置 (centralized)'
      : result.storageMode === 'custom'
        ? '自定义覆盖 (custom)'
        : '原位本地 (local)'

  lines.push(`# 职方司一键初始化与 LLM Wiki 接入报告`)
  lines.push(`> 项目: **${result.projectName}** | 模式: ${modeLabel}`)
  lines.push('')
  lines.push(`## 1. 路径定位`)
  lines.push(`- **源码仓库 (Repo)**: \`${result.repoRoot}\``)
  lines.push(`- **LLM Wiki 挂载根目录 (StorageRoot)**: \`${result.storageRoot}\``)
  lines.push(`- **架构知识库 (WikiDir)**: \`${result.wikiDir}\``)
  lines.push('')

  lines.push(`## 2. 执行明细`)
  lines.push(
    `- **Wiki 架构骨架 (\`init\`)**: 新建 ${result.init.createdFiles.length} 个文件，跳过 ${result.init.skippedFiles.length} 个已存在文件`
  )

  if (result.bootstrap) {
    lines.push(
      `- **AST 模块聚类建档 (\`bootstrap\`)**: 新建 ${result.bootstrap.modulesCreated.length} 个模块档案，跳过 ${result.bootstrap.modulesSkipped.length} 个`
    )
    if (result.bootstrap.modulesCreated.length > 0) {
      lines.push(
        `  - 新增模块: ${result.bootstrap.modulesCreated.slice(0, 12).map((m) => `\`${m}\``).join(', ')}${result.bootstrap.modulesCreated.length > 12 ? ' ...' : ''}`
      )
    }
  }

  if (result.codebaseMapPath) {
    const mapNote = result.codebaseMapGenerated ? '已自动测绘生成' : '已复用现有舆图'
    lines.push(`- **战略舆图 (\`CODEBASE_MAP.md\`)**: ${mapNote} (\`${result.codebaseMapPath}\`)`)
  }

  if (result.prepSources) {
    const p = result.prepSources
    lines.push(
      `- **LLM Wiki 原始情报源 (\`raw/sources/\`)**: 处理 ${p.filesProcessed} 个源码文件，输出 ${p.subsystemFiles.length} 个子系统骨架（跳过 ${p.skippedFiles.length} 个，Token 压缩率约 ${p.tokenSavingsPct}%）${p.copiedCodebaseMap ? '，并已抄送 `CODEBASE_MAP.md`' : ''}`
    )
  }

  lines.push('')
  lines.push(`## 3. LLM Wiki 桌面端联动状态`)
  if (result.bridgeState === 'synced') {
    const count = result.sync?.pagesSynced.length || 0
    lines.push(
      `- **状态**: ✅ 桌面端在线且已挂载项目「${result.bridgeProjectName || result.projectName}」，已自动完成向量同步（嵌入 **${count}** 个架构页面${result.sourcesRescanned ? '，并触发原始源重扫' : ''}）。`
    )
    lines.push(`- **现在可用**: 直接在 LLM Wiki 桌面端查看知识图谱，或在 Agent 中通过 \`zhifangsi_search\` 使用 LanceDB 混合语义检索。`)
  } else if (result.bridgeState === 'online-mounted') {
    lines.push(
      `- **状态**: ✅ 桌面端在线且已挂载项目「${result.bridgeProjectName || result.projectName}」（本次跳过了自动同步，可随时执行 \`/zhifangsi-sync\`）。`
    )
  } else if (result.bridgeState === 'online-unmounted') {
    lines.push(`- **状态**: 🟡 桌面端已在线（\`127.0.0.1:19828\`），但尚未挂载本项目。`)
    lines.push(`- **下一步（仅需 2 步完成最终接入）**:`)
    lines.push(`  1. 在 LLM Wiki 桌面端点击「打开项目 (Open Project)」，选择目录：\`${result.storageRoot}\`（⚠️ 不要选里面嵌套的 \`wiki\` 子目录）。`)
    lines.push(`  2. 挂载后运行 \`zhifangsi sync "${result.repoRoot}"\` 或在对话中输入 \`/zhifangsi-sync\` 完成向量索引嵌入。`)
  } else {
    lines.push(`- **状态**: ⚪ LLM Wiki 桌面端未运行（纯本地独立模式已完全就绪）。`)
    lines.push(`- **说明**: 本地架构档案、代码骨架与 L1 注册表已全部生成完毕；后续启动 LLM Wiki 桌面端后，打开 \`${result.storageRoot}\` 并运行 \`/zhifangsi-sync\` 即可无缝接入图谱与向量检索。`)
  }

  return lines.join('\n')
}
