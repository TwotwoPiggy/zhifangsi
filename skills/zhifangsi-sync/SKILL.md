---
name: zhifangsi-sync
description: 将本地架构舆图增量同步至 LLM Wiki 桌面端 (127.0.0.1:19828) 并更新向量索引。
---

# zhifangsi-sync: 同步舆图至 LLM Wiki 桌面端

当用户输入 `/zhifangsi-sync` 时执行。

## 执行准则与步骤

1. **状态探测**：
   - 优先调用 MCP 军机工具 `zhifangsi_bridge_status` 检查桌面客户端（`127.0.0.1:19828`）是否处于在线活跃状态。

2. **触发同步操作**：
   - 若桌面端在线，在终端执行同步命令：
     ```bash
     zhifangsi sync "<目标目录>"
     ```
   - 同步引擎将遍历 `wiki/modules/`、`wiki/workflows/` 与 `wiki/invariants/` 下所有架构文档并推送嵌入向量。

3. **结果汇总**：
   - 汇报同步的架构页面数量、清单及桌面端向量库状态；
   - 若桌面端离线，提醒用户启动桌面客户端或继续在纯本地模式下正常工作。
