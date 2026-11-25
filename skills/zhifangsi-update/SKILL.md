---
name: zhifangsi-update
description: 检查并更新兵部职方司 (zhifangsi)：自动识别 Git/NPM 安装模式、支持指定版本与失败自动回滚，并重新注入多宿主 Skills 与 MCP 配置。
---

# zhifangsi-update: 版本检查与自动更新

当用户输入 `/zhifangsi-update` 或要求检查/更新 `zhifangsi` 时执行。

## 执行准则与步骤

1. **解析更新意图与参数**：
   - 无参数：默认检查最新稳定版并自动更新：
     ```bash
     zhifangsi update
     ```
   - 仅检查更新（不改动代码与配置）：
     ```bash
     zhifangsi update --check
     ```
   - 指定目标版本 / Git Tag / 分支（如 `v1.1.1`、`1.2.0`、`main`）：
     ```bash
     zhifangsi update <target>
     ```
   - 强制重装或从 GitHub 远端源拉取：
     ```bash
     zhifangsi update --force
     zhifangsi update --git
     ```
   - 如网络受限需要代理（例如本地代理 `http://127.0.0.1:10808`），附加 `--proxy http://127.0.0.1:10808`。
   - 若全局命令 `zhifangsi` 不可用，可直接执行当前仓库下的 `node ./scripts/zhifangsi-update.mjs [参数]`。

2. **自动执行 4 阶段更新流水线**：
   - **[1/4] 模式与版本检测**：自动识别 **Git 仓库开发模式**（先做脏工作区拦截，再拉取远程分支与最新稳定 Tag）或 **npm 全局包模式**（查询 NPM 仓库版本）。
   - **[2/4] 拉取/安装更新**：Git 模式执行 `git checkout`/`git pull`；NPM 模式执行 `npm install -g`。
   - **[3/4] 依赖与编译自愈**：Git 模式下检测 `package-lock.json` MD5 变化自动执行 `npm install`，并自动 `npm run build` 重新编译 TypeScript 产物；任意阶段失败自动执行 `git reset --hard` 回滚至原始分支与 Commit。
   - **[4/4] 新进程多宿主重注入**：读取 `~/.zhifangsi/install-manifest.json` 与宿主凭证，通过独立新子进程调用最新版安装器，同步刷新 Antigravity、VS Code Copilot（全局 Agent Skills / Instructions / MCP）与已登记的 VS Code / Qoder / Cursor / Claude 工作区配置。

3. **结果汇报**：
   - 向用户汇报安装模式、版本变化（如 `v1.1.1 -> v1.2.0`）以及重新同步的宿主清单；
   - 若遇到本地 Git 脏工作区拦截，提示用户先提交、暂存（`git stash`）或清理改动后再试；
   - 更新成功后提醒用户重启 AI Agent / 重载 MCP 以生效最新工具与 Skills。
