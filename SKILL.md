---
name: zhifangsi
description: >-
  兵部职方司 (Zhifangsi) - 基于三省六部体系的代码库战略舆图与架构自愈引擎。
  支持单机独立模式与 LLM Wiki 桌面端（127.0.0.1:19828）联动双模。
  提供 AST 确定性拓扑测绘、PageRank 核心关隘识别、代码骨架压缩（85%+）、
  模块契约检索与业务流时序追踪。适用于 Antigravity、Qoder、VS Code Copilot、Claude Code 等 AI Agent。
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
   - 依赖本地确定性 AST 解析（Tree-Sitter / 语法分析）与 Markdown 架构文件；
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
# 1. 测绘当前代码库战略舆图 (输出节点数、边数、Top PageRank 核心关隘文件)
zhifangsi map [目标路径]

# 2. 提取代码高信息密度骨架 (剥离函数体，保留接口与签名，降噪 85%+)
zhifangsi skeleton [目标路径] [输出文件.md]

# 3. 探测与 LLM Wiki 桌面端的桥接状态
zhifangsi bridge

# 4. 将本地 wiki 页面增量同步给 LLM Wiki 桌面端建立向量索引
zhifangsi sync [目标路径]

# 5. 启动标准 stdio MCP 服务
zhifangsi mcp
```

---

## 三、 MCP 工具清单 (面向 AI Agent)

- **`zhifangsi_map`**：获取全库模块、工作流、不变量与 ADR 战略总图。
- **`zhifangsi_module_info`**：查询特定模块的职责、导出 API 与双链拓扑。
- **`zhifangsi_workflow_trace`**：追踪特定业务流的端到端调用时序与阶段步骤。
- **`zhifangsi_search`**：混合语义检索（自动优先借力桌面端向量库）。
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
