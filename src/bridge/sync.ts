import { LLMWikiBridge } from './client.js'
import * as fs from 'fs'
import * as path from 'path'

export interface SyncOptions {
  projectDir: string
  wikiDir?: string
}

export interface SyncReport {
  bridgeActive: boolean
  projectId?: string
  pagesSynced: string[]
  errors: string[]
}

/**
 * Synchronize local wiki/ architecture pages to LLM Wiki desktop application if running
 */
export async function syncToLLMWiki(options: SyncOptions, bridge = new LLMWikiBridge()): Promise<SyncReport> {
  const report: SyncReport = {
    bridgeActive: false,
    pagesSynced: [],
    errors: [],
  }

  const isAvailable = await bridge.isAvailable()
  if (!isAvailable) {
    return report
  }

  report.bridgeActive = true
  const project = await bridge.findProjectByPath(options.projectDir)
  if (!project) {
    report.errors.push(`Project at ${options.projectDir} is not open in LLM Wiki desktop`)
    return report
  }

  report.projectId = project.id
  const wikiRoot = options.wikiDir || path.join(options.projectDir, 'wiki')

  if (!fs.existsSync(wikiRoot)) {
    return report
  }

  // Scan wiki/modules, wiki/workflows, wiki/invariants
  const subdirs = ['modules', 'workflows', 'invariants', 'adr']
  for (const sub of subdirs) {
    const fullSub = path.join(wikiRoot, sub)
    if (fs.existsSync(fullSub)) {
      const files = fs.readdirSync(fullSub).filter((f) => f.endsWith('.md'))
      for (const file of files) {
        const relPath = `wiki/${sub}/${file}`
        try {
          const success = await bridge.embedPage(project.id, relPath)
          if (success) {
            report.pagesSynced.push(relPath)
          }
        } catch (err: any) {
          report.errors.push(`Failed to embed ${relPath}: ${err?.message || err}`)
        }
      }
    }
  }

  return report
}
