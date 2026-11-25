---
name: zhifangsi-skeleton
description: 提取代码库高信息密度骨架 (85%+ Token 压缩)，剥离实现细节保留签名契约。
---

# zhifangsi-skeleton: 提取高信息密度代码骨架

当用户输入 `/zhifangsi-skeleton` 或需要将代码库高保真结构压缩投喂给 LLM 认知上下文时执行。

## 执行准则与步骤

1. **执行骨架提取**：
   - **MCP 方式（优先）**：调用 MCP 军机工具 `zhifangsi_skeleton`，传入 `{ "target_dir": "<目标目录>" }`（若仅关注单个文件或模块，额外传入 `"target": "<文件路径或模块名>"` 提取 1 跳局部邻域骨架以最大化节约 Token）；
   - **CLI 方式（备用）**：在终端执行全局命令：
     ```bash
     zhifangsi skeleton "<目标目录>" [输出路径]
     # 局部邻域骨架：
     zhifangsi skeleton "<目标目录>" --target <文件路径或模块名>
     ```
   - CLI 全库提取默认输出路径为目标工程根目录下的 `codebase-skeleton.md`。

2. **汇报压缩度量**：
   - 汇报原始代码行数、骨架代码行数、文件处理数以及 Token 节约百分比（通常超过 85%）。

3. **辅助架构理解**：
   - 简要向用户介绍生成的骨架文件存放位置，并可根据需要直接读取该骨架辅助接下来的重构或架构规划。
