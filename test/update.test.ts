import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
// @ts-expect-error ESM script without declaration file
import { runInstaller, loadInstallManifest, getAntigravityManifestPath } from '../scripts/install-antigravity.mjs'
// @ts-expect-error ESM script without declaration file
import { runUpdater, parseUpdateArgs } from '../scripts/zhifangsi-update.mjs'

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function initMockGitFixture(rootDir: string) {
  const remoteDir = path.join(rootDir, 'remote.git')
  const seedDir = path.join(rootDir, 'seed')
  const cloneDir = path.join(rootDir, 'clone')

  fs.mkdirSync(remoteDir, { recursive: true })
  git(['init', '--bare', '-b', 'main', remoteDir], rootDir)

  fs.mkdirSync(path.join(seedDir, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(seedDir, 'dist', 'mcp'), { recursive: true })
  fs.mkdirSync(path.join(seedDir, 'node_modules'), { recursive: true })

  git(['init', '-b', 'main'], seedDir)
  git(['config', 'user.name', 'Test Bot'], seedDir)
  git(['config', 'user.email', 'test@example.com'], seedDir)

  fs.writeFileSync(path.join(seedDir, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8')
  fs.writeFileSync(
    path.join(seedDir, 'package.json'),
    JSON.stringify({ name: 'zhifangsi', version: '1.0.0' }, null, 2) + '\n',
    'utf-8'
  )
  fs.writeFileSync(
    path.join(seedDir, 'package-lock.json'),
    JSON.stringify({ name: 'zhifangsi', version: '1.0.0', lockfileVersion: 3 }, null, 2) + '\n',
    'utf-8'
  )
  fs.writeFileSync(path.join(seedDir, 'tsconfig.json'), '{}\n', 'utf-8')
  fs.writeFileSync(path.join(seedDir, 'dist', 'mcp', 'server.js'), '// v1.0.0\n', 'utf-8')
  fs.writeFileSync(
    path.join(seedDir, 'scripts', 'install-antigravity.mjs'),
    `console.log('installed-v1.0.0')\n`,
    'utf-8'
  )
  fs.writeFileSync(path.join(seedDir, 'app.txt'), 'v1.0.0\n', 'utf-8')

  git(['add', '.'], seedDir)
  git(['commit', '-m', 'release v1.0.0'], seedDir)
  git(['tag', '-a', 'v1.0.0', '-m', 'v1.0.0'], seedDir)
  git(['remote', 'add', 'origin', remoteDir], seedDir)
  git(['push', '-u', 'origin', 'main'], seedDir)
  git(['push', 'origin', '--tags'], seedDir)

  git(['clone', remoteDir, cloneDir], rootDir)
  git(['config', 'user.name', 'Test Bot'], cloneDir)
  git(['config', 'user.email', 'test@example.com'], cloneDir)
  fs.mkdirSync(path.join(cloneDir, 'node_modules'), { recursive: true })
  fs.mkdirSync(path.join(cloneDir, 'dist', 'mcp'), { recursive: true })
  fs.writeFileSync(path.join(cloneDir, 'dist', 'mcp', 'server.js'), '// v1.0.0\n', 'utf-8')

  return { remoteDir, seedDir, cloneDir }
}

function pushRemoteRelease(
  seedDir: string,
  version: string,
  opts: { tag?: boolean; changeLock?: boolean; fileContent?: string } = {}
) {
  fs.writeFileSync(
    path.join(seedDir, 'package.json'),
    JSON.stringify({ name: 'zhifangsi', version }, null, 2) + '\n',
    'utf-8'
  )
  if (opts.changeLock) {
    fs.writeFileSync(
      path.join(seedDir, 'package-lock.json'),
      JSON.stringify({ name: 'zhifangsi', version, lockfileVersion: 3, changed: true }, null, 2) + '\n',
      'utf-8'
    )
  }
  fs.writeFileSync(
    path.join(seedDir, 'scripts', 'install-antigravity.mjs'),
    `console.log('installed-v${version}')\n`,
    'utf-8'
  )
  fs.writeFileSync(path.join(seedDir, 'app.txt'), opts.fileContent || `v${version}\n`, 'utf-8')

  git(['add', '.'], seedDir)
  git(['commit', '-m', `release v${version}`], seedDir)
  if (opts.tag !== false) {
    git(['tag', '-a', `v${version}`, '-m', `v${version}`], seedDir)
  }
  git(['push', 'origin', 'main'], seedDir)
  if (opts.tag !== false) {
    git(['push', 'origin', '--tags'], seedDir)
  }
}

describe('zhifangsi update & multi-host install manifest', () => {
  let tmpRoot: string
  let fakeHome: string
  const noop = () => {}

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zhifangsi-update-test-'))
    fakeHome = path.join(tmpRoot, 'home')
    fs.mkdirSync(fakeHome, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('parses update CLI arguments accurately', () => {
    expect(parseUpdateArgs(['v1.2.0', '--check', '--force', '--proxy=http://127.0.0.1:10808'])).toEqual({
      targetVersion: 'v1.2.0',
      checkOnly: true,
      force: true,
      useGit: false,
      useNpm: false,
      noReinstall: false,
      proxy: 'http://127.0.0.1:10808',
      help: false,
    })

    expect(parseUpdateArgs(['--git', '--no-reinstall', '--proxy', 'http://127.0.0.1:7890', 'main'])).toEqual({
      targetVersion: 'main',
      checkOnly: false,
      force: false,
      useGit: true,
      useNpm: false,
      noReinstall: true,
      proxy: 'http://127.0.0.1:7890',
      help: false,
    })
  })

  it('installs and uninstalls multi-host configs with persistent install-manifest.json', () => {
    const repoRoot = path.resolve('.')
    const wsA = path.join(tmpRoot, 'ws-a')
    const wsB = path.join(tmpRoot, 'ws-b')
    fs.mkdirSync(wsA, { recursive: true })
    fs.mkdirSync(wsB, { recursive: true })

    // 1. 安装 Antigravity 全局
    const agyRes = runInstaller(['--antigravity'], {
      homeDir: fakeHome,
      projectRoot: repoRoot,
      cwd: repoRoot,
      skipBuild: true,
    })
    expect(agyRes.installedRuntimes).toContain('antigravity')
    expect(fs.existsSync(getAntigravityManifestPath(fakeHome))).toBe(true)
    expect(fs.existsSync(path.join(fakeHome, '.gemini', 'antigravity', 'skills', 'zhifangsi-update', 'SKILL.md'))).toBe(
      true
    )

    // 2. 安装项目级 VS Code 与 Cursor
    runInstaller(['--vscode'], { homeDir: fakeHome, projectRoot: repoRoot, cwd: wsA, skipBuild: true })
    runInstaller(['--cursor'], { homeDir: fakeHome, projectRoot: repoRoot, cwd: wsB, skipBuild: true })

    const manifest = loadInstallManifest(fakeHome)
    expect(manifest.runtimes.antigravity?.runtime).toBe('antigravity')
    expect(manifest.runtimes.antigravity?.skills).toContain('zhifangsi-update')
    expect(manifest.workspaces.map((w: { runtime: string }) => w.runtime).sort()).toEqual(['cursor', 'vscode'])
    expect(fs.existsSync(path.join(wsA, '.vscode', 'mcp.json'))).toBe(true)
    expect(fs.existsSync(path.join(wsB, '.cursor', 'mcp.json'))).toBe(true)

    // 3. 单独卸载项目级 VS Code，不影响 Antigravity 与 Cursor
    runInstaller(['--uninstall', '--vscode'], {
      homeDir: fakeHome,
      projectRoot: repoRoot,
      cwd: wsA,
      skipBuild: true,
    })
    const afterWsUninstall = loadInstallManifest(fakeHome)
    expect(afterWsUninstall.runtimes.antigravity).toBeDefined()
    expect(afterWsUninstall.workspaces.map((w: { runtime: string }) => w.runtime)).toEqual(['cursor'])
    const vscodeJson = JSON.parse(fs.readFileSync(path.join(wsA, '.vscode', 'mcp.json'), 'utf-8'))
    expect(vscodeJson.servers.zhifangsi).toBeUndefined()

    // 4. 卸载 Antigravity，清理技能、MCP 与清单
    runInstaller(['--uninstall'], { homeDir: fakeHome, projectRoot: repoRoot, cwd: repoRoot, skipBuild: true })
    expect(fs.existsSync(getAntigravityManifestPath(fakeHome))).toBe(false)
    expect(fs.existsSync(path.join(fakeHome, '.gemini', 'antigravity', 'skills', 'zhifangsi-update'))).toBe(false)
    const afterAgyUninstall = loadInstallManifest(fakeHome)
    expect(afterAgyUninstall.runtimes.antigravity).toBeUndefined()
  })

  it('blocks Git update when tracked files are dirty, while --check still runs read-only', async () => {
    const { seedDir, cloneDir } = initMockGitFixture(tmpRoot)
    pushRemoteRelease(seedDir, '1.1.0', { tag: true })

    // 制造本地未提交改动
    fs.writeFileSync(path.join(cloneDir, 'app.txt'), 'local-dirty-edit\n', 'utf-8')

    // 正式更新应被拦截
    const blocked = await runUpdater([], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe('dirty-worktree')
    expect(fs.readFileSync(path.join(cloneDir, 'app.txt'), 'utf-8')).toBe('local-dirty-edit\n')

    // --check 只读检测仍应成功发现更新，不修改文件
    const checked = await runUpdater(['--check'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
    })
    expect(checked.ok).toBe(true)
    expect(checked.checkOnly).toBe(true)
    expect(checked.hasUpdate).toBe(true)
    expect(fs.readFileSync(path.join(cloneDir, 'app.txt'), 'utf-8').trim()).toBe('local-dirty-edit')
  }, 20000)

  it('upgrades Git clone to latest stable tag, installs changed deps, builds TS, and re-injects all manifest hosts via fresh subprocess', async () => {
    const { seedDir, cloneDir } = initMockGitFixture(tmpRoot)
    pushRemoteRelease(seedDir, '1.1.0', { tag: true, changeLock: true })

    // 预先写入多宿主安装清单（含 Antigravity + 有效工作区 + 已删除工作区）
    const activeWs = path.join(tmpRoot, 'active-project')
    const missingWs = path.join(tmpRoot, 'deleted-project')
    fs.mkdirSync(activeWs, { recursive: true })
    const manifestPath = path.join(fakeHome, '.zhifangsi', 'install-manifest.json')
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          version: '1.0.0',
          updatedAt: new Date().toISOString(),
          source: cloneDir,
          runtimes: {
            antigravity: { runtime: 'antigravity', scope: 'global', version: '1.0.0' },
          },
          workspaces: [
            { runtime: 'vscode', cwd: activeWs, version: '1.0.0' },
            { runtime: 'cursor', cwd: missingWs, version: '1.0.0' },
          ],
        },
        null,
        2
      ),
      'utf-8'
    )

    const shellCalls: string[] = []
    const installerCalls: Array<{ script: string; args: string[]; cwd: string; scriptContent: string }> = []

    const res = await runUpdater([], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: (cmd: string) => {
        shellCalls.push(cmd)
        return ''
      },
      runInstallerProcess: (scriptPath: string, args: string[], opts: { cwd: string }) => {
        installerCalls.push({
          script: scriptPath,
          args,
          cwd: opts.cwd,
          scriptContent: fs.readFileSync(scriptPath, 'utf-8').trim(),
        })
      },
    })

    expect(res.ok).toBe(true)
    expect(res.mode).toBe('git')
    expect(res.didUpdateCode).toBe(true)
    expect(res.didInstallDeps).toBe(true)
    expect(res.didBuild).toBe(true)
    expect(res.previousVersion).toBe('1.0.0')
    expect(res.newVersion).toBe('1.1.0')
    expect(shellCalls).toEqual(['npm install', 'npm run build'])

    // 验证新子进程读取的是已更新的 v1.1.0 安装脚本，并同步了 Antigravity + 有效 VS Code 工作区（跳过了不存在的 Cursor 目录）
    expect(installerCalls).toHaveLength(2)
    expect(installerCalls[0].args).toEqual(['--antigravity'])
    expect(installerCalls[0].scriptContent).toContain('installed-v1.1.0')
    expect(installerCalls[1].args).toEqual(['--vscode'])
    expect(installerCalls[1].cwd).toBe(activeWs)
  }, 20000)

  it('protects dev branch ahead of latest stable tag from accidental downgrade and pulls branch updates instead', async () => {
    const { seedDir, cloneDir } = initMockGitFixture(tmpRoot)

    // clone 本地已有领先于 v1.0.0 的提交（如处于开发中），且远端 main 也有新提交（未打新 tag）
    pushRemoteRelease(seedDir, '1.1.0-dev.1', { tag: false, fileContent: 'dev-commit-1\n' })
    git(['pull', 'origin', 'main'], cloneDir)

    // 先验证当前已同步时不会降级到 v1.0.0
    const upToDate = await runUpdater(['--no-reinstall'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: () => '',
    })
    expect(upToDate.ok).toBe(true)
    expect(upToDate.hasUpdate).toBe(false)
    expect(upToDate.didUpdateCode).toBe(false)
    expect(fs.readFileSync(path.join(cloneDir, 'app.txt'), 'utf-8').trim()).toBe('dev-commit-1')

    // 远端 main 推送新 commit，再次更新应顺着 main 拉取而非退回 v1.0.0
    pushRemoteRelease(seedDir, '1.1.0-dev.2', { tag: false, fileContent: 'dev-commit-2\n' })
    const pulled = await runUpdater(['--no-reinstall'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: () => '',
    })
    expect(pulled.ok).toBe(true)
    expect(pulled.hasUpdate).toBe(true)
    expect(pulled.didUpdateCode).toBe(true)
    expect(fs.readFileSync(path.join(cloneDir, 'app.txt'), 'utf-8').trim()).toBe('dev-commit-2')
  }, 20000)

  it('supports switching to explicit version/tag (auto-prefixing v) and back to branch, and rolls back automatically on build failure', async () => {
    const { seedDir, cloneDir } = initMockGitFixture(tmpRoot)
    pushRemoteRelease(seedDir, '1.1.0', { tag: true })
    const commit100 = git(['rev-parse', 'HEAD'], cloneDir)

    // 1. 模拟升级到 v1.1.0 时构建失败 -> 应自动回滚到 main + v1.0.0 commit
    const failed = await runUpdater(['1.1.0', '--no-reinstall'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: (cmd: string) => {
        if (cmd === 'npm run build') throw new Error('tsc failed')
        return ''
      },
    })
    expect(failed.ok).toBe(false)
    expect(failed.reason).toBe('build-failed')
    expect(failed.rolledBack).toBe(true)
    expect(git(['rev-parse', 'HEAD'], cloneDir)).toBe(commit100)
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], cloneDir)).toBe('main')

    // 2. 构建正常时，显式传入 1.1.0（自动匹配 v1.1.0）应成功切换
    const switched = await runUpdater(['1.1.0', '--no-reinstall'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: () => '',
    })
    expect(switched.ok).toBe(true)
    expect(switched.newVersion).toBe('1.1.0')

    // 3. 切回 main 分支
    const backToMain = await runUpdater(['main', '--no-reinstall'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: () => '',
    })
    expect(backToMain.ok).toBe(true)
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], cloneDir)).toBe('main')

    // 4. 不存在的目标应报错
    const missing = await runUpdater(['v9.9.9'], {
      packageRoot: cloneDir,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
    })
    expect(missing.ok).toBe(false)
    expect(missing.reason).toBe('target-not-found')
  }, 20000)

  it('supports NPM global mode: version check, targeted install, --git fallback, and fresh global installer resolution', async () => {
    // 构造无 .git 的模拟 NPM 包目录，以及模拟升级后的全局 node_modules 目录
    const localPkg = path.join(tmpRoot, 'npm-local')
    const globalRoot = path.join(tmpRoot, 'global-node-modules')
    const freshGlobalPkg = path.join(globalRoot, 'zhifangsi')

    fs.mkdirSync(path.join(localPkg, 'scripts'), { recursive: true })
    fs.writeFileSync(
      path.join(localPkg, 'package.json'),
      JSON.stringify({ name: 'zhifangsi', version: '1.1.0' }, null, 2),
      'utf-8'
    )
    fs.writeFileSync(path.join(localPkg, 'scripts', 'install-antigravity.mjs'), '// old\n', 'utf-8')

    fs.mkdirSync(path.join(freshGlobalPkg, 'scripts'), { recursive: true })
    fs.writeFileSync(
      path.join(freshGlobalPkg, 'package.json'),
      JSON.stringify({ name: 'zhifangsi', version: '1.2.0' }, null, 2),
      'utf-8'
    )
    fs.writeFileSync(path.join(freshGlobalPkg, 'scripts', 'install-antigravity.mjs'), '// fresh-1.2.0\n', 'utf-8')

    const shellCalls: string[] = []
    const installerScripts: string[] = []

    const res = await runUpdater([], {
      packageRoot: localPkg,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: (cmd: string) => {
        shellCalls.push(cmd)
        if (cmd === 'npm view zhifangsi version') return '1.2.0'
        if (cmd === 'npm root -g') return globalRoot
        return ''
      },
      runInstallerProcess: (scriptPath: string) => {
        installerScripts.push(scriptPath)
      },
    })

    expect(res.ok).toBe(true)
    expect(res.mode).toBe('npm')
    expect(res.didUpdateCode).toBe(true)
    expect(res.previousVersion).toBe('1.1.0')
    expect(res.newVersion).toBe('1.2.0')
    expect(shellCalls).toContain('npm install -g zhifangsi@latest')
    // 验证调用的是新全局包下的安装脚本，而不是旧目录脚本
    expect(installerScripts).toEqual([path.join(freshGlobalPkg, 'scripts', 'install-antigravity.mjs')])

    // 测试指定版本号 & --git 远端源
    const targetedCalls: string[] = []
    const targeted = await runUpdater(['1.3.0', '--no-reinstall'], {
      packageRoot: localPkg,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: (cmd: string) => {
        targetedCalls.push(cmd)
        if (cmd === 'npm view zhifangsi@1.3.0 version') return '1.3.0'
        return ''
      },
    })
    expect(targeted.ok).toBe(true)
    expect(targetedCalls).toContain('npm install -g zhifangsi@1.3.0')

    const gitRemoteCalls: string[] = []
    const fromGit = await runUpdater(['--git', 'main', '--no-reinstall'], {
      packageRoot: localPkg,
      homeDir: fakeHome,
      log: noop,
      warn: noop,
      error: noop,
      silentSubprocess: true,
      runShell: (cmd: string) => {
        gitRemoteCalls.push(cmd)
        return ''
      },
    })
    expect(fromGit.ok).toBe(true)
    expect(gitRemoteCalls).toContain('npm install -g git+https://github.com/TwotwoPiggy/zhifangsi.git#main')
  })
})
