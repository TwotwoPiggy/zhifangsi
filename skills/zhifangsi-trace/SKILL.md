---
name: zhifangsi-trace
description: 追踪代码库核心业务流水线的端到端调用时序与阶段步骤。
---

# zhifangsi-trace: 业务流水线时序追踪

当用户输入 `/zhifangsi-trace [流水线名称]` 或需要排查复杂跨模块交互的时序流程时执行。

## 执行准则与步骤

1. **确定流水线目标**：
   - 获取用户指定的业务流水线标识（如 `workflow_name` 或 `ingest-pipeline`、`search-flow`）。
   - 若用户未指定具体名称，先查询 `wiki/workflows/` 下的已有流水线清单。

2. **调用时序探针**：
   - 优先调用 MCP 军机工具 `zhifangsi_workflow_trace`（参数：`{ "workflow_name": "<名称>", "target_dir": "<目标目录>" }`）；
   - 若直接读取文件，查找目标路径下的 `wiki/workflows/<workflow_name>.md`。

3. **时序渲染与解读**：
   - 使用 Mermaid 时序图（`sequenceDiagram`）或分步列表展示调用流转；
   - 标注涉及的模块契约（`wiki/modules/*.md`）与关键文件调用点。
