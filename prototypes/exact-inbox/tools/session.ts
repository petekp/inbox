import { cp, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { appHome, coreRequest, currentTerminal } from '../bridge/core'
import { agentEnvironment } from './agent-env'
import { repoRoot, runtimeRoot } from './paths'

const operation = process.argv[2] ?? 'status'
const plugin = resolve(runtimeRoot, 'plugin')
const config = resolve(runtimeRoot, 'claude-config')
const working = resolve(runtimeRoot, 'session')

async function writeInitialConfig(path: string, value: object) {
  try {
    await writeFile(path, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

async function start() {
  const existing = await currentTerminal()
  if (existing) {
    console.log(JSON.stringify({ terminal: existing.address, state: 'already running' }))
    return
  }
  for (const folder of [plugin, config, working, resolve(appHome, 'inbox')])
    await mkdir(folder, { recursive: true, mode: 0o700 })
  await mkdir(resolve(plugin, '.claude-plugin'), { recursive: true })
  await cp(resolve(repoRoot, '.claude-plugin/plugin.json'), resolve(plugin, '.claude-plugin/plugin.json'))
  for (const part of ['hooks', 'types']) await cp(resolve(repoRoot, part), resolve(plugin, part), { recursive: true })
  await writeInitialConfig(resolve(appHome, 'inbox/herdr-mod.json'), { format: 1, answer: 'no', at: Date.now() })
  await writeInitialConfig(resolve(config, 'settings.json'), {
    permissions: { allow: ['mcp__inbox__record', 'mcp__inbox__close'] },
  })
  await writeInitialConfig(resolve(config, '.claude.json'), { hasCompletedOnboarding: true })
  const env = agentEnvironment()
  const auth = Bun.spawn(['claude', 'auth', 'status'], { env, cwd: working, stdout: 'pipe', stderr: 'pipe' })
  const authText = await new Response(auth.stdout).text()
  if ((await auth.exited) !== 0 || !(JSON.parse(authText) as { loggedIn?: boolean }).loggedIn)
    throw new Error('The isolated agent is not signed in. Its config is kept separate from your normal Inbox.')
  const args = [
    'hc',
    'run',
    '--bg',
    '--no-parent',
    '--no-notify',
    '--name',
    'inbox-exact-agent',
    '--label',
    'inbox.prototype=exact',
    '--label',
    'inbox.title=Release note demo',
    '--cwd',
    working,
    '--',
    'env',
    `INBOX_RUNTIME_ROOT=${runtimeRoot}`,
    process.execPath,
    resolve(import.meta.dir, 'agent.ts'),
  ]
  const run = Bun.spawn(args, { env, cwd: working, stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ])
  if (code !== 0) throw new Error(err.trim() || out.trim() || 'The prototype agent did not start.')
  await writeFile(resolve(runtimeRoot, 'agent-launch.json'), out, { mode: 0o600 })
  console.log(out.trim())
}

if (operation === 'start') await start()
else if (operation === 'status') {
  const terminal = await currentTerminal()
  console.log(
    JSON.stringify(
      terminal
        ? {
            terminal: terminal.address,
            state: terminal.state,
            session: terminal.labels['inbox.session'] ?? null,
          }
        : { state: 'not running' },
    ),
  )
} else if (operation === 'stop') {
  const terminal = await currentTerminal()
  if (terminal) {
    await coreRequest('terminal.kill', { terminal: terminal.address })
    console.log('Stopped the prototype agent.')
  }
} else throw new Error('Use start, status or stop.')
