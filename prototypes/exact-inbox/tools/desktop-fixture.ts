import { mkdir, writeFile, appendFile, realpath, readFile, stat } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { fixtureSession } from './fixture-state'
import { makeServer } from '../../../codex/src/server'
import { updateState, statePath } from '../../../codex/src/state'
import { startCompanion } from '../../../codex/src/companion-listener'

const root = process.env.INBOX_DESKTOP_FIXTURE_ROOT
if (!root || !isAbsolute(root)) throw new Error('Set an isolated desktop fixture folder.')
const dir = join(root, 'profile')
const runtime = join(root, 'helper')
await mkdir(dir, { recursive: true, mode: 0o700 })
await mkdir(runtime, { recursive: true, mode: 0o700 })
const session = 'fixture-desktop'
if (!(await stat(statePath(dir, session)).catch(() => null))) {
  await updateState(
    dir,
    session,
    state => ({ ...state, ...fixtureSession(Date.now()), root, home: root, sessionId: session }),
    Date.now,
  )
}

await writeFile(
  join(dir, 'companion.json'),
  JSON.stringify({ enabled: true, sessions: [{ id: session, name: 'Desktop fixture' }] }),
  { mode: 0o600 },
)
;(globalThis as unknown as { VERSION: string }).VERSION = 'fixture'
const host = makeServer({
  dir,
  now: Date.now,
  tabHtml: '',
  comparePage: join(root, 'compare.html'),
  fallbackCli: async () => 'fixture-codex',
  exec: async args => {
    await appendFile(join(root, 'effects.jsonl'), JSON.stringify(args) + '\n')
    return args[1] === 'queue'
      ? { code: 0, stdout: 'Queued message fixture', stderr: '' }
      : { code: 1, stdout: '', stderr: 'Fixture has no GitHub connection.' }
  },
})
const stop = await startCompanion(
  dir,
  async () => host.companion,
  message => console.error(message),
)
const profile = createHash('sha256')
  .update(await realpath(dir))
  .digest('hex')
const settingsPath = join(runtime, 'desktop-hosts.json')
const previous: unknown = JSON.parse(
  await readFile(settingsPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '[]'
    throw error
  }),
)
if (!Array.isArray(previous)) throw new Error('Invalid fixture connections.')
await writeFile(
  settingsPath,
  JSON.stringify([
    ...previous.filter(entry => entry.profile !== profile),
    { socket: join(dir, 'companion/bridge.sock'), profile, name: 'Fixture Mac' },
  ]),
  { mode: 0o600 },
)

const port = Number(process.env.INBOX_PORT ?? 8880)
await writeFile(
  join(runtime, 'private-connection.json'),
  JSON.stringify({ origin: `http://127.0.0.1:${port}`, port, user: '' }),
)
process.env.INBOX_RUNTIME_ROOT = runtime
process.env.INBOX_EXPERIMENTAL_PROTOCOL = '2'
process.once('SIGTERM', () => {
  void stop()
    .then(() => host.settled())
    .then(() => process.exit(0))
})
await import('../bridge/server')
