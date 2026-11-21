#!/usr/bin/env node

import { runZhifangsiMcpServer } from '../dist/mcp/server.js'

runZhifangsiMcpServer().catch((err) => {
  console.error('[职方司 MCP 错误]', err)
  process.exit(1)
})
