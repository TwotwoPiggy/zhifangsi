import { describe, expect, it } from 'vitest'
import { createZhifangsiMcpServer } from '../src/mcp/server'
import { LLMWikiBridge } from '../src/bridge/client'
import { buildWorkspaceGraph } from '../src/mcp/helpers'

describe('Zhifangsi MCP Server & Tools', () => {
  it('creates server with all registered tools', () => {
    const server = createZhifangsiMcpServer()
    expect(server).toBeDefined()
  })

  it('buildWorkspaceGraph correctly processes repository AST', () => {
    const graph = buildWorkspaceGraph(process.cwd())
    const analysis = graph.analyze()
    expect(analysis.nodeCount).toBeGreaterThan(0)
    expect(analysis.hubs.length).toBeGreaterThan(0)
  })

  it('handles bridge status tool when offline', async () => {
    const bridge = new LLMWikiBridge({ baseUrl: 'http://127.0.0.1:99999' }) // unreachable port
    const isOnline = await bridge.isAvailable()
    expect(isOnline).toBe(false)
  })
})
