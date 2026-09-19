/**
 * Zhifangsi - LLM Wiki Bridge Client
 * Connects the lightweight CLI/MCP tool to the running LLM Wiki desktop application.
 */

export interface BridgeConfig {
  baseUrl?: string
  token?: string
  timeoutMs?: number
}

export interface BridgeProject {
  id: string
  name: string
  path: string
  isCurrent?: boolean
}

export interface BridgeSearchResult {
  mode: string
  hits: Array<{
    path: string
    title: string
    snippet?: string
    vectorScore?: number
  }>
}

export class LLMWikiBridge {
  private baseUrl: string
  private token?: string
  private timeoutMs: number

  constructor(config: BridgeConfig = {}) {
    this.baseUrl = (config.baseUrl || process.env.LLM_WIKI_API_URL || 'http://127.0.0.1:19828').replace(/\/+$/, '')
    this.token = config.token || process.env.LLM_WIKI_API_TOKEN
    this.timeoutMs = config.timeoutMs || 4000
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      if (!res.ok) {
        return null
      }

      return (await res.json()) as T
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Check whether LLM Wiki desktop app is running and accessible
   */
  public async isAvailable(): Promise<boolean> {
    const res = await this.request<{ status: string }>('/api/v1/health')
    return res?.status === 'ok' || Boolean(res)
  }

  /**
   * List projects registered in LLM Wiki
   */
  public async listProjects(): Promise<BridgeProject[]> {
    const data = await this.request<{ projects: BridgeProject[] }>('/api/v1/projects')
    return data?.projects || []
  }

  /**
   * Find project by repository directory path
   */
  public async findProjectByPath(targetPath: string): Promise<BridgeProject | null> {
    const projects = await this.listProjects()
    const normTarget = targetPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    return (
      projects.find((p) => {
        const normP = p.path.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
        return normP === normTarget || normTarget.startsWith(normP)
      }) || null
    )
  }

  /**
   * Request LLM Wiki to vectorize/embed a newly generated wiki markdown page
   */
  public async embedPage(projectId: string, relPath: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/v1/projects/${encodeURIComponent(projectId)}/pages/embed`, {
      method: 'POST',
      body: JSON.stringify({ path: relPath }),
    })
    return Boolean(res?.success)
  }

  /**
   * Perform hybrid semantic search through LLM Wiki LanceDB
   */
  public async search(projectId: string, query: string, topK = 10): Promise<BridgeSearchResult | null> {
    return await this.request<BridgeSearchResult>(`/api/v1/projects/${encodeURIComponent(projectId)}/search`, {
      method: 'POST',
      body: JSON.stringify({ query, topK }),
    })
  }

  /**
   * Request LLM Wiki to re-scan raw source files
   */
  public async rescanSources(projectId: string): Promise<boolean> {
    const res = await this.request<{ queued: boolean }>(`/api/v1/projects/${encodeURIComponent(projectId)}/sources/rescan`, {
      method: 'POST',
    })
    return Boolean(res?.queued)
  }
}
