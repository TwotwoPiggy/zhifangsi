# 职方司 (zhifangsi)

> **兵部职方清吏司** —— 执掌天下舆地图册、绘制城池险要、测绘关防隘口、记录水陆驿道里程。  
> 专为现代软件工程与自主 AI 研发 Agent（Antigravity / Qoder / Copilot）打造的**代码库战略舆图、关防守则与自愈架构引擎**。

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
> 职方司的知识层体系设计深度借鉴了 Andrej Karpathy 提出的 **[llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** 范式（Raw sources / The wiki / The schema），将代码库事实作为不可变源头，通过确定性 AST 与骨架提取化解大模型的薄记成本（Bookkeeping burden），建立起由 AI Agent 与开发者协同自愈的代码库战略认知舆图。

---

## 🌟 核心能力矩阵

### 1. 经纬实测（Deterministic AST Engine）
- 原生支持 **TypeScript / JavaScript、Python、Rust、Go** 多语言语法分析；
- 毫秒级构建代码文件级的依赖有向无环图（Dependency DAG）；
- 深度影响闭包分析（Reverse Dependency Impact Analyzer），单文件变动即刻反查受波及的全部调用方。

### 2. 核心关隘识别（PageRank Hubs）
- 基于图拓扑中心度算法，自动测算代码库中耦合度最高、最不可动摇的**核心枢纽文件（Hubs）**；
- 输出入度（In-degree）、出度（Out-degree）与 PageRank 权重，辅助重构决策与依赖解耦。

### 3. 代码骨架提取（Skeletonizer）
- 智能剥离函数实现细节，完整保留接口、类型、类、函数签名契约与导出声明；
- 达到 **85%+ 的 Token 降噪压缩率**，在极小上下文损耗下向 LLM 投喂整个代码库架构视图。

### 4. 关防守则与架构不变量系统（Invariants & Rules）🎯
- **静态合规硬阻断**：将抽象的架构分层与不可逾越的规则具象化为机器可验证的静态网络；
- **精准行号定位**：违规导入直接报告到代码具体行号，支持精确报错；
- **智能规则推断**：除了标准 YAML 约束外，支持直接在 Markdown Frontmatter 的 `rules` 中书写自然语言规则（如 `"禁止在 UI 组件层直接读写 DB"`、`"src/components/* 只能依赖 src/stores/*，严禁反向依赖"`），引擎自动编译为 AST 静态约束；
- **三种经典约束**：
  - `deny_import`：显式禁止跨层或跨模块越权依赖；
  - `allow_only`：白名单模式，限定模块只能单向依赖指定下层；
  - `isolated_module`：私有内部实现隔离，仅受信任文件允许导入。

### 5. 双模驱动（Dual Mode）
- **单机独立模式 (Standalone)**：纯本地运行，零外部依赖，毫秒级 CLI 与 MCP 工具服务；
- **LLM Wiki 联动模式 (Bridge Mode)**：深度联动践行 Andrej Karpathy 提出的 [llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 范式，自动探测桌面客户端（`127.0.0.1:19828`），赋予向量混合检索、知识图谱可视化画布与自动页面嵌入能力。

---

## 📦 快速开始

### 1. 安装与构建

```bash
cd D:\Computers\AIDevelop\Tools\Skills\zhifangsi
npm install
npm run build
```

### 2. 运行单元测试（21/21 全通）

```bash
npm test
```

---

## 💻 命令行手册 (CLI Usage)

全局或直接使用 Node 执行 `bin/zhifangsi.mjs`：

```bash
# 1. 测绘代码库战略舆图（展示核心关隘、注册模块与关防守则状态）
node ./bin/zhifangsi.mjs map [代码库路径]

# 2. 执行关防守则与架构不变量静态合规巡检（存在阻断级错误时返回退出码 1）
node ./bin/zhifangsi.mjs check [代码库路径]
# 别名: lint 或 invariants
node ./bin/zhifangsi.mjs lint

# 3. 提取代码骨架 (85%+ 压缩率，输出 codebase-skeleton.md)
node ./bin/zhifangsi.mjs skeleton [代码库路径] [输出文件路径]

# 4. 探测与 LLM Wiki 桌面端（127.0.0.1:19828）的桥接连接状态
node ./bin/zhifangsi.mjs bridge

# 5. 将本地 wiki/ 架构文档同步至 LLM Wiki 桌面端向量索引
node ./bin/zhifangsi.mjs sync [代码库路径]

# 6. 启动 MCP 2.0 服务（供 IDE 与 Agent 通过 stdio 调用）
node ./bin/zhifangsi.mjs mcp
```

---

## 🛡️ 关防守则配置规范 (wiki/invariants/)

在项目的 `wiki/invariants/` 目录下创建 `.md` 文档，即可为该代码库订立关防守则：

### 契约示例：`wiki/invariants/unidirectional-flow.md`

```markdown
---
id: unidirectional-flow
type: invariant
title: 状态单向流动与组件解耦
severity: error # error | warning
description: 限制UI层直接访问底层存储，保证单向数据流与清晰的层次边界。
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

## 🤖 MCP 2.0 军机工具集

职方司原生实现了标准 MCP 协议（`@modelcontextprotocol/sdk`），向 Antigravity、Qoder、VS Code Copilot 等 Agent 暴露以下军机工具：

| 工具名称 | 作用说明 | 参数 |
| :--- | :--- | :--- |
| `zhifangsi_map` | 获取代码库全景战略舆图、PageRank 核心关隘与守则健康状态 | `target_dir` (可选) |
| `zhifangsi_check_invariants` | 运行关防守则合规巡检，扫描越权调用、非法依赖与单向数据流违规 | `target_dir` (可选) |
| `zhifangsi_module_info` | 查询特定模块的职责定义、公共 API 导出契约与深度依赖影响范围 | `module_name`, `target_dir` |
| `zhifangsi_workflow_trace` | 追踪核心业务流的时序与端到端步骤 | `workflow_name`, `target_dir` |
| `zhifangsi_search` | 在代码库舆图中混合检索（支持桌面端 LanceDB 向量联动） | `query`, `target_dir` |
| `zhifangsi_bridge_status` | 检查与 LLM Wiki 桌面端的联动协同状态 | 无 |

### IDE 配置示例

#### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "zhifangsi": {
      "type": "stdio",
      "command": "node",
      "args": ["D:/Computers/AIDevelop/Tools/Skills/zhifangsi/dist/mcp/server.js"]
    }
  }
}
```

#### Qoder (`.mcp.json`)
```json
{
  "mcpServers": {
    "zhifangsi": {
      "command": "node",
      "args": ["D:/Computers/AIDevelop/Tools/Skills/zhifangsi/dist/mcp/server.js"]
    }
  }
}
```

---

## 📁 目录结构

```
zhifangsi/
├── bin/
│   └── zhifangsi.mjs         # 命令行 CLI 入口
├── src/
│   ├── ast/                  # 经纬实测确定性引擎
│   │   ├── types.ts          # 符号表与拓扑图类型
│   │   ├── parser.ts         # 多语言符号与导入解析器 (TS/JS/Py/Rust)
│   │   ├── dependency-graph.ts # DAG、深度反查与 PageRank 算法
│   │   └── skeletonizer.ts   # 85%+ 压缩率代码骨架提取器
│   ├── invariants/           # 关防守则与架构不变量系统
│   │   ├── types.ts          # 守则、约束与违规记录契约
│   │   ├── parser.ts         # 零依赖 YAML 解析与自然语言规则推断
│   │   └── checker.ts        # 跨平台 Glob 匹配与 AST 静态合规核查器
│   ├── bridge/               # LLM Wiki 桌面双模桥接器
│   │   ├── client.ts         # HTTP REST 客户端 (127.0.0.1:19828)
│   │   └── sync.ts           # 本地 Wiki 向量化增量同步
│   ├── mcp/                  # MCP 2.0 服务端与工具集
│   │   ├── helpers.ts        # 战略舆图拼装与工作区扫描
│   │   └── server.ts         # Stdio MCP Server 实现
│   └── index.ts              # 统一 API 导出
├── wiki/
│   └── invariants/           # 代码库架构关防守则规范文档
├── test/                     # 自动化测试套件 (Vitest)
└── package.json
```

---

## 🔗 理论基石与参考

- **[llm-wiki (Andrej Karpathy)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** —— 探讨以 LLM 免除知识库簿记维护成本、实现 `Raw sources` / `The wiki` / `The schema` 三层自治体系的开创性思路。
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** —— 标准化 AI Agent 与研发工具链上下文交互规范。

---

## 📜 开源协议

[MIT License](LICENSE)
