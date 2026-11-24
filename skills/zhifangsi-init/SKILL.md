---
name: zhifangsi-init
description: 一键初始化项目架构知识库并接入 LLM Wiki（自动完成目录契约、AST 模块建档、代码骨架预处理与桌面端桥接同步）。
---

# zhifangsi-init: 一键初始化与 LLM Wiki 接入

当用户输入 `/zhifangsi-init`、要求「初始化职方司」、「把项目接入 LLM Wiki」或「为代码库冷启动建档」时执行。

## 执行准则与步骤

1. **确定目标代码库与存储方式**：
   - **目标路径**：优先使用用户指定的项目目录；未指定时默认为当前工作区根目录；
   - **存储模式**：
     - 若用户明确表示“不污染业务仓 / 外置 / 集中放到 Vault”，传 `storage_mode: "centralized"`（或对应 `vault_dir` / `wiki_dir`）；
     - 若用户指定原位存放，传 `storage_mode: "local"`；
     - 若用户未额外指定，缺省直接遵循全局/项目配置（默认原位），不打断一键体验。

2. **一键触发初始化与冷启动编排**：
   - **MCP 方式（优先）**：
     调用 MCP 军机工具 `zhifangsi_init`，传入：
     ```json
     {
       "target_dir": "<目标目录>"
     }
     ```
     （按需附带 `storage_mode`、`vault_dir`、`wiki_dir`、`force` 参数。）
     单次调用将自动依次完成：
     1. 初始化 `schema.md`、`purpose.md`、`wiki/` 10 类子目录、`raw/sources/`、`.obsidian/` 与 L1 跨项目路由登记；
     2. AST 拓扑聚类生成 `wiki/modules/*.md` 模块档案与 `[[modules/xxx]]` 双链；
     3. 复用已有或自动测绘生成 `CODEBASE_MAP.md`；
     4. 抄送 `CODEBASE_MAP.md` 并提取高密度子系统代码骨架至 `raw/sources/codebase/`；
     5. 探测 LLM Wiki 桌面端（`127.0.0.1:19828`）：若已挂载则自动推送向量索引并触发源重扫。
   - **CLI 方式（备用）**：
     在终端执行全局命令：
     ```bash
     zhifangsi init "<目标目录>"
     ```
     （按需附加 `--centralized` / `--vault-dir <目录>` / `--wiki-dir <目录>` / `--force` / `--minimal`。）

3. **汇总结果并按桌面端状态给出极简下一步**：
   - 简要汇报：**挂载根目录 (`storageRoot`)**、**新建/跳过的架构文件与模块数**、**代码骨架压缩率**；
   - 按 `bridgeState` 分支引导：
     - **`synced`（在线且已挂载并自动同步）**：汇报已嵌入 LanceDB 的页面数，确认图谱与语义检索已立即可用；
     - **`online-unmounted`（桌面端在线但未挂载本项目）**：醒目给出 **`storageRoot` 绝对路径**，提示用户在 LLM Wiki 桌面端点击「打开项目 (Open Project)」选中该目录（⚠️ 不要选中里面嵌套的 `wiki` 子目录），挂载完成后运行 `/zhifangsi-sync` 即可完成向量同步；
     - **`offline`（桌面端离线）**：告知纯本地独立模式已完全就绪，随时可用 `/zhifangsi-map`、`/zhifangsi-check`、`/zhifangsi-skeleton`，后续启动 LLM Wiki 桌面端打开 `storageRoot` 即可无缝接入。
