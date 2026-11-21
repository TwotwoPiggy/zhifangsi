---
name: zhifangsi
description: 兵部职方司：代码库战略舆图与架构自愈引擎（拓扑测绘、关隘识别、骨架提取与守则巡检）。
---

# 兵部职方清吏司 (Zhifangsi)

职方司源自《周礼》，为古代掌管天下舆图、城池要塞、关防隘口与兵马驿道的国家最高军机测绘与情报中枢。
在 AI 研发体系中，职方司与 **`sansheng-liubu`（三省六部）** 与 **`yongle-dadian`（永乐大典）** 形成三位一体：

| 系统 | 体系定位 | 核心职责 |
| :--- | :--- | :--- |
| **`sansheng-liubu`** | 研发工作流 | 中书省起草对齐 / 门下省门禁把关 / 尚书省调度六部工兵执行 |
| **`yongle-dadian`** | 宏观知识库 | 全局经验沉淀、跨项目技术百科、模式检索 |
| **`zhifangsi`** | **代码库战略舆图** | **AST 经纬度实测、核心关隘文件（Hubs）、模块契约、业务流时序与架构不变量** |

---

## 一、 双模驱动机制 (Dual Mode)

1. **单机独立模式 (Standalone Mode)**：
   - 零依赖、秒级启动；
   - 依赖本地确定性 AST 解析（支持 TS/JS/Python/Rust/Go/Java/C#，含 `@/` 别名、包路径与循环依赖环检测）、本地 Wiki + AST 导出符号混合检索；
   - 适用于命令行快速分析与没有开启桌面端的情况。

2. **LLM Wiki 桌面联动模式 (Bridge Mode)**：
   - 自动探测后台运行的 [LLM Wiki (Karpathy)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 桌面客户端（`http://127.0.0.1:19828`）；
   - 联动能力：
     - 将舆图同步至桌面端的 Sigma.js 知识图谱画布；
     - 借力 LanceDB 进行代码与业务意图的混合语义检索；
     - 调用桌面端 LLM 触发局部增量自愈。

---

## 二、 命令行指令 (CLI Reference)

```bash
# 0. 安装/升级/卸载与宿主 IDE 集成 (支持 NPM 全局或 npx)
npm install -g zhifangsi
zhifangsi install [--antigravity|--vscode|--qoder|--cursor|--all]
zhifangsi update [--git]
zhifangsi uninstall

# 0.5 存储模式配置与 L1 跨项目路由 (默认原位 <repo>/wiki，支持集中外置 Vault)
zhifangsi config [show] [目标路径]
zhifangsi config set-mode <local|centralized>
zhifangsi config set-vault <vaultDir> [--centralized]
zhifangsi config set-repo [repoDir] <wikiDir>
zhifangsi config unset-repo [repoDir]
zhifangsi config reset
zhifangsi repos [query] [--register [目标路径]]

# 1. 初始化代码库 Codebase Map 架构契约与 Wiki 目录 (支持 --wiki-dir / --vault-dir / --centralized / --local)
zhifangsi init [目标路径] [--force]

# 2. 存量代码库冷启动自动建档 (基于 AST 目录拓扑逆向聚类生成 wiki/modules/*.md)
zhifangsi bootstrap [目标路径] [--force]

# 3. 测绘当前代码库战略舆图 (输出节点数、边数、Top PageRank 核心关隘文件与循环依赖预警)
zhifangsi map [目标路径] [输出文件.md]

# 4. 提取代码高信息密度骨架 (支持 --target <file|module> 局部邻域 Inline & Spill 提取)
zhifangsi skeleton [目标路径] [输出文件.md]
zhifangsi skeleton [目标路径] --target src/ast/dependency-graph.ts

# 5. 评估拟修改文件的变更爆炸半径、波及模块、回归业务流与高危关隘防撞车预警
zhifangsi impact <file1,file2|module> [目标路径]

# 6. 执行关防守则、循环依赖与 Wiki 舆图失真 (Drift) 静态合规巡检 (支持 status: draft 试运行)
zhifangsi check [目标路径]

# 7. 探测与 LLM Wiki 桌面端的桥接状态
zhifangsi bridge

# 8. 将本地 wiki 页面增量同步给 LLM Wiki 桌面端建立向量索引
zhifangsi sync [目标路径]

# 9. 启动标准 stdio MCP 服务
zhifangsi mcp
```

---

## 三、 MCP 工具清单 (面向 AI Agent)

- **`zhifangsi_repos`**：查询 L1 跨项目路由注册表（仅返回各项目的轻量名片：slug、源码路径、Wiki 路径、职责摘要与模块名，不加载完整 Wiki；适用于 Super-agent Router 层先定位目标 Repo）。
- **`zhifangsi_map`**：获取全库模块、工作流、不变量、循环依赖预警与核心关隘（Hubs）战略总图（支持可选 `wiki_dir`）。
- **`zhifangsi_check_invariants`**：对代码库执行关防守则合规巡检，扫描越权调用、非法依赖、循环依赖及 Wiki 舆图失真（Drift），支持 `status: draft` 草稿守则试运行（支持可选 `wiki_dir`）。
- **`zhifangsi_module_info`**：查询特定模块（支持模块名或目录路径）的职责、导出 API 签名契约与深度依赖影响范围（支持可选 `wiki_dir`）。
- **`zhifangsi_skeleton`**：基于局部性原理（Inline & Spill）提取目标文件/模块的骨架与 1 跳邻居导出契约（或全库骨架，支持可选 `wiki_dir`）。
- **`zhifangsi_impact`**：评估拟修改文件的变更爆炸半径、波及模块、建议回归验证的业务流（Workflows）及高危关隘防撞车预警（支持可选 `wiki_dir`）。
- **`zhifangsi_bootstrap`**：存量代码库基于 AST 目录拓扑一键逆向聚类生成 `wiki/modules/*.md` 档案（支持可选 `wiki_dir`）。
- **`zhifangsi_workflow_trace`**：追踪特定业务流的端到端调用时序与阶段步骤（支持可选 `wiki_dir`）。
- **`zhifangsi_search`**：混合语义检索（桌面端在线走 LanceDB，离线自动走本地 Wiki + AST 导出符号混合检索，支持可选 `wiki_dir`）。
- **`zhifangsi_bridge_status`**：检查与 LLM Wiki 桌面端的联动状态。

---

## 四、 客户端接入指引

### 1. VS Code (GitHub Copilot)
在项目根目录 `.vscode/mcp.json` 中配置：
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

### 2. Qoder
在项目根目录 `.mcp.json` 中配置：
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

### 3. Antigravity
在 `~/.gemini/config/mcp_config.json` 或项目 `.agents/mcp_config.json` 中配置：
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
