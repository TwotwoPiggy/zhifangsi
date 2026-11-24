#!/usr/bin/env node

/**
 * 兵部职方司 (zhifangsi) — 自动更新引擎（对齐 yongle-dadian 更新规范）
 *
 * 作用：
 *   1. 自动识别安装模式（Git 仓库开发模式 / npm 全局包模式）
 *   2. 检测当前版本与远程版本（支持 Git 稳定版 Tag / 分支 / Commit、指定版本与 NPM 注册表查询）
 *   3. Git 模式下自动执行脏工作区拦截、拉取/切换、package-lock.json 依赖变化检测与 TypeScript 重新编译
 *   4. Git 模式下任意阶段故障自动回滚到原始分支与 Commit（git reset --hard）
 *   5. 读取多宿主安装清单（install-manifest.json），通过新子进程重新注入 Antigravity 与已登记 IDE 集成配置
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { fileURLToPath } from 'url'
import { execFileSync, execSync } from 'child_process'
import {
  resolveHomeDir,
  loadInstallManifest,
  getAntigravityManifestPath,
} from './install-antigravity.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultPackageRoot = path.resolve(__dirname, '..')
const DEFAULT_REPO_URL = 'git+https://github.com/TwotwoPiggy/zhifangsi.git'

// ─── ANSI 颜色常量 ─────────────────────────────────────────
const cyan = '\x1b[36m'
const green = '\x1b[32m'
const yellow = '\x1b[33m'
const red = '\x1b[31m'
const bold = '\x1b[1m'
const dim = '\x1b[2m'
const reset = '\x1b[0m'

// ─── 辅助工具函数 ──────────────────────────────────────────

export function readPackageJson(root = defaultPackageRoot) {
  try {
    const pkgPath = path.join(root, 'package.json')
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  } catch {
    return { name: 'zhifangsi', version: '1.1.0' }
  }
}

export function getFileMd5(filePath) {
  if (!fs.existsSync(filePath)) return ''
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(content).digest('hex')
  } catch {
    return ''
  }
}

export function parseUpdateArgs(rawArgs = []) {
  const parsed = {
    targetVersion: undefined,
    checkOnly: false,
    force: false,
    useGit: false,
    useNpm: false,
    noReinstall: false,
    proxy: undefined,
    help: false,
  }

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i]
    if (token === '--check' || token === '--dry-run' || token === '-c') {
      parsed.checkOnly = true
    } else if (token === '--force' || token === '-f') {
      parsed.force = true
    } else if (token === '--git') {
      parsed.useGit = true
    } else if (token === '--npm') {
      parsed.useNpm = true
    } else if (token === '--no-reinstall') {
      parsed.noReinstall = true
    } else if (token === '-h' || token === '--help') {
      parsed.help = true
    } else if (token === '--proxy' && rawArgs[i + 1]) {
      parsed.proxy = rawArgs[++i]
    } else if (token.startsWith('--proxy=')) {
      parsed.proxy = token.slice('--proxy='.length)
    } else if (!token.startsWith('-') && !parsed.targetVersion) {
      parsed.targetVersion = token.trim()
    }
  }

  return parsed
}

function buildChildEnv(options = {}) {
  const env = { ...process.env }
  if (options.proxy) {
    env.http_proxy = options.proxy
    env.https_proxy = options.proxy
    env.HTTP_PROXY = options.proxy
    env.HTTPS_PROXY = options.proxy
  }
  if (options.homeDir) {
    env.ZHIFANGSI_HOME_DIR = path.resolve(options.homeDir)
  }
  if (options.manifestPath) {
    env.ZHIFANGSI_INSTALL_MANIFEST = path.resolve(options.manifestPath)
  }
  return env
}

function defaultRunGit(gitArgs, { cwd, env, stdio = 'pipe', proxy } = {}) {
  const finalArgs = proxy ? ['-c', `http.proxy=${proxy}`, ...gitArgs] : gitArgs
  const out = execFileSync('git', finalArgs, {
    cwd,
    env,
    stdio,
    encoding: 'utf-8',
  })
  return typeof out === 'string' ? out.trim() : ''
}

function defaultRunShell(cmd, { cwd, env, stdio = 'inherit' } = {}) {
  const out = execSync(cmd, {
    cwd,
    env,
    stdio,
    encoding: 'utf-8',
  })
  return typeof out === 'string' ? out.trim() : ''
}

function defaultRunInstallerProcess(scriptPath, installerArgs, { cwd, env, stdio = 'inherit' } = {}) {
  execFileSync(process.execPath, [scriptPath, ...installerArgs], {
    cwd,
    env,
    stdio,
    encoding: 'utf-8',
  })
}

async function defaultFetchNpmVersion(pkgName, tagOrVersion = 'latest') {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4500)
    const encodedTarget = encodeURIComponent(tagOrVersion || 'latest')
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/${encodedTarget}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data && data.version) return String(data.version).trim()
    }
  } catch {
    // ignore network / abort errors
  }
  return null
}

function printBanner(version, log) {
  log(
    '\n' +
      cyan +
      '  ╔═══════════════════════════════════════╗\n' +
      '  ║       兵 部 职 方 司  Zhifangsi       ║\n' +
      '  ╚═══════════════════════════════════════╝' +
      reset +
      '\n\n' +
      '  正在运行更新向导 ' +
      dim +
      'v' +
      version +
      reset +
      '\n'
  )
}

function printHelp(log) {
  log(`
${cyan}职方司 (zhifangsi) 自动更新向导${reset}

用法:
  zhifangsi update [target] [选项]
  zhifangsi upgrade [target] [选项]

参数:
  [target]          可选，指定目标版本号、Git Tag 或分支名（如 v1.1.1、1.1.1、main）

选项:
  --check, --dry-run  仅检测可用更新，不修改本地代码或宿主配置
  --force, -f         即使已是最新版本，也强制执行更新与重新注入
  --git               NPM 模式下强制从 GitHub 远端源拉取安装
  --npm               强制使用 NPM 全局包模式检查与安装
  --no-reinstall      仅更新代码/包，跳过重新注入宿主 Skills 与 MCP 配置
  --proxy <url>       指定 Git / NPM 代理地址（如 http://127.0.0.1:10808）
  -h, --help          显示此帮助信息
`)
}

/**
 * 解析 Git 目标引用（支持 origin/<target>、<target> 以及 1.2.3 自动补全 v1.2.3）
 */
function resolveGitTarget(target, runGit, gitOpts) {
  const candidates = [target]
  if (/^\d+\.\d+\.\d+/.test(target) && !target.startsWith('v')) {
    candidates.push(`v${target}`)
  }

  for (const cand of candidates) {
    // 1. 先检查远程分支 origin/<cand>
    try {
      const commit = runGit(['rev-parse', '--verify', `refs/remotes/origin/${cand}^{commit}`], gitOpts)
      if (commit) {
        return {
          commit,
          checkoutName: cand,
          displayRef: cand,
          isBranch: true,
        }
      }
    } catch {
      // ignore
    }

    // 2. 再检查本地分支 refs/heads/<cand>
    try {
      const commit = runGit(['rev-parse', '--verify', `refs/heads/${cand}^{commit}`], gitOpts)
      if (commit) {
        return {
          commit,
          checkoutName: cand,
          displayRef: cand,
          isBranch: true,
        }
      }
    } catch {
      // ignore
    }

    // 3. 再检查 Tag / Commit
    try {
      const commit = runGit(['rev-parse', '--verify', `${cand}^{commit}`], gitOpts)
      if (commit) {
        return {
          commit,
          checkoutName: cand,
          displayRef: cand,
          isBranch: false,
        }
      }
    } catch {
      // ignore
    }
  }

  return null
}

function findLatestStableTag(runGit, gitOpts) {
  try {
    const tagsRaw = runGit(['tag', '--sort=-v:refname'], gitOpts)
    if (tagsRaw) {
      const tags = tagsRaw
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean)
      const semverTag = tags.find((t) => /^v?\d+\.\d+\.\d+/.test(t))
      if (semverTag) return semverTag
      if (tags.length > 0) return tags[0]
    }
  } catch {
    // ignore
  }

  try {
    const latestTagCommit = runGit(['rev-list', '--tags', '--max-count=1'], gitOpts)
    if (latestTagCommit) {
      return runGit(['describe', '--tags', '--abbrev=0', latestTagCommit], gitOpts)
    }
  } catch {
    // ignore
  }
  return ''
}

function isCommitAncestor(ancestorCommit, descendantCommit, runGit, gitOpts) {
  try {
    runGit(['merge-base', '--is-ancestor', ancestorCommit, descendantCommit], gitOpts)
    return true
  } catch {
    return false
  }
}

function detectRemoteBranchBehindCount(branch, runGit, gitOpts) {
  const candidates = []
  if (branch && branch !== 'HEAD') candidates.push(branch)
  if (!candidates.includes('main')) candidates.push('main')
  if (!candidates.includes('master')) candidates.push('master')

  for (const br of candidates) {
    try {
      const raw = runGit(['rev-list', `HEAD..origin/${br}`, '--count'], gitOpts)
      const count = parseInt(raw, 10)
      if (!Number.isNaN(count)) {
        return { branch: br, count }
      }
    } catch {
      // try next fallback branch
    }
  }
  return { branch: branch || 'main', count: 0 }
}

function rollbackGit(originalCommit, originalBranch, runGit, gitOpts, log, errorLog, inheritStdio = 'inherit') {
  if (!originalCommit) return false
  log(`\n  ${red}✗ 错误: 更新过程中发生故障，准备自动回滚到初始状态...${reset}`)
  try {
    if (originalBranch && originalBranch !== 'HEAD') {
      runGit(['checkout', '--force', originalBranch], { ...gitOpts, stdio: inheritStdio })
      runGit(['reset', '--hard', originalCommit], { ...gitOpts, stdio: inheritStdio })
    } else {
      runGit(['checkout', '--force', '--detach', originalCommit], { ...gitOpts, stdio: inheritStdio })
    }
    log(
      `  ${green}✓${reset} 成功回退到 Commit: ${originalCommit.slice(0, 7)}${
        originalBranch && originalBranch !== 'HEAD' ? ` (分支 ${originalBranch})` : ' (detached HEAD)'
      }`
    )
    return true
  } catch (err) {
    errorLog(`  ${red}✗ 回退失败: ${err.message}. 请手动检查工作树状态 (git status)。${reset}`)
    return false
  }
}

function discoverReinstallTargets(homeDir, freshPkgRoot, log) {
  const manifest = loadInstallManifest(homeDir)
  const agyManifestPath = getAntigravityManifestPath(homeDir)
  const legacySkillDir = path.join(homeDir, '.gemini', 'antigravity', 'skills', 'zhifangsi')

  const targets = []
  const hasAntigravity =
    Boolean(manifest.runtimes?.antigravity) ||
    fs.existsSync(agyManifestPath) ||
    fs.existsSync(legacySkillDir)

  if (hasAntigravity) {
    targets.push({
      runtime: 'antigravity',
      scope: manifest.runtimes?.antigravity?.scope || 'global',
      args: ['--antigravity'],
      cwd: freshPkgRoot,
    })
  }

  for (const ws of manifest.workspaces || []) {
    if (!ws || !ws.runtime || !ws.cwd) continue
    if (!fs.existsSync(ws.cwd)) {
      log(`      ${yellow}⚠${reset} 跳过不存在的工作区目录 (${ws.runtime}): ${ws.cwd}`)
      continue
    }
    targets.push({
      runtime: ws.runtime,
      scope: 'workspace',
      args: [`--${ws.runtime}`],
      cwd: ws.cwd,
    })
  }

  if (targets.length === 0) {
    log(`      ${cyan}▸${reset} 未检测到已存在的安装凭证，将默认重新注入全局 Antigravity...`)
    targets.push({
      runtime: 'antigravity',
      scope: 'global',
      args: ['--antigravity'],
      cwd: freshPkgRoot,
      isDefaultFallback: true,
    })
  }

  return targets
}

function resolveFreshPackageRoot(mode, pkgRoot, didUpdateCode, runShell, shellOpts) {
  if (mode === 'git' || !didUpdateCode) {
    return pkgRoot
  }

  // NPM 全局升级后，解析全球安装目录中的最新包路径，确保子进程加载新版本安装器
  try {
    const globalRoot = runShell('npm root -g', { ...shellOpts, stdio: 'pipe' })
    if (globalRoot) {
      const candidate = path.join(globalRoot, 'zhifangsi')
      if (fs.existsSync(path.join(candidate, 'scripts', 'install-antigravity.mjs'))) {
        return candidate
      }
    }
  } catch {
    // fallback to current pkgRoot
  }
  return pkgRoot
}

// ─── 主更新入口 ────────────────────────────────────────────

export async function runUpdater(rawArgs = [], options = {}) {
  const log = options.log || ((...m) => console.log(...m))
  const warnLog = options.warn || ((...m) => console.warn(...m))
  const errorLog = options.error || ((...m) => console.error(...m))

  const parsed = parseUpdateArgs(rawArgs)
  if (parsed.help) {
    printHelp(log)
    return { ok: true, exitCode: 0, help: true }
  }

  const pkgRoot = options.packageRoot ? path.resolve(options.packageRoot) : defaultPackageRoot
  const homeDir = resolveHomeDir(options.homeDir)
  const pkg = readPackageJson(pkgRoot)
  const pkgName = pkg.name || 'zhifangsi'
  const localVersion = pkg.version || '1.1.0'
  const repoUrl = options.repoUrl || DEFAULT_REPO_URL

  const env = buildChildEnv({
    proxy: parsed.proxy,
    homeDir: options.homeDir,
    manifestPath: options.manifestPath,
  })

  const runGit = options.runGit || defaultRunGit
  const runShell = options.runShell || defaultRunShell
  const runInstallerProcess = options.runInstallerProcess || defaultRunInstallerProcess
  const fetchNpmVersion = options.fetchNpmVersion || defaultFetchNpmVersion
  const silentSubprocess = Boolean(options.silentSubprocess)
  const inheritStdio = silentSubprocess ? 'pipe' : 'inherit'

  const gitOpts = { cwd: pkgRoot, env, stdio: 'pipe', proxy: parsed.proxy }
  const shellOpts = { cwd: pkgRoot, env, stdio: inheritStdio }

  printBanner(localVersion, log)

  const hasGitDir = fs.existsSync(path.join(pkgRoot, '.git'))
  const mode = parsed.useNpm ? 'npm' : hasGitDir ? 'git' : 'npm'
  const isGit = mode === 'git'

  log(
    `  安装模式检测: ${bold}${
      isGit
        ? 'Git 仓库开发模式'
        : parsed.useGit
          ? 'npm 全局包模式 (GitHub 远端源)'
          : 'npm 全局包模式'
    }${reset}\n`
  )

  let originalCommit = ''
  let originalBranch = ''

  // Git 模式下前置脏检查与回滚锚点记录
  if (isGit) {
    let dirtyStatus = ''
    try {
      dirtyStatus = runGit(['status', '--porcelain', '-uno'], gitOpts)
    } catch {
      dirtyStatus = ''
    }

    if (dirtyStatus) {
      if (parsed.checkOnly) {
        warnLog(
          `  ${yellow}⚠ 警告: 检测到本地核心代码有未提交的修改（--check 仅执行只读检测，正式更新前请先提交或暂存）。${reset}\n`
        )
      } else {
        errorLog(
          `\n  ${red}✗ 错误: 检测到本地核心代码有未提交的修改，为了避免冲突，请清理、暂存或提交修改后再执行更新。${reset}\n`
        )
        return {
          ok: false,
          exitCode: 1,
          mode,
          reason: 'dirty-worktree',
        }
      }
    }

    try {
      originalCommit = runGit(['rev-parse', 'HEAD'], gitOpts)
      originalBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts)
    } catch {
      warnLog(`  ${yellow}⚠ 警告: 无法记录当前 Commit Hash 用于失败回滚。${reset}`)
    }
  }

  // ──────────────────────────────────────────────────────────
  // [1/4] 检测更新中...
  // ──────────────────────────────────────────────────────────
  log(`  ${cyan}[1/4]${reset} ${bold}正在检测可用更新...${reset}`)

  let hasUpdate = false
  let latestInfo = ''
  let checkoutTarget = ''
  let targetVersion = parsed.targetVersion
  let remoteVersion = ''

  try {
    if (isGit) {
      log(`      ${cyan}▸${reset} 执行 git fetch 拉取远程状态与标签...`)
      runGit(['fetch', 'origin'], { ...gitOpts, stdio: 'pipe' })
      try {
        runGit(['fetch', '--tags', 'origin'], { ...gitOpts, stdio: 'pipe' })
      } catch {
        // 某些场景下远程标签拉取可能受限，忽略继续
      }

      const currentCommit = runGit(['rev-parse', 'HEAD'], gitOpts)

      if (targetVersion) {
        const resolved = resolveGitTarget(targetVersion, runGit, gitOpts)
        if (!resolved) {
          errorLog(
            `    ${red}✗${reset} 错误: 找不到目标版本 "${targetVersion}" (本地和远程均不存在该分支、标签或提交)\n`
          )
          return {
            ok: false,
            exitCode: 1,
            mode,
            reason: 'target-not-found',
          }
        }

        const needsBranchSwitch = resolved.isBranch && originalBranch !== resolved.checkoutName
        if (currentCommit === resolved.commit && !needsBranchSwitch) {
          hasUpdate = false
          log(
            `    ${green}✓${reset} 当前已处于目标版本 "${resolved.displayRef}" (${resolved.commit.slice(0, 7)})，无需更新。\n`
          )
        } else {
          hasUpdate = true
          checkoutTarget = resolved.checkoutName
          latestInfo = needsBranchSwitch && currentCommit === resolved.commit
            ? `切换至分支 "${resolved.displayRef}" (当前: ${originalBranch === 'HEAD' ? 'detached HEAD' : originalBranch})`
            : `目标版本: "${resolved.displayRef}" (${resolved.commit.slice(0, 7)}) (当前 Commit: ${currentCommit.slice(0, 7)})`
        }
      } else {
        const latestTag = findLatestStableTag(runGit, gitOpts)
        if (latestTag) {
          const tagResolved = resolveGitTarget(latestTag, runGit, gitOpts)
          if (tagResolved && currentCommit === tagResolved.commit) {
            hasUpdate = false
            log(`    ${green}✓${reset} 当前已处于最新稳定版本 "${latestTag}"，无需更新。\n`)
          } else if (tagResolved && isCommitAncestor(tagResolved.commit, currentCommit, runGit, gitOpts)) {
            // 当前分支领先于最新稳定 Tag：保护开发分支不意外降级，转而检测远程跟踪分支提交
            const behind = detectRemoteBranchBehindCount(originalBranch, runGit, gitOpts)
            if (behind.count > 0) {
              hasUpdate = true
              latestInfo = `当前开发分支 (${behind.branch}) 落后远程 ${behind.count} 个 commit (已领先稳定版标签 "${latestTag}")`
            } else {
              hasUpdate = false
              log(
                `    ${green}✓${reset} 当前处于开发版本 (已领先最新稳定版标签 "${latestTag}")，远程分支无新提交。\n`
              )
            }
          } else if (tagResolved) {
            hasUpdate = true
            checkoutTarget = latestTag
            latestInfo = `发现最新稳定版标签: "${latestTag}" (${tagResolved.commit.slice(0, 7)})`
          }
        } else {
          const behind = detectRemoteBranchBehindCount(originalBranch, runGit, gitOpts)
          if (behind.count > 0) {
            hasUpdate = true
            latestInfo = `落后远程分支 origin/${behind.branch} 共 ${behind.count} 个 commit`
          }
        }
      }
    } else if (parsed.useGit) {
      hasUpdate = true
      const gitRefSuffix = targetVersion ? `#${targetVersion}` : ''
      latestInfo = `GitHub 远端源: ${repoUrl}${gitRefSuffix}`
    } else {
      log(`      ${cyan}▸${reset} 查询 npm 仓库中的最新版本...`)
      const querySpec = targetVersion ? `${pkgName}@${targetVersion}` : pkgName

      let queriedVer = ''
      try {
        queriedVer = runShell(`npm view ${querySpec} version`, { ...shellOpts, stdio: 'pipe' })
      } catch {
        queriedVer = (await fetchNpmVersion(pkgName, targetVersion || 'latest')) || ''
      }

      if (!queriedVer) {
        errorLog(
          `    ${red}✗${reset} 错误: 无法在 npm 仓库中找到${
            targetVersion ? `版本/标签 "${targetVersion}"` : `包 "${pkgName}" 的版本信息`
          }。\n`
        )
        return {
          ok: false,
          exitCode: 1,
          mode,
          reason: targetVersion ? 'target-not-found' : 'registry-unreachable',
        }
      }

      remoteVersion = queriedVer
      if (localVersion !== queriedVer) {
        hasUpdate = true
        latestInfo = targetVersion
          ? `目标版本: v${queriedVer} (当前版本: v${localVersion})`
          : `最新版本: v${queriedVer} (当前版本: v${localVersion})`
      } else if (targetVersion) {
        log(`    ${green}✓${reset} 当前已处于目标版本 v${queriedVer}，无需更新。\n`)
      }
    }

    if (hasUpdate) {
      log(`    ${yellow}▸${reset} 检测到可更新/切换目标: ${latestInfo}\n`)
    } else if (!targetVersion && (!isGit || !findLatestStableTag(runGit, gitOpts))) {
      log(`    ${green}✓${reset} 已经是最新版本 (v${localVersion})，无需更新。\n`)
    }
  } catch (err) {
    errorLog(`    ${red}✗${reset} 检测版本失败: ${err.message}\n`)
    return {
      ok: false,
      exitCode: 1,
      mode,
      reason: 'check-failed',
      error: err.message,
    }
  }

  // 只读预检模式直接结束
  if (parsed.checkOnly) {
    log(
      `  ${cyan}[预检完成]${reset} ${
        hasUpdate
          ? `发现可用更新 (${latestInfo})，请去掉 --check 执行正式升级。`
          : `当前版本 v${localVersion} 已是最新。`
      }\n`
    )
    return {
      ok: true,
      exitCode: 0,
      mode,
      checkOnly: true,
      hasUpdate,
      previousVersion: localVersion,
      newVersion: remoteVersion || localVersion,
      latestInfo,
    }
  }

  // ──────────────────────────────────────────────────────────
  // [2/4] 拉取/安装更新包...
  // ──────────────────────────────────────────────────────────
  log(`  ${cyan}[2/4]${reset} ${bold}正在拉取/安装更新包...${reset}`)
  const packageLockPath = path.join(pkgRoot, 'package-lock.json')
  const oldLockHash = getFileMd5(packageLockPath)
  let didUpdateCode = false

  if (hasUpdate || parsed.force) {
    try {
      if (isGit) {
        if (checkoutTarget) {
          log(`      ${cyan}▸${reset} 正在切换到目标版本 "${checkoutTarget}"...`)
          runGit(['checkout', checkoutTarget], { ...gitOpts, stdio: inheritStdio })

          let currentBranchAfter = 'HEAD'
          try {
            currentBranchAfter = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts)
          } catch {
            currentBranchAfter = 'HEAD'
          }

          if (currentBranchAfter !== 'HEAD') {
            log(
              `      ${cyan}▸${reset} 当前在分支 ${currentBranchAfter} 上，执行 git pull origin ${currentBranchAfter} 拉取最新代码...`
            )
            try {
              runGit(['pull', 'origin', currentBranchAfter], { ...gitOpts, stdio: inheritStdio })
            } catch {
              runGit(['pull'], { ...gitOpts, stdio: inheritStdio })
            }
          }
        } else {
          let branch = originalBranch
          if (!branch || branch === 'HEAD') {
            try {
              branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts)
            } catch {
              branch = 'main'
            }
          }
          log(`      ${cyan}▸${reset} 执行 git pull 拉取最新代码...`)
          if (branch && branch !== 'HEAD') {
            try {
              runGit(['pull', 'origin', branch], { ...gitOpts, stdio: inheritStdio })
            } catch {
              runGit(['pull'], { ...gitOpts, stdio: inheritStdio })
            }
          } else {
            runGit(['pull'], { ...gitOpts, stdio: inheritStdio })
          }
        }
      } else if (parsed.useGit) {
        const gitSpec = targetVersion ? `${repoUrl}#${targetVersion}` : repoUrl
        log(`      ${cyan}▸${reset} 执行 npm install -g ${gitSpec}...`)
        runShell(`npm install -g ${gitSpec}`, shellOpts)
      } else {
        const installSpec = targetVersion ? `${pkgName}@${targetVersion}` : `${pkgName}@latest`
        log(`      ${cyan}▸${reset} 执行 npm install -g ${installSpec}...`)
        runShell(`npm install -g ${installSpec}`, shellOpts)
      }

      didUpdateCode = true
      log(`    ${green}✓${reset} 更新代码成功。\n`)
    } catch (err) {
      errorLog(`    ${red}✗${reset} 更新代码失败: ${err.message}`)
      const rolledBack = isGit
        ? rollbackGit(originalCommit, originalBranch, runGit, gitOpts, log, errorLog, inheritStdio)
        : false
      return {
        ok: false,
        exitCode: 1,
        mode,
        reason: 'pull-failed',
        rolledBack,
        error: err.message,
      }
    }
  } else {
    log(`    ${green}✓${reset} 代码已是最新版本，跳过拉取步骤。\n`)
  }

  // ──────────────────────────────────────────────────────────
  // [3/4] 检查依赖变化与编译产物...
  // ──────────────────────────────────────────────────────────
  log(`  ${cyan}[3/4]${reset} ${bold}正在检查本地依赖变化与编译产物...${reset}`)
  let didInstallDeps = false
  let didBuild = false

  if (isGit) {
    const newLockHash = getFileMd5(packageLockPath)
    const missingNodeModules = !fs.existsSync(path.join(pkgRoot, 'node_modules'))

    if ((oldLockHash !== newLockHash && newLockHash !== '') || missingNodeModules) {
      log(
        `      ${cyan}▸${reset} ${
          missingNodeModules
            ? '未检测到 node_modules，正在执行 npm install...'
            : '检测到 package-lock.json 发生变化，正在执行 npm install...'
        }`
      )
      try {
        runShell('npm install', shellOpts)
        didInstallDeps = true
        log(`    ${green}✓${reset} 依赖更新成功。`)
      } catch (err) {
        errorLog(`    ${red}✗${reset} 依赖更新失败: ${err.message}`)
        const rolledBack = rollbackGit(originalCommit, originalBranch, runGit, gitOpts, log, errorLog, inheritStdio)
        return {
          ok: false,
          exitCode: 1,
          mode,
          reason: 'deps-install-failed',
          rolledBack,
          error: err.message,
        }
      }
    } else {
      log(`    ${green}✓${reset} 依赖未发生变化，跳过 npm install。`)
    }

    const hasTsConfig = fs.existsSync(path.join(pkgRoot, 'tsconfig.json'))
    const missingDist = !fs.existsSync(path.join(pkgRoot, 'dist', 'mcp', 'server.js'))
    if (hasTsConfig && (didUpdateCode || missingDist)) {
      log(`      ${cyan}▸${reset} 正在重新编译 TypeScript 产物 (npm run build)...`)
      try {
        runShell('npm run build', shellOpts)
        didBuild = true
        log(`    ${green}✓${reset} TypeScript 编译完成。\n`)
      } catch (err) {
        errorLog(`    ${red}✗${reset} TypeScript 编译失败: ${err.message}`)
        const rolledBack = rollbackGit(originalCommit, originalBranch, runGit, gitOpts, log, errorLog, inheritStdio)
        return {
          ok: false,
          exitCode: 1,
          mode,
          reason: 'build-failed',
          rolledBack,
          error: err.message,
        }
      }
    } else {
      log(`    ${green}✓${reset} 编译产物无需重建。\n`)
    }
  } else {
    log(`    ${green}✓${reset} npm 全局包已内置依赖与编译产物，跳过本地构建。\n`)
  }

  // ──────────────────────────────────────────────────────────
  // [4/4] 通过新子进程重新注入多宿主技能与 MCP 配置...
  // ──────────────────────────────────────────────────────────
  log(`  ${cyan}[4/4]${reset} ${bold}正在为运行中的 AI 代理重新注入技能与 MCP 配置...${reset}`)

  const freshPkgRoot = resolveFreshPackageRoot(mode, pkgRoot, didUpdateCode, runShell, shellOpts)
  const freshInstallerScript = path.join(freshPkgRoot, 'scripts', 'install-antigravity.mjs')
  const syncedTargets = []
  const failedTargets = []

  if (parsed.noReinstall) {
    log(`    ${yellow}▸${reset} 已指定 --no-reinstall，跳过宿主环境配置重新注入。\n`)
  } else if (!fs.existsSync(freshInstallerScript)) {
    warnLog(`    ${yellow}⚠${reset} 未找到安装脚本 (${freshInstallerScript})，跳过自动重注入。\n`)
  } else {
    const targets = discoverReinstallTargets(homeDir, freshPkgRoot, log)
    for (const target of targets) {
      log(
        `      ${cyan}▸${reset} 同步宿主: ${bold}${target.runtime}${reset} (${
          target.scope === 'workspace' ? target.cwd : 'global'
        })`
      )
      try {
        runInstallerProcess(freshInstallerScript, target.args, {
          cwd: target.cwd,
          env,
          stdio: inheritStdio,
        })
        syncedTargets.push(target)
      } catch (err) {
        failedTargets.push({ ...target, error: err.message })
        errorLog(`      ${red}✗${reset} 重新注入宿主 ${target.runtime} 失败: ${err.message}`)
        log(`        ${yellow}▸ 提示: 请尝试手动运行: zhifangsi install --${target.runtime}${reset}`)
      }
    }
    log(
      `    ${green}✓${reset} 宿主配置同步流程已完成（成功 ${syncedTargets.length} 项${
        failedTargets.length > 0 ? `，失败 ${failedTargets.length} 项` : ''
      }）。\n`
    )
  }

  // ─── 升级成功 Banner 提示 ──────────────────────────────────
  const updatedPkg = readPackageJson(freshPkgRoot)
  const newVersion = updatedPkg.version || remoteVersion || localVersion
  const versionChanged = newVersion !== localVersion

  log(cyan + '  ╔═══════════════════════════════════════╗')
  log(
    `  ║    ${green}✓ 更新完成！${cyan} 兵部职方司已就绪        ║`
  )
  log('  ╚═══════════════════════════════════════╝' + reset)
  log(
    `\n  当前版本: ${green}v${newVersion}${reset}${
      versionChanged ? ` ${dim}(由 v${localVersion} 升级)${reset}` : ''
    }`
  )
  log(
    `  ${yellow}▸ 提示: 请重启您的 AI Agent（如 Antigravity / Cursor / Claude / VS Code）以加载最新 MCP 工具与 Skills。${reset}\n`
  )

  return {
    ok: true,
    exitCode: 0,
    mode,
    hasUpdate,
    didUpdateCode,
    didInstallDeps,
    didBuild,
    previousVersion: localVersion,
    newVersion,
    freshPkgRoot,
    syncedTargets,
    failedTargets,
  }
}

// ─── 直接作为 CLI 脚本执行 ─────────────────────────────────
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase()

if (isMain) {
  runUpdater(process.argv.slice(2))
    .then((res) => {
      if (res && res.exitCode) {
        process.exit(res.exitCode)
      }
    })
    .catch((err) => {
      console.error(`\x1b[31m[职方司更新错误]\x1b[0m`, err)
      process.exit(1)
    })
}
