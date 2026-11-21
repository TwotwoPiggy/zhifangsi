import * as fs from 'fs'
import * as path from 'path'
import type { DependencyGraph } from '../ast/dependency-graph.js'
import {
  resolveStoragePaths,
  upsertRepoRegistry,
  type StorageResolveOptions,
} from '../config/storage.js'

export interface InitProjectOptions extends StorageResolveOptions {
  projectName?: string
  force?: boolean
  withObsidian?: boolean
  createSampleInvariant?: boolean
  registerRegistry?: boolean
}

export interface InitProjectResult {
  projectName: string
  createdFiles: string[]
  createdDirs: string[]
  skippedFiles: string[]
  repoRoot: string
  storageRoot: string
  storageMode: 'local' | 'centralized' | 'custom'
  schemaPath: string
  wikiPath: string
}

export interface BootstrapModulesOptions extends StorageResolveOptions {
  force?: boolean
  registerRegistry?: boolean
}

export interface BootstrapModulesResult {
  modulesCreated: string[]
  modulesSkipped: string[]
  wikiDir: string
  storageMode: 'local' | 'centralized' | 'custom'
}

function detectProjectInfo(targetDir: string): { name: string; techStack: string } {
  let name = path.basename(path.resolve(targetDir))
  const detectedStack: string[] = []

  const pkgJsonPath = path.join(targetDir, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      if (pkg.name) name = pkg.name
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['typescript']) detectedStack.push('TypeScript')
      else detectedStack.push('JavaScript / Node.js')
      if (deps['react']) detectedStack.push('React')
      if (deps['vue']) detectedStack.push('Vue')
      if (deps['@tauri-apps/api']) detectedStack.push('Tauri')
      if (deps['next']) detectedStack.push('Next.js')
    } catch {
      // ignore json parse failure
    }
  }

  if (fs.existsSync(path.join(targetDir, 'requirements.txt')) || fs.existsSync(path.join(targetDir, 'pyproject.toml'))) {
    detectedStack.push('Python')
  }
  if (fs.existsSync(path.join(targetDir, 'Cargo.toml'))) {
    detectedStack.push('Rust')
  }
  if (fs.existsSync(path.join(targetDir, 'go.mod'))) {
    detectedStack.push('Go')
  }

  const techStack = detectedStack.length > 0 ? detectedStack.join(', ') : '通用软件工程'
  return { name, techStack }
}

export function generateSchemaContent(): string {
  return `# Wiki Schema — Codebase Map & Living Architecture

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| entity | wiki/entities/ | 核心实体、数据结构、数据库表、共享状态接口 |
| concept | wiki/concepts/ | 核心概念、架构模式、领域原理、关键算法 |
| source | wiki/sources/ | 代码分析源、设计白皮书、技术规范、外部参考文档 |
| query | wiki/queries/ | 架构疑问、技术债务追踪、待调研重构项 |
| comparison | wiki/comparisons/ | 方案横向对比、选型评估、历史重构对比 |
| synthesis | wiki/synthesis/ | 跨模块架构总结、全景推演、里程碑结论 |
| module | wiki/modules/ | 业务子系统、服务、组件、核心包 (Module) 职责与导出 |
| workflow | wiki/workflows/ | 跨模块端到端业务流、数据时序流水线 (Workflow) |
| invariant | wiki/invariants/ | 关防守则、架构不变量、依赖禁令与合规准则 |
| adr | wiki/adr/ | 架构决策记录 (Architecture Decision Records) |

## Naming Conventions

- Files: \`kebab-case.md\`
- Modules: 模块或包名小写中划线 (如 \`auth-service.md\`, \`storage-engine.md\`, \`batch-play.md\`)
- Workflows: 动作或业务流命题 (如 \`user-login-flow.md\`, \`command-dispatch.md\`)
- Invariants: \`NNN-kebab-slug.md\` (如 \`001-unidirectional-data-flow.md\`, \`002-ui-layer-isolation.md\`)
- ADRs: \`adr-NNN-slug.md\` (如 \`adr-001-lancedb-vector-store.md\`, \`adr-002-tauri-migration.md\`)
- Entities / Concepts: 标准名称 (如 \`chat-session.md\`, \`pagerank-algorithm.md\`)

## Frontmatter 契约

所有页面均需包含基础 YAML Frontmatter：

\`\`\`yaml
---
type: module | workflow | invariant | adr | concept | entity | source | query | comparison | synthesis | overview
title: 页面标题名称
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
\`\`\`

### Module (模块页专属字段)
\`\`\`yaml
path: "src/path/to/module"       # 对应源码主目录或入口文件
layer: core | api | service | ui | infra | data | util # 所在架构层
exports: []                      # 核心导出 API / 类 / 接口
dependencies: []                 # 所依赖的模块页面或子系统
entrypoints: []                  # 主入口文件列表
\`\`\`

### Workflow (业务流水线专属字段)
\`\`\`yaml
trigger: "用户交互 / 定时触发 / API 路由"
participants: []                 # 参与该时序的模块列表
steps: []                        # 关键执行步骤与时序
state_changes: []                # 核心持久化状态变更
\`\`\`

### Invariant (关防守则 / 不变量专属字段)
\`\`\`yaml
severity: error | warning        # 违规严重级别
status: active | draft           # 守则状态 (draft 为试运行草稿，不阻断构建)
rules:                           # 自然语言守则声明
  - "禁止在 UI 组件层直接发起底层 DB 或跨层网络请求"
affected_modules: []             # 受此守则约束的模块页面 [[wiki/modules/xxx]]
constraints:                     # 机器可判定约束 (供 zhifangsi check 静态拦截)
  - type: deny_import
    from: "src/ui/**"
    disallowed:
      - "src/db/**"
\`\`\`

### ADR (架构决策记录专属字段)
\`\`\`yaml
status: proposed | accepted | rejected | deprecated | superseded
deciders: []                     # 架构师 / 决策人
date: YYYY-MM-DD
superseded_by: ""                # 被取代的 ADR 引用
\`\`\`

## 双向引用规范 (Cross-referencing Rules)

- 统一使用 \`[[page-slug]]\` 语法构建页面之间的拓扑关联。
- 所有工作流需链接至参与的 \`[[module-slug]]\`。
- 模块需标注塑造其演进的 \`[[adr-slug]]\` 与受控的 \`[[invariant-slug]]\`。
- 架构不变量在编译巡检不通过时，将在图谱中高亮弹劾对应模块。
`
}

export function generatePurposeContent(
  projectName: string,
  techStack: string,
  repoRoot?: string
): string {
  const repoLine = repoRoot ? `- **源码仓库路径**: \`${repoRoot}\`\n` : ''
  return `# Project Purpose — Codebase Map

## 1. 代码库概览 (Codebase Overview)

- **工程名称**: \`${projectName}\`
${repoLine}- **主要技术栈**: ${techStack}
- **架构范式**: <!-- 模块化单体 / 微服务 / 清洁架构 / 事件驱动 / 插件体系 -->

## 2. 核心使命与架构目标 (Core Mission & Goals)

<!-- 本系统解决什么核心业务问题？关键非功能性指标（性能、可靠性、离线可用、安全边界）是什么？ -->

- 核心使命：
- 关键架构指标：

## 3. 核心入口与物理布局 (Key Entrypoints & Layout)

<!-- 运行时主入口在哪里？核心子系统分布在哪些目录？ -->

- **运行入口**: 
- **核心目录划分**:
  - \`src/\`: 核心源代码

## 4. 关键关防守则与架构不变量 (Critical Invariants)

<!-- 绝对不可被破坏的架构铁律（可在 wiki/invariants/ 中落地为合规文件） -->

1. 层次分明：上层可调用下层，严禁下层反向耦合上层。
2. 模块解耦：跨模块交互通过公共导出接口，禁止私有实现越权直接穿透。
`
}

export function generateIndexContent(): string {
  return `# 架构索引导航 (Wiki Index)

## 1. 核心模块 (Modules)
<!-- - [[module-name]] — 模块简述 -->

## 2. 业务流水线 (Workflows)
<!-- - [[workflow-name]] — 业务流程简述 -->

## 3. 关防守则 (Invariants)
<!-- - [[001-unidirectional-flow]] — 状态单向流动守则 -->

## 4. 架构决策记录 (ADRs)
<!-- - [[adr-001-xxx]] — 决策简述 -->

## 5. 领域概念 (Concepts)

## 6. 数据实体与状态 (Entities)

## 7. 架构探索与技术债 (Queries)
`
}

export function generateOverviewContent(projectName: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `---
type: overview
title: ${projectName} 架构全景导图
tags: [architecture, codebase-map]
related: []
created: ${today}
updated: ${today}
---

# ${projectName} 架构全景导图

> 本文档由兵部职方司 (zhifangsi) 自动初始化维护，汇聚全库模块拓扑、关键路径与关防守则。

## 架构简述
<!-- 记录系统的总体逻辑分层与核心模块关联 -->

## 模块拓扑关系
\`\`\`mermaid
flowchart TD
  App[应用入口] --> Core[核心业务模块]
  Core --> Storage[持久化 / 数据交互]
\`\`\`

## 关防守则合规状态
运行 \`zhifangsi check\` 可对代码库进行静态合规巡检。
`
}

export function generateLogContent(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# 架构演进日志 (Research & Architecture Log)

## ${today}

- 职方司 (zhifangsi) 初始化项目架构认知骨架，生成标准 Codebase Map \`schema.md\` 与 \`wiki/\` 目录体系。
`
}

export function generateSampleInvariantContent(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `---
type: invariant
title: 架构分层解耦与单向依赖守则
severity: error
status: active
rules:
  - "表现层或外层组件严禁直接绕过服务层穿透底层持久化/数据库"
  - "模块间只允许通过公开接口或依赖注入调用，禁止循环依赖"
affected_modules: []
constraints: []
created: ${today}
updated: ${today}
---

# 架构分层解耦与单向依赖守则

## 背景与意图
保证系统各模块边界清晰，防止因跨层杂乱调用导致的面条代码和高耦合。

## 判定规则
1. UI / 客户端代码仅依赖 Service / API 层提供的导出。
2. 当发现不合规依赖时，\`zhifangsi check\` 命令将直接阻断并提示违规文件位置。
`
}

export function initWikiProject(
  targetDir: string,
  options: InitProjectOptions = {}
): InitProjectResult {
  const storage = resolveStoragePaths(targetDir, options)
  const repoRoot = storage.repoRoot
  const storageRoot = storage.storageRoot
  const wikiRoot = storage.wikiDir

  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true })
  }
  if (!fs.existsSync(wikiRoot)) {
    fs.mkdirSync(wikiRoot, { recursive: true })
  }

  const { name: detectedName, techStack } = detectProjectInfo(repoRoot)
  const projectName = options.projectName || detectedName

  const createdFiles: string[] = []
  const createdDirs: string[] = []
  const skippedFiles: string[] = []

  const rootDirs = ['raw/sources', 'raw/assets']
  if (options.withObsidian !== false) {
    rootDirs.push('.obsidian')
  }

  for (const dir of rootDirs) {
    const fullDirPath = path.join(storageRoot, dir)
    if (!fs.existsSync(fullDirPath)) {
      fs.mkdirSync(fullDirPath, { recursive: true })
      createdDirs.push(dir)
    }
  }

  const wikiSubDirs = [
    'modules',
    'workflows',
    'invariants',
    'adr',
    'concepts',
    'entities',
    'queries',
    'sources',
    'comparisons',
    'synthesis',
  ]
  const wikiRelPrefix = path.relative(storageRoot, wikiRoot).replace(/\\/g, '/')

  for (const sub of wikiSubDirs) {
    const fullDirPath = path.join(wikiRoot, sub)
    if (!fs.existsSync(fullDirPath)) {
      fs.mkdirSync(fullDirPath, { recursive: true })
      createdDirs.push(wikiRelPrefix ? `${wikiRelPrefix}/${sub}` : sub)
    }
  }

  const writeFileSafe = (baseDir: string, relPath: string, displayRel: string, content: string) => {
    const fullPath = path.join(baseDir, relPath)
    if (fs.existsSync(fullPath) && !options.force) {
      skippedFiles.push(displayRel)
      return
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    createdFiles.push(displayRel)
  }

  const wikiDisplay = (subPath: string) => (wikiRelPrefix ? `${wikiRelPrefix}/${subPath}` : subPath)

  writeFileSafe(storageRoot, 'schema.md', 'schema.md', generateSchemaContent())
  writeFileSafe(
    storageRoot,
    'purpose.md',
    'purpose.md',
    generatePurposeContent(projectName, techStack, storage.mode !== 'local' ? repoRoot : undefined)
  )
  writeFileSafe(wikiRoot, 'index.md', wikiDisplay('index.md'), generateIndexContent())
  writeFileSafe(wikiRoot, 'overview.md', wikiDisplay('overview.md'), generateOverviewContent(projectName))
  writeFileSafe(wikiRoot, 'log.md', wikiDisplay('log.md'), generateLogContent())

  if (options.createSampleInvariant !== false) {
    writeFileSafe(
      wikiRoot,
      'invariants/001-unidirectional-flow.md',
      wikiDisplay('invariants/001-unidirectional-flow.md'),
      generateSampleInvariantContent()
    )
  }

  if (options.withObsidian !== false) {
    const obsidianApp = {
      attachmentFolderPath: 'raw/assets',
      userIgnoreFilters: ['.cache', '.llm-wiki', '.superpowers', 'node_modules', '.git'],
      useMarkdownLinks: false,
      newLinkFormat: 'shortest',
      showUnsupportedFiles: false,
    }
    writeFileSafe(storageRoot, '.obsidian/app.json', '.obsidian/app.json', JSON.stringify(obsidianApp, null, 2))

    const obsidianAppearance = {
      baseFontSize: 16,
      theme: 'obsidian',
    }
    writeFileSafe(
      storageRoot,
      '.obsidian/appearance.json',
      '.obsidian/appearance.json',
      JSON.stringify(obsidianAppearance, null, 2)
    )

    const obsidianPlugins = {
      'file-explorer': true,
      'global-search': true,
      'graph': true,
      'backlink': true,
      'tag-pane': true,
      'page-preview': true,
      'outgoing-link': true,
      'starred': true,
    }
    writeFileSafe(
      storageRoot,
      '.obsidian/core-plugins.json',
      '.obsidian/core-plugins.json',
      JSON.stringify(obsidianPlugins, null, 2)
    )
  }

  if (options.registerRegistry !== false) {
    upsertRepoRegistry(storage, { name: projectName, techStack }, { force: options.registerRegistry === true })
  }

  return {
    projectName,
    createdFiles,
    createdDirs,
    skippedFiles,
    repoRoot,
    storageRoot,
    storageMode: storage.mode,
    schemaPath: path.join(storageRoot, 'schema.md'),
    wikiPath: wikiRoot,
  }
}

/**
 * 存量代码库冷启动自动建档：根据 AST 目录结构自动聚类生成 wiki/modules/*.md
 */
export function bootstrapWikiModules(
  targetDir: string,
  graph: DependencyGraph,
  options: BootstrapModulesOptions = {}
): BootstrapModulesResult {
  const storage = resolveStoragePaths(targetDir, options)
  const modulesDir = path.join(storage.wikiDir, 'modules')
  if (!fs.existsSync(modulesDir)) {
    fs.mkdirSync(modulesDir, { recursive: true })
  }

  const allFiles = graph.getAllFiles()
  const pageRanks = graph.computePageRank()
  const today = new Date().toISOString().slice(0, 10)

  // Group files into logical modules by directory (e.g., src/<mod>/... or top-level <mod>/...)
  const groups = new Map<string, { dirPath: string; files: string[] }>()

  for (const fileInfo of allFiles) {
    const parts = fileInfo.filePath.split('/')
    let modName = ''
    let dirPath = ''

    if (parts[0] === 'src' && parts.length >= 3) {
      modName = parts[1]
      dirPath = `src/${parts[1]}`
    } else if (parts.length >= 2 && parts[0] !== 'test' && parts[0] !== 'tests') {
      modName = parts[0] === 'src' ? path.basename(parts[1], path.extname(parts[1])) : parts[0]
      dirPath = parts[0] === 'src' ? fileInfo.filePath : parts[0]
    }

    if (!modName || modName === 'index') continue
    const slug = modName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

    if (!groups.has(slug)) {
      groups.set(slug, { dirPath, files: [] })
    }
    groups.get(slug)!.files.push(fileInfo.filePath)
  }

  // Map file -> module slug for cross-module dependency resolution
  const fileToModule = new Map<string, string>()
  for (const [slug, group] of groups.entries()) {
    for (const f of group.files) {
      fileToModule.set(f, slug)
    }
  }

  const modulesCreated: string[] = []
  const modulesSkipped: string[] = []

  for (const [slug, group] of groups.entries()) {
    const outPath = path.join(modulesDir, `${slug}.md`)
    if (fs.existsSync(outPath) && !options.force) {
      modulesSkipped.push(`wiki/modules/${slug}.md`)
      continue
    }

    // Sort module files by PageRank descending to pick top entrypoints
    const sortedFiles = [...group.files].sort(
      (a, b) => (pageRanks.get(b) || 0) - (pageRanks.get(a) || 0)
    )
    const entrypoints = sortedFiles.slice(0, 3)

    // Collect exported symbol names & signatures
    const exportNames: string[] = []
    const exportSignatures: string[] = []
    for (const f of sortedFiles) {
      const info = graph.getFileInfo(f)
      if (!info) continue
      for (const exp of info.exports) {
        if (!exportNames.includes(exp.name)) {
          exportNames.push(exp.name)
          exportSignatures.push(`- \`${exp.signature}\` (\`${f}:${exp.line}\`)`)
        }
      }
    }

    // Collect cross-module dependencies
    const depModules = new Set<string>()
    for (const f of group.files) {
      for (const targetFile of graph.getDependencies(f)) {
        const targetMod = fileToModule.get(targetFile)
        if (targetMod && targetMod !== slug) {
          depModules.add(`[[modules/${targetMod}]]`)
        }
      }
    }

    const md = [
      `---`,
      `type: module`,
      `title: ${slug} 模块`,
      `path: "${group.dirPath}"`,
      `entrypoints: [${entrypoints.map((e) => `"${e}"`).join(', ')}]`,
      `exports: [${exportNames.slice(0, 15).map((e) => `"${e}"`).join(', ')}]`,
      `dependencies: [${Array.from(depModules).map((d) => `"${d}"`).join(', ')}]`,
      `created: ${today}`,
      `updated: ${today}`,
      `---`,
      ``,
      `# ${slug} 模块架构档案`,
      ``,
      `> 本档案由职方司 (\`zhifangsi bootstrap\`) 基于 AST 拓扑逆向聚类生成。`,
      ``,
      `## 1. 模块位置与核心入口`,
      `- **源码路径**: \`${group.dirPath}\` (包含 ${group.files.length} 个源码文件)`,
      `- **核心枢纽入口**: ${entrypoints.map((e) => `\`${e}\``).join(', ')}`,
      `- **跨模块依赖**: ${depModules.size > 0 ? Array.from(depModules).join(', ') : '无外部模块依赖'}`,
      ``,
      `## 2. 公共导出契约 (Exported APIs)`,
      ...(exportSignatures.length > 0 ? exportSignatures.slice(0, 25) : ['*该模块暂无显式公共导出符号*']),
      ``,
    ].join('\n')

    fs.writeFileSync(outPath, md, 'utf-8')
    modulesCreated.push(`wiki/modules/${slug}.md`)
  }

  if (options.registerRegistry !== false) {
    upsertRepoRegistry(storage, {}, { force: options.registerRegistry === true })
  }

  return {
    modulesCreated,
    modulesSkipped,
    wikiDir: storage.wikiDir,
    storageMode: storage.mode,
  }
}
