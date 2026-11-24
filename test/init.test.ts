import { describe, expect, it, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initWikiProject, prepareCodebaseSources } from '../src/init/scaffold.js'
import { onboardWikiWorkspace, formatOnboardReport } from '../src/mcp/onboard.js'
import type { LLMWikiBridge } from '../src/bridge/client.js'

describe('initWikiProject', () => {
  const testDir = path.join(os.tmpdir(), `zhifangsi-test-init-${Date.now()}`)

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('initializes standard Codebase Map wiki structure in target directory', () => {
    fs.mkdirSync(testDir, { recursive: true })
    // Mock a package.json
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-test-app', dependencies: { typescript: '^5.0.0', react: '^18.0.0' } }),
      'utf-8'
    )

    const result = initWikiProject(testDir)

    expect(result.projectName).toBe('my-test-app')
    expect(fs.existsSync(result.schemaPath)).toBe(true)
    expect(fs.existsSync(result.wikiPath)).toBe(true)

    // Check schema.md content
    const schemaContent = fs.readFileSync(result.schemaPath, 'utf-8')
    expect(schemaContent).toContain('Codebase Map & Living Architecture')
    expect(schemaContent).toContain('wiki/modules/')
    expect(schemaContent).toContain('wiki/invariants/')
    expect(schemaContent).toContain('wiki/workflows/')

    // Check purpose.md content
    const purposeContent = fs.readFileSync(path.join(testDir, 'purpose.md'), 'utf-8')
    expect(purposeContent).toContain('my-test-app')
    expect(purposeContent).toContain('TypeScript, React')

    // Check subdirectories
    expect(fs.existsSync(path.join(testDir, 'wiki', 'modules'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'wiki', 'workflows'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'wiki', 'invariants'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'wiki', 'adr'))).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'wiki', 'invariants', '001-unidirectional-flow.md'))).toBe(true)

    // Check obsidian config
    expect(fs.existsSync(path.join(testDir, '.obsidian', 'app.json'))).toBe(true)
  })

  it('skips existing files when force is false', () => {
    fs.mkdirSync(testDir, { recursive: true })
    const existingSchema = '# Custom Schema'
    fs.writeFileSync(path.join(testDir, 'schema.md'), existingSchema, 'utf-8')

    const result = initWikiProject(testDir, { force: false })
    expect(result.skippedFiles).toContain('schema.md')
    expect(fs.readFileSync(result.schemaPath, 'utf-8')).toBe(existingSchema)
  })

  it('prepares subsystem codebase skeletons and copies CODEBASE_MAP.md into raw/sources', () => {
    const srcCore = path.join(testDir, 'src', 'core')
    fs.mkdirSync(srcCore, { recursive: true })
    fs.writeFileSync(
      path.join(srcCore, 'engine.ts'),
      [
        'export interface EngineConfig { name: string }',
        'export function runEngine(cfg: EngineConfig): string {',
        '  const step1 = cfg.name.trim()',
        '  const step2 = step1.toUpperCase()',
        '  return step2',
        '}',
      ].join('\n'),
      'utf-8'
    )
    fs.writeFileSync(path.join(testDir, 'CODEBASE_MAP.md'), '# Existing Map\n', 'utf-8')

    const prep = prepareCodebaseSources(testDir)
    expect(prep.filesProcessed).toBe(1)
    expect(prep.copiedCodebaseMap).toBe(true)
    expect(fs.existsSync(path.join(testDir, 'raw', 'sources', 'CODEBASE_MAP.md'))).toBe(true)
    expect(prep.subsystemFiles).toContain('raw/sources/codebase/subsystem-src-core.md')
    expect(prep.manifestPath && fs.existsSync(prep.manifestPath)).toBe(true)

    const subsystemContent = fs.readFileSync(
      path.join(testDir, 'raw', 'sources', 'codebase', 'subsystem-src-core.md'),
      'utf-8'
    )
    expect(subsystemContent).toContain('export interface EngineConfig')
    expect(subsystemContent).toContain('implementation omitted')
  })

  it('runs one-click onboardWikiWorkspace across offline, unmounted, and synced bridge states', async () => {
    const srcApp = path.join(testDir, 'src', 'workflow')
    const srcApi = path.join(testDir, 'src', 'api')
    const customVault = path.join(testDir, '.tmp-vault')
    fs.mkdirSync(srcApp, { recursive: true })
    fs.mkdirSync(srcApi, { recursive: true })

    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'nexus-flow', dependencies: { typescript: '^5.0.0' } }),
      'utf-8'
    )
    fs.writeFileSync(
      path.join(srcApi, 'client.ts'),
      'export function fetchFlow(id: string): Promise<string> { return Promise.resolve(id) }\n',
      'utf-8'
    )
    fs.writeFileSync(
      path.join(srcApp, 'runner.ts'),
      `import { fetchFlow } from '../api/client'\nexport async function startFlow(id: string) { return await fetchFlow(id) }\n`,
      'utf-8'
    )

    // 1. Offline bridge in centralized mode
    const offlineBridge = {
      isAvailable: async () => false,
    } as unknown as LLMWikiBridge

    const offlineResult = await onboardWikiWorkspace(
      {
        targetDir: testDir,
        storageMode: 'centralized',
        vaultDir: customVault,
      },
      offlineBridge
    )

    expect(offlineResult.storageMode).toBe('centralized')
    expect(offlineResult.bridgeState).toBe('offline')
    expect(offlineResult.bootstrap?.modulesCreated).toEqual(
      expect.arrayContaining(['wiki/modules/api.md', 'wiki/modules/workflow.md'])
    )
    expect(offlineResult.codebaseMapGenerated).toBe(true)
    expect(fs.existsSync(path.join(offlineResult.storageRoot, 'raw', 'sources', 'CODEBASE_MAP.md'))).toBe(true)
    expect(fs.existsSync(path.join(offlineResult.storageRoot, 'raw', 'sources', 'codebase', 'codebase-manifest.md'))).toBe(true)

    // 2. Online but unmounted bridge
    const unmountedBridge = {
      isAvailable: async () => true,
      findProjectByPath: async () => null,
    } as unknown as LLMWikiBridge

    const unmountedResult = await onboardWikiWorkspace(
      {
        targetDir: testDir,
        storageMode: 'centralized',
        vaultDir: customVault,
      },
      unmountedBridge
    )
    expect(unmountedResult.bridgeState).toBe('online-unmounted')
    const unmountedReport = formatOnboardReport(unmountedResult)
    expect(unmountedReport).toContain(unmountedResult.storageRoot)
    expect(unmountedReport).toContain('/zhifangsi-sync')

    // 3. Online & mounted bridge -> auto sync + rescanSources
    const embeddedPaths: string[] = []
    let rescannedId = ''
    const syncedBridge = {
      isAvailable: async () => true,
      findProjectByPath: async (p: string) =>
        p.toLowerCase().includes('repos')
          ? { id: 'proj-nexus', name: 'NexusFlow', path: offlineResult.storageRoot }
          : null,
      embedPage: async (_id: string, relPath: string) => {
        embeddedPaths.push(relPath)
        return true
      },
      rescanSources: async (id: string) => {
        rescannedId = id
        return true
      },
    } as unknown as LLMWikiBridge

    const syncedResult = await onboardWikiWorkspace(
      {
        targetDir: testDir,
        storageMode: 'centralized',
        vaultDir: customVault,
        force: true,
      },
      syncedBridge
    )
    expect(syncedResult.bridgeState).toBe('synced')
    expect(syncedResult.sourcesRescanned).toBe(true)
    expect(rescannedId).toBe('proj-nexus')
    expect(embeddedPaths).toEqual(
      expect.arrayContaining([
        'wiki/modules/api.md',
        'wiki/modules/workflow.md',
        'wiki/invariants/001-unidirectional-flow.md',
      ])
    )
  })
})
