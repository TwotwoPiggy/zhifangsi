import { describe, expect, it, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initWikiProject } from '../src/init/scaffold.js'

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
})
