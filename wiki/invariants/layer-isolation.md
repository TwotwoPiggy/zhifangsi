---
id: layer-isolation
type: invariant
title: 底层 AST 与关防引擎独立性隔离
severity: error
description: 职方司底层 AST 经纬实测引擎与 Invariants 关防核查引擎属于纯粹计算核心，严禁反向依赖上层 MCP 服务或桌面 Bridge 桥接器。
rules:
  - "禁止底层 AST 引擎引用 MCP 或 Bridge 服务"
  - "禁止关防守则引擎依赖 MCP 服务"
affected_modules:
  - "[[modules/ast-engine]]"
  - "[[modules/invariants]]"
constraints:
  - type: deny_import
    from: "src/ast/**"
    disallowed:
      - "src/mcp/**"
      - "src/bridge/**"
    message: "AST 底座引擎必须保持零上层依赖"
  - type: deny_import
    from: "src/invariants/**"
    disallowed:
      - "src/mcp/**"
      - "src/bridge/**"
    message: "关防守则引擎不得反向耦合消费层与桥接服务"
---

# 底层 AST 与关防引擎独立性隔离

## 背景与目的
职方司架构设计秉承“分层严明、单向依赖”的原则：
- 底层为 **经纬实测引擎 (`src/ast/`)** 与 **关防守则系统 (`src/invariants/`)**，负责纯静态确定性分析；
- 中层为 **桌面双模桥接 (`src/bridge/`)** 与 **Git 自愈巡检 (`src/git/`)**；
- 顶层为 **MCP 2.0 军机处 (`src/mcp/`)** 与 **CLI 命令行 (`bin/`)**。

因此，底层模块必须保持高内聚低耦合，严禁越权反向依赖上层消费层。
