# 职方司 (zhifangsi)

[![npm version](https://img.shields.io/npm/v/zhifangsi.svg)](https://www.npmjs.com/package/zhifangsi)
[![Node.js](https://img.shields.io/node/v/zhifangsi.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-TwotwoPiggy%2Fzhifangsi-181717?logo=github)](https://github.com/TwotwoPiggy/zhifangsi)

> **兵部职方清吏司** —— 执掌天下舆地图册、绘制城池险要、测绘关防隘口、记录水陆驿道里程。  
> 专为现代软件工程与自主 AI 研发 Agent（Antigravity / Qoder / Copilot / Cursor / Claude Code）打造的**代码库战略舆图、关防守则与自愈架构引擎**。

---

## 🏛️ 体系定位与“三位一体”协同

职方司在整体 AI 研发工具体系中，与现有系统形成三位一体的协同格局：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI 研发自主协同三位一体体系                      │
├───────────────────┬────────────────────┬───────────────────────────────┤
│    sansheng-liubu │    yongle-dadian   │           zhifangsi           │
│     （三省六部）   │     （永乐大典）   │           （职方司）          │
├───────────────────┼────────────────────┼───────────────────────────────┤
│  统领【研发流程】  │  统领【宏观知识】  │  专精【代码库战略舆图与守则】 │
│  中书省：起草对齐  │  跨项目通用技术    │  模块（Modules）：山川险隘    │
│  门下省：门禁审核  │  全局 Bug 经验沉淀 │  工作流（Workflows）：兵马时序│
│  尚书省：调度六部  │  最佳实践百科库    │  不变量（Invariants）：关防守则│
│                    │                    │  实测拓扑（AST）：经纬度网    │
└───────────────────┴────────────────────┴───────────────────────────────┘
```

> 💡 **理论基石与思想渊源**：  
> 职方司的知识层体系设计深度借鉴了 Andrej Karpathy 提出的 **[llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** 范式（Raw sources / The wiki / The schema），将代码库事实作为不可变源头，通过确定性 AST 与骨架提取化解大模型的簿记成本（Bookkeeping burden），建立起由 AI Agent 与开发者协同自愈的代码库战略认知舆图。

---

## 🌟 核心能力矩阵

### 1. 经纬实测（Deterministic AST Engine）
- 原生支持 **TypeScript / JavaScript、Python、Rust、Go、Java、C#** 多语言静态解析，支持多行导入、重导出（Re-export）、`@/` 别名与 TS ESM `.js` 映射；
- 毫秒级构建文件级依赖有向图（Dependency Graph），自动检测并报告**循环依赖环（Cycles）**；
- 深度影响闭包与**变更爆炸半径评估（Impact Analysis）**：单文件或多文件变动即刻反查受波及模块、需回归测试的业务流，以及高危核心关隘防撞车预警。

### 2. 核心关隘识别（PageRank Hubs）
- 基于图拓扑中心度算法，自动测算代码库中耦合度最高、最不可动摇的**核心枢纽文件（Hubs）**；
- 输出入度（In-degree）、出度（Out-degree）与 PageRank 权重，辅助架构重构决策与多 Agent 并发防冲突。

### 3. 局部邻域代码骨架提取（Inline & Spill Skeletonizer）
- 智能剥离函数实现细节，完整保留接口、类型、类、函数签名契约与导出声明，达到 **85%+ Token 降噪压缩率**；
- 支持全库骨架提取及 **`--target <file|module>` 局部邻域骨架**，基于局部性原理仅内联目标模块与 1 跳邻居契约，大幅降低 LLM 上下文消耗。

### 4. 存量工程冷启动建档（Init & Bootstrap）
- **`zhifangsi init`**：原位初始化 `schema.md` 架构契约与 `wiki/` 知识库目录结构，可直接被 LLM Wiki 桌面端挂载；
- **`zhifangsi bootstrap`**：基于 AST 目录拓扑自动聚类生成 `wiki/modules/*.md` 模块档案（含核心入口、导出 API 签名契约与跨模块双链依赖）。

### 5. 关防守则、循环依赖与舆图失真巡检（Invariants & Drift Check）🎯
- **静态合规硬阻断**：将架构分层与边界规则具象化为可验证的静态约束，精准报告违规文件路径与行号；
- **草稿试运行与失真告警**：支持 `status: draft` 草稿规则试运行，自动检测循环依赖及 Wiki 舆图失真（Drift）；
- **自然语言规则推断**：除标准 YAML 约束外，支持在 Markdown Frontmatter 的 `rules` 中直接书写自然语言规则（如 `"禁止在 UI 组件层直接读写 DB"`），自动编译为 AST 静态约束；
- **三种经典约束**：
  - `deny_import`：显式禁止跨层或跨模块越权依赖；
  - `allow_only`：白名单模式，限定模块只能单向依赖指定下层；
  - `isolated_module`：私有内部实现隔离，仅受信任文件允许导入。

### 6. 双模驱动（Dual Mode）
- **单机独立模式 (Standalone)**：纯本地零外部依赖运行，提供本地 AST 测绘、骨架提取、不变量巡检与本地 Wiki + AST 符号混合检索；
- **LLM Wiki 联动模式 (Bridge Mode)**：自动探测本地 LLM Wiki 桌面客户端（`http://127.0.0.1:19828`），开启 Sigma.js 知识图谱画布同步、LanceDB 向量混合检索与增量页面嵌入。

---

## 📦 快速开始与安装 (Installation)

> 环境要求：Node.js `>= 18.0.0`

### 途径 A：通过 NPM 全局安装 / `npx` 一键接入（推荐）

```bash
# 1. 全局安装 zhifangsi CLI 与独立 MCP 命令 (zhifangsi-mcp)
npm install -g zhifangsi

# 2. 一键将 6 项 Skills 与 9 大 MCP 军机工具注入 Antigravity
zhifangsi install --antigravity

# 或免全局安装，直接通过 npx 一键注入：
npx zhifangsi --antigravity

# 可选：为当前工程自动写入 VS Code / Qoder / Cursor / Claude Code 的 MCP 配置
zhifangsi install --vscode
zhifangsi install --qoder
zhifangsi install --cursor
zhifangsi install --all
```

### 途径 B：通过 GitHub 远端源直接 NPM 安装

```bash
npm install -g git+https://github.com/TwotwoPiggy/zhifangsi.git
zhifangsi install --antigravity
```

### 途径 C：本地源码构建与开发链接

```bash
git clone https://github.com/TwotwoPiggy/zhifangsi.git
cd zhifangsi
npm install
npm run build
npm link
zhifangsi install --antigravity
```

### 🔄 升级与卸载

```bash
# 自动检测 NPM / GitHub 最新版本并原地升级 + 同步刷新宿主环境配置
zhifangsi update

# 强制从 GitHub 主干更新
zhifangsi update --git

# 从宿主环境中清理已注入的 Skills 与 MCP 配置
zhifangsi uninstall
```

### 🧪 运行测试与发布预检（28/28 全通）

```bash
npm run typecheck
npm test
npm run release:dry-run
```

---

## 💻 命令行手册 (CLI Usage)

全局安装后可在任意项目根目录直接执行 `zhifangsi`：

```bash
# 0. 安装 / 升级 / 卸载宿主环境集成
zhifangsi install [--antigravity|--vscode|--qoder|--cursor|--claude|--all]
zhifangsi update [--git]
zhifangsi uninstall

# 1. 原位初始化代码库 Codebase Map 架构契约 (生成 schema.md 及 wiki/ 目录)
zhifangsi init [代码库路径] [--force]

# 2. 存量代码库冷启动自动建档 (基于 AST 目录拓扑逆向聚类生成 wiki/modules/*.md)
zhifangsi bootstrap [代码库路径] [--force]

# 3. 测绘代码库战略舆图（展示核心关隘、循环依赖预警、注册模块与守则状态，支持保存文件）
zhifangsi map [代码库路径] [输出文件路径]

# 4. 执行关防守则、循环依赖与 Wiki 舆图失真静态合规巡检（存在阻断级错误时退出码为 1）
zhifangsi check [代码库路径]
# 别名: zhifangsi lint / zhifangsi invariants

# 5. 提取代码骨架 (85%+ 压缩率，支持 --target <file|module> 局部邻域骨架)
zhifangsi skeleton [代码库路径] [输出文件路径]
zhifangsi skeleton [代码库路径] --target src/ast/dependency-graph.ts

# 6. 评估拟修改文件的变更爆炸半径、波及模块、回归业务流与核心关隘防撞车预警
zhifangsi impact <file1,file2|module> [代码库路径]

# 7. 探测与 LLM Wiki 桌面端（127.0.0.1:19828）的桥接连接状态
zhifangsi bridge

# 8. 将本地 wiki/ 架构文档增量同步至 LLM Wiki 桌面端向量索引
zhifangsi sync [代码库路径]

# 9. 启动标准 stdio MCP 2.0 服务（亦可使用独立命令 zhifangsi-mcp）
zhifangsi mcp

# 10. 查看版本与帮助
zhifangsi --version
zhifangsi help
```

---

## 🛡️ 关防守则配置规范 (`wiki/invariants/`)

在项目的 `wiki/invariants/` 目录下创建 `.md` 文档，即可为该代码库订立关防守则：

### 契约示例：`wiki/invariants/unidirectional-flow.md`

```markdown
---
id: unidirectional-flow
type: invariant
title: 状态单向流动与组件解耦
severity: error # error | warning
status: active  # active | draft (草稿试运行模式，不阻断 CI)
description: 限制 UI 层直接访问底层存储，保证单向数据流与清晰的层次边界。
rules:
  - "禁止在 UI 组件层直接发起底层网络/DB 读写"
  - "src/components/* 只能依赖 src/stores/*，严禁反向依赖"
affected_modules:
  - "[[modules/graph-renderer]]"
  - "[[modules/wiki-store]]"
constraints:
  - type: deny_import
    from: "src/components/**"
    disallowed:
      - "src/db/**"
      - "src/network/**"
    message: "UI 组件层严禁直接发起底层数据库或网络读写"
  - type: allow_only
    from: "src/controllers/**"
    allowed:
      - "src/services/**"
      - "src/models/**"
    message: "Controller 层仅允许依赖 Service 和 Model"
---

# 状态单向流动与组件解耦

## 架构决策背景
详述本规则的 ADR 背景、防范的技术债务与团队共识。
```

---

## 🤖 MCP 2.0 军机工具集（9 大工具）

职方司基于标准 `@modelcontextprotocol/sdk` 实现，向 Antigravity、Qoder、VS Code Copilot、Cursor、Claude Code 等 Agent 暴露以下 9 大军机工具：

| 工具名称 | 作用说明 | 参数 |
| :--- | :--- | :--- |
| `zhifangsi_map` | 获取并持久化代码库全景战略舆图、PageRank 核心关隘、循环依赖预警与守则状态 | `target_dir`, `output_file` (可选) |
| `zhifangsi_check_invariants` | 运行关防守则静态合规巡检，检测越权依赖、循环依赖与 Wiki 舆图失真（Drift） | `target_dir` (可选) |
| `zhifangsi_skeleton` | 基于局部性原理（Inline & Spill）提取目标文件/模块 1 跳邻域骨架或全库骨架 | `target`, `hops`, `target_dir` (均可选) |
| `zhifangsi_impact` | 评估拟修改文件的变更爆炸半径、波及模块、需回归业务流及核心关隘防撞车预警 | `files` (必填), `target_dir` (可选) |
| `zhifangsi_bootstrap` | 存量代码库冷启动自动建档，基于 AST 目录拓扑聚类生成 `wiki/modules/*.md` | `target_dir`, `force` (可选) |
| `zhifangsi_module_info` | 查询特定模块（支持模块名或目录路径）的职责定义、公共 API 导出契约与影响范围 | `module_name` (必填), `target_dir` (可选) |
| `zhifangsi_workflow_trace` | 追踪核心业务流水线的端到端调用时序与阶段步骤 | `workflow_name` (必填), `target_dir` (可选) |
| `zhifangsi_search` | 混合语义检索（桌面端在线走 LanceDB 向量检索，离线自动回退本地 Wiki + AST 符号） | `query` (必填), `target_dir` (可选) |
| `zhifangsi_bridge_status` | 检查与 LLM Wiki 桌面端（`127.0.0.1:19828`）的桥接协同状态 | 无 |

### Antigravity 斜杠技能组（6 项 Skills）

通过 `zhifangsi install --antigravity` 自动注册以下技能：
- `/zhifangsi`：主战略舆图与架构自愈中枢技能
- `/zhifangsi-map`：测绘并持久化生成 `CODEBASE_MAP.md`
- `/zhifangsi-check`：执行关防守则与架构不变量静态巡检
- `/zhifangsi-skeleton`：提取 85%+ 压缩率代码骨架
- `/zhifangsi-trace`：追踪核心业务流调用时序
- `/zhifangsi-sync`：增量同步本地架构 Wiki 至 LLM Wiki 桌面端

### IDE MCP 配置示例

推荐直接运行 `zhifangsi install --vscode` / `--qoder` / `--cursor` 一键生成，也可手动配置：

#### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "zhifangsi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "zhifangsi", "mcp"]
    }
  }
}
```

#### Qoder / Claude Code (`.mcp.json`) / Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "zhifangsi": {
      "command": "npx",
      "args": ["-y", "zhifangsi", "mcp"]
    }
  }
}
```

> 若已全局安装 `zhifangsi`，也可将 `"command"` 直接设为 `"zhifangsi-mcp"`（无需 `args`），启动更快。

---

## 📁 目录结构

```
zhifangsi/
├── bin/
│   ├── zhifangsi.mjs           # CLI 主入口 (map / check / skeleton / impact / init / bootstrap / install / update)
│   └── zhifangsi-mcp.mjs       # 独立 Stdio MCP Server 可执行入口
├── src/
│   ├── ast/                    # 经纬实测确定性引擎
│   │   ├── types.ts            # 符号表与拓扑图类型定义
│   │   ├── parser.ts           # 多语言符号与导入解析器 (TS/JS/Py/Rust/Go/Java/C#)
│   │   ├── dependency-graph.ts # DAG、循环依赖检测、深度反查与 PageRank 算法
│   │   └── skeletonizer.ts     # 85%+ 压缩率代码骨架提取器
│   ├── init/                   # 架构脚手架与冷启动逆向建档引擎
│   │   └── scaffold.ts         # initWikiProject 与 bootstrapWikiModules
│   ├── invariants/             # 关防守则与架构不变量系统
│   │   ├── types.ts            # 守则、约束、Drift 与违规记录契约
│   │   ├── parser.ts           # 零依赖 YAML 解析与自然语言规则推断
│   │   └── checker.ts          # 跨平台 Glob 匹配、循环检测与 AST 合规核查器
│   ├── bridge/                 # LLM Wiki 桌面双模桥接器
│   │   ├── client.ts           # HTTP REST 客户端 (127.0.0.1:19828)
│   │   └── sync.ts             # 本地 Wiki 向量化增量同步
│   ├── mcp/                    # MCP 2.0 服务端与 9 大工具实现
│   │   ├── helpers.ts          # 战略舆图拼装、邻域骨架与爆炸半径分析
│   │   └── server.ts           # Stdio MCP Server 实现
│   └── index.ts                # 统一 API 导出
├── scripts/
│   ├── install-antigravity.mjs # 跨环境 Skills & MCP 一键安装/卸载脚本
│   ├── release.mjs             # 版本升级、测试自检、打 Tag 与 NPM 发布脚本
│   └── codebase-prep.mjs       # LLM Wiki 源码骨架预处理脚本
├── skills/                     # Antigravity 专项指令子技能 (5 项)
├── wiki/
│   └── invariants/             # 代码库自身架构关防守则规范文档
├── test/                       # 自动化测试套件 (Vitest, 28 tests)
├── .github/workflows/          # CI 跨平台测试与 NPM 自动发布流水线
├── SKILL.md                    # 主 Skill 定义
└── package.json
```

---

## 🔗 理论基石与参考

- **[llm-wiki (Andrej Karpathy)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** —— 探讨以 LLM 免除知识库簿记维护成本、实现 `Raw sources` / `The wiki` / `The schema` 三层自治体系的开创性思路。
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** —— 标准化 AI Agent 与研发工具链上下文交互规范。

---

## 📜 开源协议

[MIT License](LICENSE)
