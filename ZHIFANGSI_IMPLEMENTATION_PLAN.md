# 职方司 (zhifangsi) - 代码库战略舆图与自愈架构系统实施方案

## 1. 体系定位与命名立意

- **项目定名**：**职方司 (`zhifangsi`)**
- **工程路径**：`D:\Computers\AIDevelop\Tools\Skills\zhifangsi`
- **体系定位**：
  在整体 AI 研发工具体系中与现有系统形成“三位一体”的协同格局：
  - **`sansheng-liubu`（三省六部）**：统领**研发流程**（中书起草对齐 / 门下门禁审核 / 尚书调度六部工兵执行）。
  - **`yongle-dadian`（永乐大典）**：统领**宏观知识**（跨项目经验、通用技术百科、全局沉淀）。
  - **`zhifangsi`（职方司）**：专精**代码库战略舆图（Codebase Map）**，掌管代码库山川险隘（模块 Modules）、兵马时序（工作流 Workflows）、关防守则（架构不变量 Invariants）与边境实测（AST 依赖拓扑）。
- **运行模式**：
  - **单机独立模式 (Standalone)**：纯本地运行，零 GUI 依赖，秒级 CLI 与 MCP 服务；
  - **LLM Wiki 联动模式 (Bridge Mode)**：自动桥接桌面客户端（`127.0.0.1:19828`），赋予向量混合检索与全景图谱画布。

---

## 2. 系统分层架构

```
┌────────────────────────────────────────────────────────────────────────┐
│               消费层：Antigravity / Qoder / VS Code Copilot             │
│   (zhifangsi_map | zhifangsi_module | zhifangsi_trace | check_rules)  │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Model Context Protocol (MCP 2.0)
┌───────────────────────────────────┴────────────────────────────────────┐
│         顶层：职方司架构认知舆图 (Compiled Markdown Wiki)              │
│   • wiki/modules/*.md       • wiki/workflows/*.md                      │
│   • wiki/invariants/*.md    • wiki/adr/*.md                            │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │ 增量局部编译 (LLM Page Merge)  │ 不变量违规弹劾
┌───────────────────┴────────────────────────────────┴───────────────────┐
│         中枢层：Git-Diff 驱动自愈巡检司 (Lint & Sweep Engine)          │
│   • Git Diff / Pre-commit 监听                                         │
│   • 影响范围反查 (Reverse Dependency Impact Analyzer)                   │
│   • 审查御史队列 (Review Queue Generator)                              │
└───────────────────▲────────────────────────────────────────────────────┘
                    │ 静态事实比对 (文件哈希 & 符号差异)
┌───────────────────┴────────────────────────────────────────────────────┐
│         底层：职方司经纬实测引擎 (Deterministic AST Engine)            │
│   • Tree-Sitter 多语言符号表与依赖拓扑 (Imports / Exports / Call-Graph) │
│   • PageRank 核心枢纽关隘计算                                          │
│   • 代码骨架提取 (85%+ Token 压缩率)                                    │
│   • LLM Wiki 桌面双模桥接器 (Bridge Client & Sync)                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 分阶段实施现状与推进计划 (Implementation Roadmap)

### 阶段零：轻量重构与环境就位 —— *[已完成 ✅]*
1. 已剔除桌面 GUI 冗余，重塑为类似 `sansheng-liubu` 的纯粹轻量 Node/TypeScript 工具工程；
2. 建立标准化目录结构：`bin/`、`src/ast/`、`src/bridge/`、`src/mcp/`、`test/`；
3. 全局构建 `npm run build` 通过，`bin/zhifangsi.mjs` 命令行已验证可正常运行。

---

### 阶段一：职方司经纬实测与双模桥接引擎 —— *[已完成 ✅]*
1. **经纬实测 (AST Engine)**：
   - `src/ast/types.ts`、`src/ast/parser.ts`：支持 TS/JS/Python/Rust 符号与相对导入解析；
   - `src/ast/dependency-graph.ts`：DAG 依赖图、PageRank 核心关隘计算与 `getDeepDependents` 深度依赖反查；
   - `src/ast/skeletonizer.ts`：85%+ 压缩率代码骨架提取器。
2. **LLM Wiki 双模桥接 (Bridge Engine)**：
   - `src/bridge/client.ts`：自动探测 `127.0.0.1:19828` 健康状态；
   - `src/bridge/sync.ts`：将本地 Wiki 页面增量推送到 LLM Wiki 桌面端向量化索引。
3. **测试覆盖**：
   - `test/ast-engine.test.ts`、`test/bridge.test.ts`、`test/mcp-server.test.ts` 全部 100% 通过。

---

### 阶段二：关防守则与架构不变量系统 (Invariants & Rules) —— *[已完成 ✅]*
**目标**：将抽象架构规范具象化为机器可验证的规则网络。

1. **已实现 `src/invariants/types.ts`、`parser.ts` 与 `checker.ts`**：
   - 强类型定义 `deny_import`、`allow_only` 与 `isolated_module` 约束契约；
   - 零依赖极简 YAML Frontmatter 解析器，支持从 `wiki/invariants/*.md` 加载守则；
   - 智能规则推断引擎，支持直接从自然文本规则（如“严禁反向依赖”）推断静态约束；
   - 跨平台路径 Glob 匹配器，支持 `**`、`*` 与扩展名模式。
2. **AST 辅助静态合规检查与行号精准定位**：
   - 为 `ImportEdge` 引入行号追踪；
   - 遍历 AST Import 拓扑，精确拦截跨层越权导入并提供行号与违规详情；
   - 终端彩色高亮与 Markdown 双模报告生成器。
3. **命令行与 MCP 2.0 工具集成**：
   - 命令行集成 `zhifangsi check [dir]`（别名 `lint` / `invariants`），合规失败返回非零退出码；
   - MCP 工具集新增 `zhifangsi_check_invariants`，全景舆图 `zhifangsi_map` 增加合规健康摘要。
4. **测试覆盖**：
   - `test/invariants.test.ts` 10 个测试用例 100% 通过（全工程 4 模块 21 测试全通）。

---

### 阶段三：Git-Diff 驱动自愈巡检司 (Git-Driven Lint & Sweep) —— *[待启动]*
**目标**：终结文档过时，实现每次 Git 提交自动局部增量自愈。

1. **变更影响范围反查器** (`src/git/diff-analyzer.ts`)：
   - 读取 `git status` 或 `git diff HEAD~1` 的变更文件；
   - 结合 AST 依赖图，反查出受波及的 Wiki 模块清单（Dirty Modules）。
2. **增量局部合并驱动**：
   - 绝不全库重跑，只对受影响的 1~3 个 `wiki/modules/*.md` 调用局部 Page Merge；
   - 精准同步 API 列表与改动记录。
3. **不变量门禁审查 (Invariant Linter)**：
   - 检测本次 commit 是否打破了 `wiki/invariants/` 规矩。

---

### 阶段四：职方司 MCP 2.0 军机工具集完善 —— *[进行中]*
已在 `src/mcp/server.ts` 中落地核心工具，后续继续补充 `zhifangsi_impact_analysis` 与 `zhifangsi_check_invariants`。

---

### 阶段五：一键赋能三军 (VS Code / Qoder / Antigravity 配置生成) —— *[待启动]*
提供脚本快速为各大 IDE/Agent 注入 MCP 配置与系统规则。
