import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

export type StorageMode = 'local' | 'centralized'

export interface ZhifangsiGlobalConfig {
  version: number
  storageMode: StorageMode
  vaultDir: string
  repoOverrides: Record<string, string>
}

export interface ZhifangsiProjectConfig {
  storageMode?: StorageMode
  wikiDir?: string
  storageRoot?: string
  slug?: string
  summary?: string
  keywords?: string[]
}

export interface StorageResolveOptions {
  wikiDir?: string
  storageMode?: StorageMode
  vaultDir?: string
  configPath?: string
}

export type StorageResolutionSource =
  | 'explicit'
  | 'env'
  | 'project-config'
  | 'global-override'
  | 'global-centralized'
  | 'default-local'

export interface ResolvedStoragePaths {
  repoRoot: string
  storageRoot: string
  wikiDir: string
  mode: 'local' | 'centralized' | 'custom'
  source: StorageResolutionSource
  slug: string
  vaultDir: string
  registryPath: string
}

export interface RepoRegistryEntry {
  slug: string
  name: string
  repoPath: string
  storageRoot: string
  wikiDir: string
  storageMode: 'local' | 'centralized' | 'custom'
  techStack?: string
  summary?: string
  modules?: string[]
  workflows?: string[]
  invariants?: string[]
  keywords?: string[]
  updatedAt: string
}

export interface RepoRegistry {
  version: number
  updatedAt: string
  repos: RepoRegistryEntry[]
}

const PROJECT_CONFIG_FILE = '.zhifangsi.json'

/**
 * 规范化路径用于跨平台比较与键值查找（Windows 下大小写不敏感）
 */
export function normalizeRepoKey(targetPath: string): string {
  const resolved = path.resolve(targetPath).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * 展开开头的 ~ 为用户主目录
 */
export function expandHomePath(inputPath: string): string {
  if (!inputPath) return inputPath
  if (inputPath === '~') return os.homedir()
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(2))
  }
  return inputPath
}

export function getDefaultHomeDir(): string {
  return path.join(os.homedir(), '.zhifangsi')
}

export function getDefaultConfigPath(): string {
  if (process.env.ZHIFANGSI_CONFIG_PATH) {
    return path.resolve(expandHomePath(process.env.ZHIFANGSI_CONFIG_PATH))
  }
  return path.join(getDefaultHomeDir(), 'config.json')
}

export function getDefaultVaultDir(): string {
  if (process.env.ZHIFANGSI_VAULT_DIR) {
    return path.resolve(expandHomePath(process.env.ZHIFANGSI_VAULT_DIR))
  }
  return path.join(getDefaultHomeDir(), 'vault')
}

export function getDefaultGlobalConfig(): ZhifangsiGlobalConfig {
  return {
    version: 1,
    storageMode: 'local',
    vaultDir: path.join(getDefaultHomeDir(), 'vault'),
    repoOverrides: {},
  }
}

/**
 * 读取全局配置 (~/.zhifangsi/config.json)。
 * 在 Vitest 运行且未显式指定 configPath / ZHIFANGSI_CONFIG_PATH 时，隔离宿主机真实配置以保证测试确定性。
 */
export function loadGlobalConfig(configPath?: string): ZhifangsiGlobalConfig {
  const defaults = getDefaultGlobalConfig()
  const isVitestIsolated =
    Boolean(process.env.VITEST) && !configPath && !process.env.ZHIFANGSI_CONFIG_PATH

  if (isVitestIsolated) {
    return defaults
  }

  const targetPath = configPath ? path.resolve(expandHomePath(configPath)) : getDefaultConfigPath()
  if (!fs.existsSync(targetPath)) {
    return defaults
  }

  try {
    const raw = JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
    const storageMode: StorageMode = raw.storageMode === 'centralized' ? 'centralized' : 'local'
    const vaultDir =
      typeof raw.vaultDir === 'string' && raw.vaultDir.trim()
        ? path.resolve(expandHomePath(raw.vaultDir.trim()))
        : defaults.vaultDir

    const repoOverrides: Record<string, string> = {}
    if (raw.repoOverrides && typeof raw.repoOverrides === 'object') {
      for (const [k, v] of Object.entries(raw.repoOverrides)) {
        if (typeof v === 'string' && v.trim()) {
          repoOverrides[k] = v.trim()
        }
      }
    }

    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      storageMode,
      vaultDir,
      repoOverrides,
    }
  } catch {
    return defaults
  }
}

export function saveGlobalConfig(
  config: Partial<ZhifangsiGlobalConfig>,
  configPath?: string
): ZhifangsiGlobalConfig {
  const targetPath = configPath ? path.resolve(expandHomePath(configPath)) : getDefaultConfigPath()
  const existing = loadGlobalConfig(targetPath)
  const merged: ZhifangsiGlobalConfig = {
    version: 1,
    storageMode: config.storageMode ?? existing.storageMode,
    vaultDir: config.vaultDir
      ? path.resolve(expandHomePath(config.vaultDir))
      : existing.vaultDir,
    repoOverrides: config.repoOverrides ?? existing.repoOverrides,
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  return merged
}

export function resetGlobalConfig(configPath?: string): ZhifangsiGlobalConfig {
  const defaults = getDefaultGlobalConfig()
  return saveGlobalConfig(defaults, configPath)
}

export function setRepoOverride(
  repoDir: string,
  wikiDir: string,
  configPath?: string
): ZhifangsiGlobalConfig {
  const targetPath = configPath ? path.resolve(expandHomePath(configPath)) : getDefaultConfigPath()
  const existing = loadGlobalConfig(targetPath)
  const resolvedRepo = path.resolve(expandHomePath(repoDir))
  const resolvedWiki = path.resolve(expandHomePath(wikiDir))

  const nextOverrides: Record<string, string> = {}
  const targetKey = normalizeRepoKey(resolvedRepo)
  for (const [k, v] of Object.entries(existing.repoOverrides)) {
    if (normalizeRepoKey(k) !== targetKey) {
      nextOverrides[k] = v
    }
  }
  nextOverrides[resolvedRepo] = resolvedWiki

  return saveGlobalConfig({ repoOverrides: nextOverrides }, targetPath)
}

export function unsetRepoOverride(repoDir: string, configPath?: string): ZhifangsiGlobalConfig {
  const targetPath = configPath ? path.resolve(expandHomePath(configPath)) : getDefaultConfigPath()
  const existing = loadGlobalConfig(targetPath)
  const targetKey = normalizeRepoKey(path.resolve(expandHomePath(repoDir)))

  const nextOverrides: Record<string, string> = {}
  for (const [k, v] of Object.entries(existing.repoOverrides)) {
    if (normalizeRepoKey(k) !== targetKey) {
      nextOverrides[k] = v
    }
  }

  return saveGlobalConfig({ repoOverrides: nextOverrides }, targetPath)
}

/**
 * 读取项目根目录下的可选配置文件 .zhifangsi.json
 */
export function loadProjectConfig(repoDir: string): ZhifangsiProjectConfig | null {
  const configFile = path.join(path.resolve(repoDir), PROJECT_CONFIG_FILE)
  if (!fs.existsSync(configFile)) {
    return null
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    if (!raw || typeof raw !== 'object') return null
    return {
      storageMode:
        raw.storageMode === 'local' || raw.storageMode === 'centralized'
          ? raw.storageMode
          : undefined,
      wikiDir: typeof raw.wikiDir === 'string' && raw.wikiDir.trim() ? raw.wikiDir.trim() : undefined,
      storageRoot:
        typeof raw.storageRoot === 'string' && raw.storageRoot.trim()
          ? raw.storageRoot.trim()
          : undefined,
      slug: typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug.trim() : undefined,
      summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : undefined,
      keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : undefined,
    }
  } catch {
    return null
  }
}

export function slugifyName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'project'
}

export function computeRepoSlug(
  repoRoot: string,
  vaultDir: string,
  preferredSlug?: string
): string {
  if (preferredSlug && preferredSlug.trim()) {
    return slugifyName(preferredSlug)
  }

  const normKey = normalizeRepoKey(repoRoot)
  const registry = loadRepoRegistry(vaultDir)

  // 若已登记在 L1 注册表中，稳定复用原 slug
  const existing = registry.repos.find((r) => normalizeRepoKey(r.repoPath) === normKey)
  if (existing && existing.slug) {
    return existing.slug
  }

  const baseSlug = slugifyName(path.basename(repoRoot))

  // 若注册表或外置目录中已有其他不同路径的仓库占用该 slug，自动附加短哈希防重名覆盖
  const conflictingRegistryEntry = registry.repos.find(
    (r) => r.slug === baseSlug && normalizeRepoKey(r.repoPath) !== normKey
  )
  if (!conflictingRegistryEntry) {
    return baseSlug
  }

  const shortHash = crypto.createHash('sha1').update(normKey).digest('hex').slice(0, 6)
  return `${baseSlug}-${shortHash}`
}

function resolveCustomWikiPair(
  repoRoot: string,
  rawWikiDir: string
): { storageRoot: string; wikiDir: string } {
  const expanded = expandHomePath(rawWikiDir)
  const wikiDir = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(repoRoot, expanded)
  const storageRoot =
    path.basename(wikiDir).toLowerCase() === 'wiki' ? path.dirname(wikiDir) : wikiDir
  return { storageRoot, wikiDir }
}

/**
 * 解析目标代码库的知识库实际存储路径。
 *
 * 优先级（高 -> 低）：
 * 1. 显式参数 options.wikiDir / options.storageMode / options.vaultDir
 * 2. 环境变量 ZHIFANGSI_WIKI_DIR / ZHIFANGSI_STORAGE_MODE / ZHIFANGSI_VAULT_DIR
 * 3. 项目级配置 <repoRoot>/.zhifangsi.json
 * 4. 全局配置 ~/.zhifangsi/config.json 的 repoOverrides（单仓库覆盖）
 * 5. 全局配置 storageMode === 'centralized' -> <vaultDir>/repos/<slug>/wiki
 * 6. 默认回退：原位本地模式 <repoRoot>/wiki
 */
export function resolveStoragePaths(
  repoDir: string,
  options: StorageResolveOptions = {}
): ResolvedStoragePaths {
  const repoRoot = path.resolve(expandHomePath(repoDir))
  const globalCfg = loadGlobalConfig(options.configPath)
  const projectCfg = loadProjectConfig(repoRoot)

  const envVaultDir = process.env.ZHIFANGSI_VAULT_DIR
    ? path.resolve(expandHomePath(process.env.ZHIFANGSI_VAULT_DIR))
    : undefined
  const vaultDir = options.vaultDir
    ? path.resolve(expandHomePath(options.vaultDir))
    : envVaultDir || globalCfg.vaultDir
  const registryPath = path.join(vaultDir, 'registry.json')
  const slug = computeRepoSlug(repoRoot, vaultDir, projectCfg?.slug)

  // 1a. 显式 wikiDir
  if (options.wikiDir && options.wikiDir.trim()) {
    const { storageRoot, wikiDir } = resolveCustomWikiPair(repoRoot, options.wikiDir.trim())
    return {
      repoRoot,
      storageRoot,
      wikiDir,
      mode: 'custom',
      source: 'explicit',
      slug,
      vaultDir,
      registryPath,
    }
  }

  // 1b. 显式 storageMode 或显式 vaultDir
  if (options.storageMode === 'centralized' || (!options.storageMode && options.vaultDir)) {
    const storageRoot = path.join(vaultDir, 'repos', slug)
    return {
      repoRoot,
      storageRoot,
      wikiDir: path.join(storageRoot, 'wiki'),
      mode: 'centralized',
      source: 'explicit',
      slug,
      vaultDir,
      registryPath,
    }
  }
  if (options.storageMode === 'local') {
    return {
      repoRoot,
      storageRoot: repoRoot,
      wikiDir: path.join(repoRoot, 'wiki'),
      mode: 'local',
      source: 'explicit',
      slug,
      vaultDir,
      registryPath,
    }
  }

  // 2a. 环境变量 ZHIFANGSI_WIKI_DIR
  if (process.env.ZHIFANGSI_WIKI_DIR && process.env.ZHIFANGSI_WIKI_DIR.trim()) {
    const { storageRoot, wikiDir } = resolveCustomWikiPair(
      repoRoot,
      process.env.ZHIFANGSI_WIKI_DIR.trim()
    )
    return {
      repoRoot,
      storageRoot,
      wikiDir,
      mode: 'custom',
      source: 'env',
      slug,
      vaultDir,
      registryPath,
    }
  }

  // 2b. 环境变量 ZHIFANGSI_STORAGE_MODE / ZHIFANGSI_VAULT_DIR
  const envMode = process.env.ZHIFANGSI_STORAGE_MODE?.trim().toLowerCase()
  if (envMode === 'centralized' || (!envMode && envVaultDir)) {
    const storageRoot = path.join(vaultDir, 'repos', slug)
    return {
      repoRoot,
      storageRoot,
      wikiDir: path.join(storageRoot, 'wiki'),
      mode: 'centralized',
      source: 'env',
      slug,
      vaultDir,
      registryPath,
    }
  }
  if (envMode === 'local') {
    return {
      repoRoot,
      storageRoot: repoRoot,
      wikiDir: path.join(repoRoot, 'wiki'),
      mode: 'local',
      source: 'env',
      slug,
      vaultDir,
      registryPath,
    }
  }

  // 3. 项目级配置 .zhifangsi.json
  if (projectCfg) {
    if (projectCfg.wikiDir) {
      const { storageRoot, wikiDir } = resolveCustomWikiPair(repoRoot, projectCfg.wikiDir)
      const resolvedStorageRoot = projectCfg.storageRoot
        ? path.resolve(repoRoot, expandHomePath(projectCfg.storageRoot))
        : storageRoot
      return {
        repoRoot,
        storageRoot: resolvedStorageRoot,
        wikiDir,
        mode: 'custom',
        source: 'project-config',
        slug,
        vaultDir,
        registryPath,
      }
    }
    if (projectCfg.storageRoot) {
      const expandedRoot = expandHomePath(projectCfg.storageRoot)
      const storageRoot = path.isAbsolute(expandedRoot)
        ? path.resolve(expandedRoot)
        : path.resolve(repoRoot, expandedRoot)
      return {
        repoRoot,
        storageRoot,
        wikiDir: path.join(storageRoot, 'wiki'),
        mode: 'custom',
        source: 'project-config',
        slug,
        vaultDir,
        registryPath,
      }
    }
    if (projectCfg.storageMode === 'centralized') {
      const storageRoot = path.join(vaultDir, 'repos', slug)
      return {
        repoRoot,
        storageRoot,
        wikiDir: path.join(storageRoot, 'wiki'),
        mode: 'centralized',
        source: 'project-config',
        slug,
        vaultDir,
        registryPath,
      }
    }
    if (projectCfg.storageMode === 'local') {
      return {
        repoRoot,
        storageRoot: repoRoot,
        wikiDir: path.join(repoRoot, 'wiki'),
        mode: 'local',
        source: 'project-config',
        slug,
        vaultDir,
        registryPath,
      }
    }
  }

  // 4. 全局配置中的单仓库路径覆盖
  const targetKey = normalizeRepoKey(repoRoot)
  for (const [configuredRepo, configuredWiki] of Object.entries(globalCfg.repoOverrides)) {
    if (normalizeRepoKey(configuredRepo) === targetKey) {
      const { storageRoot, wikiDir } = resolveCustomWikiPair(repoRoot, configuredWiki)
      return {
        repoRoot,
        storageRoot,
        wikiDir,
        mode: 'custom',
        source: 'global-override',
        slug,
        vaultDir,
        registryPath,
      }
    }
  }

  // 5. 全局集中外置模式
  if (globalCfg.storageMode === 'centralized') {
    const storageRoot = path.join(vaultDir, 'repos', slug)
    return {
      repoRoot,
      storageRoot,
      wikiDir: path.join(storageRoot, 'wiki'),
      mode: 'centralized',
      source: 'global-centralized',
      slug,
      vaultDir,
      registryPath,
    }
  }

  // 6. 默认回退：原位本地模式
  return {
    repoRoot,
    storageRoot: repoRoot,
    wikiDir: path.join(repoRoot, 'wiki'),
    mode: 'local',
    source: 'default-local',
    slug,
    vaultDir,
    registryPath,
  }
}

/**
 * 读取 L1 全局跨项目路由注册表 (<vaultDir>/registry.json)
 */
export function loadRepoRegistry(vaultDir?: string): RepoRegistry {
  const effectiveVault = vaultDir ? path.resolve(expandHomePath(vaultDir)) : loadGlobalConfig().vaultDir
  const envVault = !vaultDir && process.env.ZHIFANGSI_VAULT_DIR
    ? path.resolve(expandHomePath(process.env.ZHIFANGSI_VAULT_DIR))
    : undefined
  const targetVault = envVault || effectiveVault
  const registryPath = path.join(targetVault, 'registry.json')

  const empty: RepoRegistry = {
    version: 1,
    updatedAt: new Date().toISOString(),
    repos: [],
  }

  if (!fs.existsSync(registryPath)) {
    return empty
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
    if (!parsed || !Array.isArray(parsed.repos)) return empty
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : empty.updatedAt,
      repos: parsed.repos,
    }
  } catch {
    return empty
  }
}

function listMarkdownSlugs(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return []
  try {
    return fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
  } catch {
    return []
  }
}

function extractSummaryFromWorkspace(repoRoot: string, storageRoot: string): {
  name: string
  summary?: string
  techStack?: string
} {
  let name = path.basename(repoRoot)
  let summary: string | undefined
  let techStack: string | undefined

  const pkgPath = path.join(repoRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (typeof pkg.name === 'string' && pkg.name.trim()) name = pkg.name.trim()
      if (typeof pkg.description === 'string' && pkg.description.trim()) {
        summary = pkg.description.trim()
      }
    } catch {
      // ignore
    }
  }

  const purposePath = path.join(storageRoot, 'purpose.md')
  if (fs.existsSync(purposePath)) {
    try {
      const content = fs.readFileSync(purposePath, 'utf-8')
      const stackMatch = content.match(/\*\*主要技术栈\*\*:\s*(.+)/)
      if (stackMatch && stackMatch[1].trim()) {
        techStack = stackMatch[1].trim()
      }
      if (!summary) {
        const missionMatch = content.match(/-\s*核心使命[:：]\s*(.+)/)
        if (missionMatch && missionMatch[1].trim()) {
          summary = missionMatch[1].trim()
        }
      }
    } catch {
      // ignore
    }
  }

  const projectCfg = loadProjectConfig(repoRoot)
  if (projectCfg?.summary) {
    summary = projectCfg.summary
  }

  return { name, summary, techStack }
}

function isInsideSystemTempDir(targetPath: string): boolean {
  const normTarget = normalizeRepoKey(targetPath)
  const normTmp = normalizeRepoKey(os.tmpdir())
  return normTarget === normTmp || normTarget.startsWith(normTmp + '/')
}

/**
 * 写入或更新目标项目在 L1 全局路由注册表中的轻量名片（供 Super-agent Router 快速定位 Repo）
 */
export function upsertRepoRegistry(
  storage: ResolvedStoragePaths,
  meta: Partial<Pick<RepoRegistryEntry, 'name' | 'techStack' | 'summary' | 'keywords'>> = {},
  options: { force?: boolean } = {}
): RepoRegistryEntry | null {
  // 防止默认临时目录单元测试污染宿主真实 ~/.zhifangsi/vault/registry.json
  const defaultVault = path.join(getDefaultHomeDir(), 'vault')
  if (
    !options.force &&
    normalizeRepoKey(storage.vaultDir) === normalizeRepoKey(defaultVault) &&
    (Boolean(process.env.VITEST) || isInsideSystemTempDir(storage.repoRoot))
  ) {
    return null
  }

  const extracted = extractSummaryFromWorkspace(storage.repoRoot, storage.storageRoot)
  const projectCfg = loadProjectConfig(storage.repoRoot)
  const modules = listMarkdownSlugs(path.join(storage.wikiDir, 'modules'))
  const workflows = listMarkdownSlugs(path.join(storage.wikiDir, 'workflows'))
  const invariants = listMarkdownSlugs(path.join(storage.wikiDir, 'invariants'))

  const keywords = Array.from(
    new Set([
      ...(meta.keywords || []),
      ...(projectCfg?.keywords || []),
      ...modules,
      ...workflows,
    ])
  ).slice(0, 30)

  const entry: RepoRegistryEntry = {
    slug: storage.slug,
    name: meta.name || extracted.name || storage.slug,
    repoPath: storage.repoRoot,
    storageRoot: storage.storageRoot,
    wikiDir: storage.wikiDir,
    storageMode: storage.mode,
    techStack: meta.techStack || extracted.techStack,
    summary: meta.summary || extracted.summary,
    modules,
    workflows,
    invariants,
    keywords,
    updatedAt: new Date().toISOString(),
  }

  const registry = loadRepoRegistry(storage.vaultDir)
  const targetKey = normalizeRepoKey(storage.repoRoot)
  const idx = registry.repos.findIndex((r) => normalizeRepoKey(r.repoPath) === targetKey)
  if (idx >= 0) {
    registry.repos[idx] = entry
  } else {
    registry.repos.push(entry)
  }
  registry.updatedAt = new Date().toISOString()

  fs.mkdirSync(path.dirname(storage.registryPath), { recursive: true })
  fs.writeFileSync(storage.registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
  return entry
}

/**
 * 检索 L1 全局项目注册表（Super-agent Router 层第一跳寻址：仅返回各项目轻量名片，不加载 L2 完整 Wiki）
 */
export function searchRepoRegistry(query?: string, vaultDir?: string): RepoRegistryEntry[] {
  const registry = loadRepoRegistry(vaultDir)
  if (!query || !query.trim()) {
    return registry.repos
  }

  const terms = query
    .toLowerCase()
    .split(/[\s,.;/|]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  if (terms.length === 0) return registry.repos

  const scored = registry.repos
    .map((entry) => {
      let score = 0
      const slug = entry.slug.toLowerCase()
      const name = entry.name.toLowerCase()
      const summary = (entry.summary || '').toLowerCase()
      const stack = (entry.techStack || '').toLowerCase()
      const repoPath = entry.repoPath.toLowerCase()
      const keywords = (entry.keywords || []).join(' ').toLowerCase()
      const modules = (entry.modules || []).join(' ').toLowerCase()
      const workflows = (entry.workflows || []).join(' ').toLowerCase()

      for (const term of terms) {
        if (slug === term || name === term) score += 20
        else if (slug.includes(term) || name.includes(term)) score += 12
        if (modules.includes(term) || workflows.includes(term)) score += 8
        if (keywords.includes(term)) score += 6
        if (summary.includes(term)) score += 5
        if (stack.includes(term) || repoPath.includes(term)) score += 3
      }
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((item) => item.entry)
}

export function formatRepoRegistryReport(
  entries: RepoRegistryEntry[],
  options: { query?: string; vaultDir?: string; storageMode?: StorageMode } = {}
): string {
  const lines: string[] = []
  lines.push('# 职方司 L1 跨项目路由注册表 (Repo Registry)')
  const modeLabel = options.storageMode
    ? options.storageMode === 'centralized'
      ? '集中外置 (centralized)'
      : '原位本地 (local)'
    : undefined
  const metaParts = [
    modeLabel ? `默认模式: ${modeLabel}` : null,
    options.vaultDir ? `Vault: \`${options.vaultDir}\`` : null,
    options.query ? `检索词: \`${options.query}\`` : null,
    `命中项目数: ${entries.length}`,
  ].filter(Boolean)
  lines.push(`> ${metaParts.join(' | ')}\n`)

  if (entries.length === 0) {
    lines.push('*当前注册表暂无匹配项目。可在目标代码库运行 `zhifangsi init`、`zhifangsi bootstrap` 或 `zhifangsi map` 自动登记 L1 路由名片。*')
    return lines.join('\n')
  }

  for (const e of entries) {
    lines.push(`## \`${e.slug}\` — ${e.name}`)
    lines.push(`- **源码仓库 (Repo)**: \`${e.repoPath}\``)
    lines.push(`- **知识库 (Wiki)**: \`${e.wikiDir}\` (${e.storageMode})`)
    if (e.techStack) lines.push(`- **技术栈**: ${e.techStack}`)
    if (e.summary) lines.push(`- **职责摘要**: ${e.summary}`)
    if (e.modules && e.modules.length > 0) {
      lines.push(`- **已建档模块 (${e.modules.length})**: ${e.modules.slice(0, 12).map((m) => `\`${m}\``).join(', ')}`)
    }
    if (e.workflows && e.workflows.length > 0) {
      lines.push(`- **业务流水线 (${e.workflows.length})**: ${e.workflows.slice(0, 8).map((w) => `\`${w}\``).join(', ')}`)
    }
    if (e.invariants && e.invariants.length > 0) {
      lines.push(`- **关防守则 (${e.invariants.length})**: ${e.invariants.slice(0, 8).map((i) => `\`${i}\``).join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
