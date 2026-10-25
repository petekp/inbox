import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import type { Exchange } from '../../hooks/ledger'
import { noteActivity } from '../../hooks/session'
import { endTurn, notePrompt, viewOf } from '../src/core'
import { readState, statePath, updateState } from '../src/state'
import { runUpdates } from '../src/update'
import { makeServer } from '../src/server'
import { tempDir } from './helpers'

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
      return 'GOAL: Ship\nNEW: decide | - | Deploy now? | Yes / No | Yes'
    },
    () => 5,
  )

  assert.equal(calls, 1)
  assert.deepEqual((await readState(dir, 's1')).pending, [])
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
  const answers = ['GOAL: Ship\nNOW: Waiting on deploy\nNEW: decide | - | Deploy now? | Yes / No | Yes', null]
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
  })
  assert.equal(viewOf(dropped, 6).status.isUpdating, false)
  assert.match(viewOf(dropped, 6).status.error ?? '', /Last update failed/)
  assert.doesNotMatch(viewOf(dropped, 6).status.error ?? '', /retry/)
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
    'GOAL: Ship\nNEW: decide | - | Deploy now? | Yes / No | Yes\nNEW: do | - | Check the build | - | -',
    'NOW: Waiting on deploy\nCLOSED: i1 | done: explained\nCLOSED: i2 | done: checked',
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
  assert.equal(applied.ledger.card?.now, 'Waiting on deploy')
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
