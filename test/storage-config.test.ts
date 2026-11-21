import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  resolveStoragePaths,
  saveGlobalConfig,
  loadGlobalConfig,
  setRepoOverride,
  unsetRepoOverride,
  loadRepoRegistry,
  searchRepoRegistry,
} from '../src/config/storage.js'
import { initWikiProject, bootstrapWikiModules } from '../src/init/scaffold.js'
import { buildWorkspaceGraph, formatZhifangsiMap, searchLocalWorkspace, analyzeChangeImpact } from '../src/mcp/helpers.js'
import { loadInvariantsFromWorkspace, checkInvariants } from '../src/invariants/checker.js'
import { createZhifangsiMcpServer } from '../src/mcp/server.js'

describe('Storage Configuration: Default Local + Centralized External Vault', () => {
  let tmpRoot: string
  let configPath: string
  let vaultDir: string
  let repoA: string
  let repoB: string

  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zhifangsi-storage-test-'))
    configPath = path.join(tmpRoot, 'config.json')
    vaultDir = path.join(tmpRoot, 'vault')
    repoA = path.join(tmpRoot, 'work', 'payment-service')
    repoB = path.join(tmpRoot, 'personal', 'payment-service')

    fs.mkdirSync(path.join(repoA, 'src', 'core'), { recursive: true })
    fs.mkdirSync(path.join(repoA, 'src', 'ui'), { recursive: true })
    fs.writeFileSync(
      path.join(repoA, 'package.json'),
      JSON.stringify({
        name: 'payment-service',
        description: '支付回调与清结算核心微服务',
        dependencies: { typescript: '^5.0.0' },
      }),
      'utf-8'
    )
    fs.writeFileSync(
      path.join(repoA, 'src', 'core', 'ledger.ts'),
      `export function settlePayment(orderId: string): boolean { return Boolean(orderId); }\n`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(repoA, 'src', 'ui', 'checkout.ts'),
      `import { settlePayment } from '../core/ledger';\nexport function renderCheckout() { return settlePayment('1'); }\n`,
      'utf-8'
    )

    fs.mkdirSync(repoB, { recursive: true })

    for (const k of ['ZHIFANGSI_CONFIG_PATH', 'ZHIFANGSI_VAULT_DIR', 'ZHIFANGSI_WIKI_DIR', 'ZHIFANGSI_STORAGE_MODE']) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
    process.env.ZHIFANGSI_CONFIG_PATH = configPath
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('defaults to repo-local storage (<repo>/wiki) without config file', () => {
    const cfg = loadGlobalConfig()
    expect(cfg.storageMode).toBe('local')

    const resolved = resolveStoragePaths(repoA)
    expect(resolved.mode).toBe('local')
    expect(resolved.source).toBe('default-local')
    expect(resolved.storageRoot).toBe(path.resolve(repoA))
    expect(resolved.wikiDir).toBe(path.join(path.resolve(repoA), 'wiki'))
  })

  it('supports global centralized external vault without polluting the source repo', () => {
    saveGlobalConfig({ storageMode: 'centralized', vaultDir })

    const resolved = resolveStoragePaths(repoA)
    expect(resolved.mode).toBe('centralized')
    expect(resolved.source).toBe('global-centralized')
    expect(resolved.slug).toBe('payment-service')
    expect(resolved.storageRoot).toBe(path.join(vaultDir, 'repos', 'payment-service'))
    expect(resolved.wikiDir).toBe(path.join(vaultDir, 'repos', 'payment-service', 'wiki'))

    // 1. init writes into external vault, NOT inside repoA
    const initRes = initWikiProject(repoA)
    expect(initRes.storageMode).toBe('centralized')
    expect(fs.existsSync(path.join(repoA, 'wiki'))).toBe(false)
    expect(fs.existsSync(path.join(repoA, 'schema.md'))).toBe(false)
    expect(fs.existsSync(path.join(resolved.storageRoot, 'schema.md'))).toBe(true)
    expect(fs.existsSync(path.join(resolved.wikiDir, 'invariants', '001-unidirectional-flow.md'))).toBe(true)

    // 2. bootstrap writes modules into external vault
    const graph = buildWorkspaceGraph(repoA)
    const bootRes = bootstrapWikiModules(repoA, graph)
    expect(bootRes.wikiDir).toBe(resolved.wikiDir)
    expect(fs.existsSync(path.join(resolved.wikiDir, 'modules', 'core.md'))).toBe(true)
    expect(fs.existsSync(path.join(resolved.wikiDir, 'modules', 'ui.md'))).toBe(true)

    // 3. write an invariant and workflow inside external vault and verify check/map/search/impact
    fs.writeFileSync(
      path.join(resolved.wikiDir, 'invariants', 'no-ui-to-core.md'),
      `---
id: no-ui-to-core
type: invariant
title: UI 禁止直连 Core 账本
severity: error
rules:
  - "禁止 UI 直接调用账本层"
constraints:
  - type: deny_import
    from: "src/ui/**"
    disallowed:
      - "src/core/**"
    message: "UI 层严禁直接导入 core 账本"
---`,
      'utf-8'
    )

    fs.writeFileSync(
      path.join(resolved.wikiDir, 'workflows', 'payment-callback.md'),
      `---
type: workflow
title: 支付回调清结算流水线
---
# 支付回调清结算
涉及模块 [[modules/core]] 与 [[modules/ui]]。`,
      'utf-8'
    )

    const invariants = loadInvariantsFromWorkspace(repoA)
    expect(invariants.some((i) => i.id === 'no-ui-to-core')).toBe(true)

    const checkReport = checkInvariants(invariants, graph, { rootDir: repoA })
    expect(checkReport.passed).toBe(false)
    expect(checkReport.violations[0].sourceFile).toBe('src/ui/checkout.ts')

    const mapMd = formatZhifangsiMap(repoA, graph, false)
    expect(mapMd).toContain('集中外置')
    expect(mapMd).toContain('[[modules/core]]')
    expect(mapMd).toContain('[[workflows/payment-callback]]')
    expect(mapMd).toContain('[[invariants/no-ui-to-core]]')

    const hits = searchLocalWorkspace(repoA, '支付回调', graph)
    expect(hits.some((h) => h.kind === 'wiki' && h.path === 'wiki/workflows/payment-callback.md')).toBe(true)

    const impact = analyzeChangeImpact(repoA, ['src/core/ledger.ts'], graph)
    expect(impact.affectedModules).toContain('core')
    expect(impact.affectedWorkflows).toContain('payment-callback')
  })

  it('prevents slug collisions for same-named repos at different paths and populates L1 registry', async () => {
    saveGlobalConfig({ storageMode: 'centralized', vaultDir })

    initWikiProject(repoA)
    const graphA = buildWorkspaceGraph(repoA)
    bootstrapWikiModules(repoA, graphA)

    // repoB has the same basename "payment-service" in a different parent folder
    const initResB = initWikiProject(repoB)
    const resolvedA = resolveStoragePaths(repoA)
    const resolvedB = resolveStoragePaths(repoB)

    expect(resolvedA.slug).toBe('payment-service')
    expect(resolvedB.slug).not.toBe('payment-service')
    expect(resolvedB.slug.startsWith('payment-service-')).toBe(true)
    expect(initResB.wikiPath).not.toBe(resolvedA.wikiDir)

    const registry = loadRepoRegistry(vaultDir)
    expect(registry.repos.length).toBe(2)

    const matched = searchRepoRegistry('清结算', vaultDir)
    expect(matched.length).toBe(1)
    expect(matched[0].repoPath).toBe(path.resolve(repoA))
    expect(matched[0].wikiDir).toBe(resolvedA.wikiDir)
    expect(matched[0].modules).toEqual(expect.arrayContaining(['core', 'ui']))

    // Verify MCP zhifangsi_repos tool + zhifangsi_module_info + zhifangsi_workflow_trace against centralized vault
    const server = createZhifangsiMcpServer()
    const callHandler = (server as any)._requestHandlers.get('tools/call')

    const reposResp = await callHandler(
      { method: 'tools/call', params: { name: 'zhifangsi_repos', arguments: { query: '清结算' } } },
      {}
    )
    const reposJson = JSON.parse(reposResp.content[1].text)
    expect(reposJson.storageMode).toBe('centralized')
    expect(reposJson.totalMatches).toBe(1)
    expect(reposJson.repos[0].slug).toBe('payment-service')

    const modResp = await callHandler(
      {
        method: 'tools/call',
        params: { name: 'zhifangsi_module_info', arguments: { target_dir: repoA, module_name: 'core' } },
      },
      {}
    )
    expect(modResp.content[0].text).toContain('core 模块架构档案')
    expect(modResp.content[0].text).toContain(resolvedA.wikiDir)
  })

  it('respects strict resolution precedence: explicit > env > project-config > global-override > global-centralized > default-local', () => {
    saveGlobalConfig({ storageMode: 'centralized', vaultDir })
    expect(resolveStoragePaths(repoA).source).toBe('global-centralized')

    const overrideWiki = path.join(tmpRoot, 'override-wiki')
    setRepoOverride(repoA, overrideWiki)
    expect(resolveStoragePaths(repoA).source).toBe('global-override')
    expect(resolveStoragePaths(repoA).wikiDir).toBe(overrideWiki)

    // .zhifangsi.json overrides global override
    const projCustomDir = path.join(tmpRoot, 'project-custom', 'wiki')
    fs.writeFileSync(
      path.join(repoA, '.zhifangsi.json'),
      JSON.stringify({ wikiDir: projCustomDir }),
      'utf-8'
    )
    expect(resolveStoragePaths(repoA).source).toBe('project-config')
    expect(resolveStoragePaths(repoA).wikiDir).toBe(projCustomDir)

    // env ZHIFANGSI_WIKI_DIR overrides project-config
    const envWiki = path.join(tmpRoot, 'env-wiki')
    process.env.ZHIFANGSI_WIKI_DIR = envWiki
    expect(resolveStoragePaths(repoA).source).toBe('env')
    expect(resolveStoragePaths(repoA).wikiDir).toBe(envWiki)

    // explicit option overrides env
    const explicitWiki = path.join(tmpRoot, 'explicit-wiki')
    expect(resolveStoragePaths(repoA, { wikiDir: explicitWiki }).source).toBe('explicit')
    expect(resolveStoragePaths(repoA, { wikiDir: explicitWiki }).wikiDir).toBe(explicitWiki)

    // Cleanup env & project config -> unsetRepoOverride restores global-centralized
    delete process.env.ZHIFANGSI_WIKI_DIR
    fs.unlinkSync(path.join(repoA, '.zhifangsi.json'))
    unsetRepoOverride(repoA)
    expect(resolveStoragePaths(repoA).source).toBe('global-centralized')
  })
})
