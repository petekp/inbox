import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import type { Exchange } from '../../hooks/ledger'
import { parseOverview } from '../../hooks/overview'
import { appliedOverview, noteActivity } from '../../hooks/session'
import { endTurn, notePrompt, viewOf } from '../src/core'
import { readState, statePath, updateState, withLock } from '../src/state'
import { codexAsk, recordModelFailure, runUpdates as runBothCalls } from '../src/update'
import { findCli } from '../src/cli'
import { run } from '../src/run'
import { makeServer } from '../src/server'
import { OVERVIEW_SYSTEM } from '../../hooks/model-text'
import { fakeRunner, ledgerOnly, tempDir } from './helpers'

const runUpdates = (dir: string, id: string, ask: (prompt: string) => Promise<string | null>, now: () => number) =>
  runBothCalls(dir, id, ledgerOnly(ask), now)

if (process.env.INBOX_STATUS_WORKER_DIR) {
  setInterval(() => undefined, 1_000)
  await runUpdates(
    process.env.INBOX_STATUS_WORKER_DIR,
    's1',
    async () => {
      process.send?.('asking')
      return new Promise(() => {})
    },
    Date.now,
  )
}

const ex = (turn: number, reply: string): Exchange => ({
  person: 'go',
  trigger: null,
  activity: [],
  reply,
  turn,
  press: null,
  screen: 'The Inbox tab is closed.',
  tasks: [],
})

test('a killed update worker leaves pending exchanges recoverable', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  await updateState(dir, 's1', s => ({
    ...s,
    pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }],
  }))
  const lock = `${statePath(dir, 's1')}.updating`
  const owner = `${lock}.owner-999999-${randomUUID()}`
  await mkdir(owner)
  await symlink(join(owner, 'held'), lock)

  let calls = 0
  await runUpdates(
    dir,
    's1',
    async () => {
      calls += 1
      return 'NEW: decide | - | Deploy now? | Yes / No | Yes'
    },
    () => 5,
  )

  assert.equal(calls, 1)
  assert.deepEqual((await readState(dir, 's1')).pending, [])
})

const LEDGER_ANSWER = 'NEW: decide | - | Deploy now? | Yes / No | Yes'

async function updateWithOverview(overview: string | null) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    pending: [{ ex: ex(1, 'Built the deploy script. Should I deploy?'), turnsStarted: 1 }],
  }))
  const systems: string[] = []
  await runBothCalls(
    dir,
    's1',
    async (_prompt, system) => {
      systems.push(system)

      return system === OVERVIEW_SYSTEM ? overview : LEDGER_ANSWER
    },
    () => 5,
  )

  return { state: await readState(dir, 's1'), systems }
}

test('a reply’s Overview comes from the separate Overview call, after the ledger update', async () => {
  const { state, systems } = await updateWithOverview('GOAL: Building the deploy script')

  assert.equal(state.ledger.overview?.goal, 'Building the deploy script')
  assert.deepEqual(
    state.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.equal(systems.length, 2)
  assert.ok(systems.includes(OVERVIEW_SYSTEM))
})

test('a failed Overview call leaves the ledger update applied with no Overview', async () => {
  const { state } = await updateWithOverview(null)

  assert.equal(state.ledger.overview, null)
  assert.deepEqual(
    state.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.deepEqual(state.pending, [])
})

test('a ledger update shows before its Overview call returns', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i2',
          kind: 'question',
          label: '1',
          ask: 'Which license should the CLI use?',
          options: ['MIT', 'Apache-2.0'],
          rec: 'MIT',
          helps: [],
          turn: 1,
          at: 1,
          from: 'update',
        },
      ],
    },
    pending: [{ ex: { ...ex(2, 'Added the MIT license.'), person: 'MIT' }, turnsStarted: 2 }],
  }))
  let overviewPrompt = ''
  let release: (text: string) => void = () => undefined
  const held = new Promise<string>(resolve => (release = resolve))
  let asked: () => void = () => undefined
  const overviewAsked = new Promise<void>(resolve => (asked = resolve))
  const running = runBothCalls(
    dir,
    's1',
    async (prompt, system) => {
      if (system !== OVERVIEW_SYSTEM) return 'CLOSED: i2 | MIT'
      overviewPrompt = prompt
      asked()

      return held
    },
    () => 5,
  )
  await overviewAsked
  let shown = await readState(dir, 's1')
  for (let waited = 0; shown.presence.isUpdating && waited < 200; waited += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    shown = await readState(dir, 's1')
  }

  assert.deepEqual(shown.ledger.items, [])
  assert.equal(shown.ledger.closed[0]?.outcome, 'MIT')
  assert.equal(shown.presence.isUpdating, false)
  assert.ok(overviewPrompt.includes('<subjects>'))
  release('GOAL: Adding a license')
  await running

  assert.equal((await readState(dir, 's1')).ledger.overview?.goal, 'Adding a license')
})

test('a ledger call with no answer runs no Overview call', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    pending: [{ ex: ex(1, 'Built the deploy script.'), turnsStarted: 1 }],
  }))
  const systems: string[] = []
  await runBothCalls(
    dir,
    's1',
    async (_prompt, system) => {
      systems.push(system)

      return system === OVERVIEW_SYSTEM ? 'GOAL: Building the deploy script' : null
    },
    () => 5,
  )

  assert.equal(systems.includes(OVERVIEW_SYSTEM), false)
  assert.equal((await readState(dir, 's1')).ledger.overview, null)
})

test('Overview calls run one after another, and the second reads the first one’s Overview', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2 },
    pending: [
      { ex: ex(1, 'Built the deploy script.'), turnsStarted: 1 },
      { ex: ex(2, 'Built the rollback script.'), turnsStarted: 2 },
    ],
  }))
  const overviewPrompts: string[] = []
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => (release = resolve))
  let ledgerCalls = 0
  const running = runBothCalls(
    dir,
    's1',
    async (prompt, system) => {
      if (system !== OVERVIEW_SYSTEM) {
        ledgerCalls += 1

        return `NEW: do | - | Task ${ledgerCalls} | - | -`
      }
      overviewPrompts.push(prompt)
      if (overviewPrompts.length === 1) {
        await held

        return 'GOAL: Deploy script built'
      }

      return 'GOAL: Rollback script built'
    },
    () => 5,
  )
  let shown = await readState(dir, 's1')
  for (let waited = 0; shown.pending.length > 0 && waited < 300; waited += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    shown = await readState(dir, 's1')
  }
  assert.equal(shown.pending.length, 0)
  assert.equal(overviewPrompts.length, 1)
  release()
  await running

  assert.equal(overviewPrompts.length, 2)
  assert.ok((overviewPrompts[1] ?? '').includes('Deploy script built'))
  assert.equal((await readState(dir, 's1')).ledger.overview?.goal, 'Rollback script built')
})

test('three Overview calls write in the order their updates landed', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 3 },
    pending: [
      { ex: ex(1, 'Built the first script.'), turnsStarted: 1 },
      { ex: ex(2, 'Built the second script.'), turnsStarted: 2 },
      { ex: ex(3, 'Built the third script.'), turnsStarted: 3 },
    ],
  }))
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => (release = resolve))
  let overviewCalls = 0
  const running = runBothCalls(
    dir,
    's1',
    async (_prompt, system) => {
      if (system !== OVERVIEW_SYSTEM) return 'NONE'
      overviewCalls += 1
      const mine = overviewCalls
      if (mine === 1) await held

      return `GOAL: Script ${mine} built`
    },
    () => 5,
  )
  let shown = await readState(dir, 's1')
  for (let waited = 0; shown.pending.length > 0 && waited < 300; waited += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    shown = await readState(dir, 's1')
  }
  await new Promise(resolve => setTimeout(resolve, 200))
  release()
  await running

  assert.equal((await readState(dir, 's1')).ledger.overview?.goal, 'Script 3 built')
})

test('an update’s Overview call waits while another process holds the Overview calls’ lock, then reads that process’s Overview and writes last', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2, turnsApplied: 1 },
    pending: [{ ex: ex(2, 'Built the rollback script.'), turnsStarted: 2 }],
  }))
  const overviewPrompts: string[] = []
  let running: Promise<void> = Promise.resolve()
  await withLock(`${statePath(dir, 's1')}.results`, async () => {
    running = runBothCalls(
      dir,
      's1',
      async (prompt, system) => {
        if (system !== OVERVIEW_SYSTEM) return 'NEW: do | - | Roll back | - | -'
        overviewPrompts.push(prompt)

        return 'GOAL: Rollback script built'
      },
      () => 5,
    )
    let shown = await readState(dir, 's1')
    for (let waited = 0; shown.pending.length > 0 && waited < 300; waited += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
      shown = await readState(dir, 's1')
    }
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.deepEqual(
      shown.ledger.items.map(i => i.ask),
      ['Roll back'],
    )
    assert.equal(overviewPrompts.length, 0)
    await updateState(dir, 's1', s => appliedOverview(s, parseOverview('GOAL: Deploy script built')!, 1, 4))
  })
  await running

  assert.equal(overviewPrompts.length, 1)
  assert.ok((overviewPrompts[0] ?? '').includes('Deploy script built'))
  assert.equal((await readState(dir, 's1')).ledger.overview?.goal, 'Rollback script built')
})

test('pending exchanges reach the ledger in order, a failed one waits for the next update, and a second failure drops it', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2 },
    pending: [
      { ex: ex(1, 'Should I deploy?'), turnsStarted: 1 },
      { ex: ex(2, 'Done.'), turnsStarted: 2 },
    ],
  }))
  const prompts: string[] = []
  const answers = ['NEW: decide | - | Deploy now? | Yes / No | Yes', null]
  const ask = async (p: string) => (prompts.push(p), answers.shift() ?? null)
  assert.deepEqual(viewOf(await readState(dir, 's1'), 4).status, { isUpdating: false, error: null })
  await runUpdates(dir, 's1', ask, () => 5)

  const kept = await readState(dir, 's1')
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /i1 \| decide \| - \| Deploy now\?/)
  assert.deepEqual(
    kept.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.deepEqual(
    kept.pending.map(p => [p.ex.turn, p.failed]),
    [[2, true]],
  )
  assert.deepEqual(kept.presence, {
    turnsStarted: 2,
    turnsApplied: 1,
    ledgerState: 'failed',
    hasDroppedReply: false,
    isUpdating: false,
    isTurnRunning: false,
    turnStartedAt: null,
    lastReplyAt: null,
  })
  assert.equal(viewOf(kept, 5).status.isUpdating, false)
  assert.match(viewOf(kept, 5).status.error ?? '', /Last update failed.*retries after your next message/)
  assert.equal(
    viewOf({ ...kept, pending: [...kept.pending, { ex: ex(3, 'More work.'), turnsStarted: 3 }] }, 5).status.isUpdating,
    false,
  )

  await runUpdates(
    dir,
    's1',
    async prompt => {
      assert.deepEqual(viewOf(await readState(dir, 's1'), 6).status, { isUpdating: true, error: null })
      return ask(prompt)
    },
    () => 6,
  )
  const dropped = await readState(dir, 's1')
  assert.equal(prompts.length, 3)
  assert.deepEqual(dropped.pending, [])
  assert.deepEqual(dropped.presence, {
    turnsStarted: 2,
    turnsApplied: 2,
    ledgerState: 'failed',
    hasDroppedReply: true,
    isUpdating: false,
    isTurnRunning: false,
    turnStartedAt: null,
    lastReplyAt: null,
  })
  assert.equal(viewOf(dropped, 6).status.isUpdating, false)
  assert.match(viewOf(dropped, 6).status.error ?? '', /Last update failed/)
  assert.doesNotMatch(viewOf(dropped, 6).status.error ?? '', /retry/)
})

test('an update for a session with no saved CLI runs the CLI its environment names, else the codex on PATH', async () => {
  const { exec } = fakeRunner(() => ({ code: 0, stdout: 'node\n', stderr: '' }))

  assert.equal(await findCli({ CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 1), '/app/codex')
  assert.equal(
    await findCli({ CODEX_CLI_PATH: '/person/codex', CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 1),
    '/person/codex',
  )
  assert.equal(await findCli({}, exec, 1), 'codex')
})

test('a failed update saves the CLI it ran, its exit code and the end of its stderr beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const error = 'ERROR: {"status":400,"error":{"code":"model_not_found"}}\n'
  const stderr = `${'session header and prompt\n'.repeat(500)}${error}`
  const { exec } = fakeRunner(() => ({ code: 1, stdout: '', stderr }))

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      exec,
      '/old/codex',
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.lastModelFailure?.cli, '/old/codex')
  assert.equal(s.lastModelFailure?.code, 1)
  assert.equal(s.lastModelFailure?.at, 7)
  assert.ok(s.lastModelFailure?.stderr.endsWith(error))
  assert.ok(s.lastModelFailure.stderr.length < stderr.length)
})

test('a reply with a NUL byte reaches codex on stdin, and both calls of its update apply', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  const bin = tempDir()
  t.after(() => Promise.all([dir, personHome, bin].map(d => rm(d, { recursive: true, force: true }))))
  const reply = 'Pasted \0 from a file. Should I deploy?'
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, reply), turnsStarted: 1 }] }))
  const cli = join(bin, 'codex')
  const prompts = join(bin, 'prompts.jsonl')
  const answers = join(bin, 'answers.json')
  writeFileSync(answers, JSON.stringify({ [OVERVIEW_SYSTEM]: 'GOAL: Building the deploy script' }))
  writeFileSync(
    cli,
    [
      `#!${process.execPath}`,
      `const fs = require('node:fs')`,
      `const args = process.argv.slice(2)`,
      `fs.appendFileSync(${JSON.stringify(prompts)}, JSON.stringify(fs.readFileSync(0, 'utf8')) + '\\n')`,
      `const system = args.find(a => a.startsWith('model_instructions_file=')).slice('model_instructions_file='.length)`,
      `const answer = JSON.parse(fs.readFileSync(${JSON.stringify(answers)}, 'utf8'))[fs.readFileSync(JSON.parse(system), 'utf8')]`,
      `fs.writeFileSync(args[args.indexOf('-o') + 1], answer ?? ${JSON.stringify(LEDGER_ANSWER)})`,
    ].join('\n'),
  )
  chmodSync(cli, 0o755)

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      run,
      cli,
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  const received: string[] = readFileSync(prompts, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  assert.equal(s.presence.ledgerState, 'current')
  assert.deepEqual(
    s.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.equal(s.ledger.overview?.goal, 'Building the deploy script')
  assert.equal(s.lastModelFailure, null)
  assert.equal(received.length, 2)
  assert.ok(received.every(prompt => prompt.includes(reply)))
})

test('an update whose codex command cannot start saves why as its failure beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const cli = '/apps/co\0dex'

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      run,
      cli,
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.lastModelFailure?.cli, cli)
  assert.equal(s.lastModelFailure?.code, -1)
  assert.match(s.lastModelFailure?.stderr ?? '', /null bytes/)
})

test('an Explain exchange keeps its question open while applying the rest of the model update', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2 },
    pending: [
      { ex: ex(1, 'Deploy now? Check the build?'), turnsStarted: 1 },
      {
        ex: { ...ex(2, 'Deployment means making the build live.'), press: { id: 'i1', action: 'explain' } },
        turnsStarted: 2,
      },
    ],
  }))
  const replies = [
    'NEW: decide | - | Deploy now? | Yes / No | Yes\nNEW: do | - | Check the build | - | -',
    'CLOSED: i1 | done: explained\nCLOSED: i2 | done: checked',
  ]
  await runUpdates(
    dir,
    's1',
    async () => replies.shift() ?? null,
    () => 5,
  )
  const applied = await readState(dir, 's1')
  assert.deepEqual(
    applied.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.deepEqual(
    applied.ledger.closed.map(c => c.ask),
    ['Check the build'],
  )
  assert.deepEqual(applied.pending, [])
})

test('a finished turn gives the inbox model at most forty distinct nonempty activity lines', async () => {
  const dir = tempDir()
  const lines = Array.from({ length: 45 }, (_, i) => `edited file-${i}.ts`)
  await updateState(dir, 's1', s => {
    let active = notePrompt(s, 'Do the work', 1).state
    for (const line of [null, '', lines[0]!, lines[0]!, ...lines]) active = noteActivity(active, line)
    return endTurn(active, 'Done.', 2)
  })
  const finished = await readState(dir, 's1')
  assert.deepEqual(finished.pending[0]?.ex.activity, lines.slice(0, 40))
  assert.deepEqual(finished.turn.activity, [])
})

test('view polls preserve live worker activity and reconcile a killed worker without spending its retry', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  await updateState(dir, 's1', s => ({
    ...s,
    pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }],
  }))
  const worker = fork(fileURLToPath(import.meta.url), [], {
    silent: true,
    env: { ...process.env, INBOX_STATUS_WORKER_DIR: dir },
  })
  t.after(async () => {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit')
      worker.kill('SIGKILL')
      await exited
    }
  })
  await once(worker, 'message', { signal: AbortSignal.timeout(5_000) })
  const server = () =>
    makeServer({
      comparePage: '/plugin/dist/compare-page.html',
      dir,
      now: Date.now,
      exec: async () => ({ code: 1, stdout: '', stderr: 'No external commands' }),
      fallbackCli: async () => '/codex',
      tabHtml: '<html></html>',
    })
  const poll = async (handle = server()) => {
    const answer = await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 's1' } },
    })
    return (answer?.result as { structuredContent: ReturnType<typeof viewOf> }).structuredContent
  }
  assert.equal((await poll()).status.isUpdating, true)
  assert.equal((await readState(dir, 's1')).pending[0]?.failed, undefined)
  assert.equal(worker.exitCode, null)
  const exited = once(worker, 'exit')
  assert.ok(worker.kill('SIGKILL'))
  await exited
  const stopped = await poll()
  assert.equal(stopped.status.isUpdating, false)
  assert.match(stopped.status.error ?? '', /Last update failed.*retries after your next message/)
  const state = await readState(dir, 's1')
  assert.equal(state.presence.isUpdating, false)
  assert.equal(state.pending.length, 1)
  assert.equal(state.pending[0]?.failed, undefined)
  assert.equal((await poll()).status.isUpdating, false)
  let calls = 0
  await runUpdates(
    dir,
    's1',
    async () => {
      calls++
      return null
    },
    Date.now,
  )
  assert.equal(calls, 1)
  assert.equal((await readState(dir, 's1')).pending[0]?.failed, true)
  await runUpdates(
    dir,
    's1',
    async () => {
      calls++
      return null
    },
    Date.now,
  )
  assert.equal(calls, 2)
  assert.deepEqual((await readState(dir, 's1')).pending, [])
  await updateState(dir, 's1', s => ({ ...s, presence: { ...s.presence, isUpdating: true, ledgerState: 'current' } }))
  assert.deepEqual((await poll()).status, { isUpdating: false, error: null })
})
