import { describe, expect, it, vi } from 'vitest'
import { LLMWikiBridge } from '../src/bridge/client'

describe('Zhifangsi - LLMWikiBridge', () => {
  it('reports isAvailable true when health returns ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })
    globalThis.fetch = fakeFetch

    const bridge = new LLMWikiBridge({ baseUrl: 'http://127.0.0.1:19828' })
    const available = await bridge.isAvailable()

    expect(available).toBe(true)
    expect(fakeFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:19828/api/v1/health',
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  it('gracefully handles offline server', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    globalThis.fetch = fakeFetch

    const bridge = new LLMWikiBridge({ baseUrl: 'http://127.0.0.1:19828' })
    const available = await bridge.isAvailable()

    expect(available).toBe(false)
  })

  it('matches project by path accurately', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: 'proj-1', name: 'My Project', path: 'D:/Work/ProjectA' },
          { id: 'proj-2', name: 'Other', path: 'D:/Work/ProjectB' },
        ],
      }),
    })
    globalThis.fetch = fakeFetch

    const bridge = new LLMWikiBridge()
    const found = await bridge.findProjectByPath('D:\\Work\\ProjectA')

    expect(found).not.toBeNull()
    expect(found?.id).toBe('proj-1')
  })
})
