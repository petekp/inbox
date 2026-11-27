import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fixtureSession } from './fixture-state'
import { previewPageText } from '../../core/domain/option-previews'
import { publishSession, pressDrainer, startHerdrFile } from '../../core/remote/herdr-app'
import { REMOTE_ACTIONS } from '../../core/remote/remote-commands'
import { followCommandRows, movedLegacyCommands } from '../../core/runtime/command-store'
import { commandsOf, remoteReceipts } from '../../core/runtime/remote-command-state'
import { memoryViewerStores, remoteViewerReceipts } from '../../core/runtime/remote-viewers'
import { pruned } from '../../core/runtime/session-presses'
import { wakeAfterSettle } from '../../core/runtime/host-press'
import { SETTLED_MS } from '../../core/view/timing'
import { memoryCommandStore } from '../../tests/memory-command-store'
import { fakeHostWith } from '../../tests/session-script'

const repo = resolve(import.meta.dir, '../..')
const root = resolve(process.env.INBOX_FIXTURE_ROOT ?? join(repo, '.scratch/exact-parity'))
const appHome = join(root, 'app-home')
const bin = join(root, 'bin')
const session = '11111111-1111-4111-8111-111111111111'
const port = Number(process.env.INBOX_PORT ?? 8880)
const agentHost = process.env.INBOX_FIXTURE_AGENT ?? 'claude-code'
if (!['claude-code', 'codex', 'omp'].includes(agentHost)) throw new Error('Unknown fixture agent.')
const agent = agentHost === 'codex' ? 'Codex' : agentHost === 'omp' ? 'omp' : 'Claude'
const terminal = {
  address: 't1',
  created_ms: 1_700_000_000_000,
  name: 'sample-agent',
  title: 'Release planning',
  state: 'live',
  foreground: { argv: [agentHost === 'claude-code' ? 'claude' : agentHost] },
  status: { app: agentHost, state: 'done' },
  labels: { 'inbox.session': session, 'inbox.title': 'Release planning' },
}
await mkdir(bin, { recursive: true })
await mkdir(join(appHome, 'inbox/sessions'), { recursive: true })
await writeFile(
  join(bin, 'hc'),
  `#!${process.execPath}\nconst terminal=${JSON.stringify(terminal)};\nfor await(const line of console){if(!line.trim())continue;const r=JSON.parse(line);const result=r.method==='terminal.list'?{terminals:[terminal]}:r.method==='machine.list'?{machines:[]}:terminal;console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));}\n`,
)
await chmod(join(bin, 'hc'), 0o700)
await writeFile(
  join(root, 'session-connection.json'),
  JSON.stringify({ session, terminal: 't1', socket: join(root, 'fixture.sock'), appHome }),
)
await writeFile(
  join(root, 'private-connection.json'),
  JSON.stringify({ origin: `http://127.0.0.1:${port}`, port, user: '' }),
)
process.env.PATH = `${bin}:${process.env.PATH}`
process.env.INBOX_RUNTIME_ROOT = root
process.env.INBOX_EXPERIMENTAL_PROTOCOL ??= '2'
process.env.INBOX_DIST ??= join(repo, '.derived-data/inbox-exact-parity')

let state = fixtureSession(Date.now())
await writeFile(join(root, 'sample-note.txt'), 'A private fixture note.')
await writeFile(
  join(root, 'sample-comparison.html'),
  '<script>UNTRUSTED_FIXTURE_SCRIPT()</script><plaintext id="compare-data" hidden>' +
    JSON.stringify({
      pick: 'North',
      choices: [
        { name: 'North', summary: 'Default' },
        { name: 'South', summary: 'Alternative' },
      ],
    }),
)
const artifactTask = state.ledger.items.find(item => item.id === 'i17')!
artifactTask.turn = state.ledger.turn
artifactTask.helps = [
  { kind: 'open', path: join(root, 'sample-note.txt') },
  { kind: 'open', path: join(root, 'sample-comparison.html') },
]
const previewQuestion = state.ledger.items.find(item => item.previewPage)
if (previewQuestion) {
  const compareTemplate = await readFile(join(repo, 'hooks/compare-page.html'), 'utf8')
  const previewPath = join(root, 'sample-previews.html')
  await writeFile(previewPath, previewPageText(compareTemplate, previewQuestion))
  previewQuestion.previewPage = previewPath
}
let writes = Promise.resolve()
const commands = memoryCommandStore()
const viewers = memoryViewerStores()
const built = fakeHostWith({
  read: async () => state,
  update: change => {
    const next = writes.then(async () => {
      state = await movedLegacyCommands(
        commands,
        pruned(await change(state), Date.now(), viewers.peek(session)),
        () => undefined,
      )
      await followCommandRows(commands, session, state, () => undefined)
      const log = await commands.read()
      await writeFile(join(root, 'state.json'), JSON.stringify({ ...state, remoteCommands: log.commands }))
      return state
    })
    writes = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  },
  exclusive: async run => ({ acquired: true, value: await run() }),
})(async () => null)
built.host.now = () => Date.now()
built.host.settleWindowMs = SETTLED_MS
built.host.commands = commands
built.host.readDurable = async () => JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
built.host.deliver = async (_s, text) => {
  built.delivered.push(text)
  return { state: 'accepted', queuedId: null, isInTurn: true }
}
const files = {
  write: async (path: string, text: string) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  move: rename,
  remove: async (path: string) => {
    await rm(path, { force: true })
  },
  removeFolder: async (path: string) => {
    await rm(path, { force: true, recursive: true })
  },
}
async function publish() {
  const log = await commandsOf(commands, state)
  await publishSession(
    files,
    appHome,
    {
      host: agentHost as 'claude-code' | 'codex' | 'omp',
      agent,
      sessionId: session,
      terminal: 't1',
      writtenAt: Date.now(),
      remoteProtocol: 2,
      remoteActions: REMOTE_ACTIONS,
      remoteHistoryAfter: log.floor,
      receipts: remoteReceipts(log),
      viewers: remoteViewerReceipts(viewers.peek(session)),
    },
    state,
    () => {},
  )
}
built.host.supportsResume = agentHost !== 'codex'
await built.host.update(s => s)
await publish()
const fileHost = { ...built.host, viewers: viewers.of(session, () => void publish()) }
const drain = pressDrainer(
  { ...files, list: readdir, read: (path: string) => readFile(path, 'utf8') },
  async () => true,
  async (_id, file) => {
    const started = await startHerdrFile(fileHost, file, session)
    if (started.waiting) void started.waiting().then(() => void publish())
    await publish()
    return true
  },
  () => {},
)
let polling = false
const timer = setInterval(async () => {
  if (polling) return
  polling = true
  try {
    await drain(appHome, session)
    await wakeAfterSettle(built.host)
    await publish()
  } catch (error) {
    console.error(error)
  } finally {
    polling = false
  }
}, 250)
process.once('exit', () => clearInterval(timer))
await import('../bridge/server')
