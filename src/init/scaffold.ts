import * as fs from 'fs'
import * as path from 'path'

export interface InitProjectOptions {
  projectName?: string
  force?: boolean
  withObsidian?: boolean
  createSampleInvariant?: boolean
}

export interface InitProjectResult {
  projectName: string
  createdFiles: string[]
  createdDirs: string[]
  skippedFiles: string[]
  schemaPath: string
  wikiPath: string
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

export function generatePurposeContent(projectName: string, techStack: string): string {
  return `# Project Purpose — Codebase Map

## 1. 代码库概览 (Codebase Overview)

- **工程名称**: \`${projectName}\`
- **主要技术栈**: ${techStack}
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
  const root = path.resolve(targetDir)
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  const { name: detectedName, techStack } = detectProjectInfo(root)
  const projectName = options.projectName || detectedName

  const createdFiles: string[] = []
  const createdDirs: string[] = []
  const skippedFiles: string[] = []

  // Required directories for Codebase Map & LLM Wiki
  const requiredDirs = [
    'raw/sources',
    'raw/assets',
    'wiki',
    'wiki/modules',
    'wiki/workflows',
    'wiki/invariants',
    'wiki/adr',
    'wiki/concepts',
    'wiki/entities',
    'wiki/queries',
    'wiki/sources',
    'wiki/comparisons',
    'wiki/synthesis',
  ]

  if (options.withObsidian !== false) {
    requiredDirs.push('.obsidian')
  }

  for (const dir of requiredDirs) {
    const fullDirPath = path.join(root, dir)
    if (!fs.existsSync(fullDirPath)) {
      fs.mkdirSync(fullDirPath, { recursive: true })
      createdDirs.push(dir)
    }
  }

  const writeFileSafe = (relPath: string, content: string) => {
    const fullPath = path.join(root, relPath)
    if (fs.existsSync(fullPath) && !options.force) {
      skippedFiles.push(relPath)
      return
    }
    fs.writeFileSync(fullPath, content, 'utf-8')
    createdFiles.push(relPath)
  }

  // 1. schema.md
  writeFileSafe('schema.md', generateSchemaContent())

  // 2. purpose.md
  writeFileSafe('purpose.md', generatePurposeContent(projectName, techStack))

  // 3. wiki/index.md
  writeFileSafe('wiki/index.md', generateIndexContent())

  // 4. wiki/overview.md
  writeFileSafe('wiki/overview.md', generateOverviewContent(projectName))

  // 5. wiki/log.md
  writeFileSafe('wiki/log.md', generateLogContent())

  // 6. Sample invariant
  if (options.createSampleInvariant !== false) {
    writeFileSafe(
      'wiki/invariants/001-unidirectional-flow.md',
      generateSampleInvariantContent()
    )
  }

  // 7. Obsidian integration files
  if (options.withObsidian !== false) {
    const obsidianApp = {
      attachmentFolderPath: 'raw/assets',
      userIgnoreFilters: ['.cache', '.llm-wiki', '.superpowers', 'node_modules', '.git'],
      useMarkdownLinks: false,
      newLinkFormat: 'shortest',
      showUnsupportedFiles: false,
    }
    writeFileSafe('.obsidian/app.json', JSON.stringify(obsidianApp, null, 2))

    const obsidianAppearance = {
      baseFontSize: 16,
      theme: 'obsidian',
    }
    writeFileSafe('.obsidian/appearance.json', JSON.stringify(obsidianAppearance, null, 2))

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
    writeFileSafe('.obsidian/core-plugins.json', JSON.stringify(obsidianPlugins, null, 2))
  }

  return {
    projectName,
    createdFiles,
    createdDirs,
    skippedFiles,
    schemaPath: path.join(root, 'schema.md'),
    wikiPath: path.join(root, 'wiki'),
  }
}
