import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'

import { parseStatus } from '../../hooks/status'
import { appliedStatus } from '../../hooks/session'
import { readState, statePath, updateState, withLock } from '../src/state'
import { runUpdates as runBothCalls } from '../src/update'
import { STATUS_SYSTEM } from '../../hooks/model-text'
import { tempDir } from './helpers'
import { ex, LEDGER_ANSWER } from './update-fixtures'

async function updateWithStatus(answer: string | null) {
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

      return system === STATUS_SYSTEM ? answer : LEDGER_ANSWER
    },
    () => 5,
  )

  return { state: await readState(dir, 's1'), systems }
}

test('a reply’s Status comes from the separate Status call, after the ledger update', async () => {
  const { state, systems } = await updateWithStatus(
    'HEAD: Building the deploy script | Writing a script that deploys the app',
  )

  assert.equal(state.ledger.overview?.head?.title, 'Building the deploy script')
  assert.deepEqual(
    state.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.equal(systems.length, 2)
  assert.ok(systems.includes(STATUS_SYSTEM))
})

test('a failed Status call leaves the ledger update applied with no Status', async () => {
  const { state } = await updateWithStatus(null)

  assert.equal(state.ledger.overview, null)
  assert.deepEqual(
    state.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.deepEqual(state.pending, [])
})

test('a ledger update shows before its Status call returns', async () => {
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
  let statusPrompt = ''
  let release: (text: string) => void = () => undefined
  const held = new Promise<string>(resolve => (release = resolve))
  let asked: () => void = () => undefined
  const statusAsked = new Promise<void>(resolve => (asked = resolve))
  const running = runBothCalls(
    dir,
    's1',
    async (prompt, system) => {
      if (system !== STATUS_SYSTEM) return 'CLOSED: i2 | MIT'
      statusPrompt = prompt
      asked()

      return held
    },
    () => 5,
  )
  await statusAsked
  let shown = await readState(dir, 's1')
  for (let waited = 0; shown.presence.isUpdating && waited < 200; waited += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    shown = await readState(dir, 's1')
  }

  assert.deepEqual(shown.ledger.items, [])
  assert.equal(shown.ledger.closed[0]?.outcome, 'MIT')
  assert.equal(shown.presence.isUpdating, false)
  assert.ok(statusPrompt.includes('<subjects>'))
  release('HEAD: Adding a license | Adding a license file to the repo')
  await running

  assert.equal((await readState(dir, 's1')).ledger.overview?.head?.title, 'Adding a license')
})

test('a ledger call with no answer runs no Status call', async () => {
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

      return system === STATUS_SYSTEM
        ? 'HEAD: Building the deploy script | Writing a script that deploys the app'
        : null
    },
    () => 5,
  )

  assert.equal(systems.includes(STATUS_SYSTEM), false)
  assert.equal((await readState(dir, 's1')).ledger.overview, null)
})

test('Status calls run one after another, and the second reads the first one’s Status', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2 },
    pending: [
      { ex: ex(1, 'Built the deploy script.'), turnsStarted: 1 },
      { ex: ex(2, 'Built the rollback script.'), turnsStarted: 2 },
    ],
  }))
  const statusPrompts: string[] = []
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => (release = resolve))
  let ledgerCalls = 0
  const running = runBothCalls(
    dir,
    's1',
    async (prompt, system) => {
      if (system !== STATUS_SYSTEM) {
        ledgerCalls += 1

        return `NEW: do | - | Task ${ledgerCalls} | - | -`
      }
      statusPrompts.push(prompt)
      if (statusPrompts.length === 1) {
        await held

        return 'HEAD: Deploy script built | Deploying the app with one script'
      }

      return 'HEAD: Rollback script built | Rolling back a bad deploy'
    },
    () => 5,
  )
  let shown = await readState(dir, 's1')
  for (let waited = 0; shown.pending.length > 0 && waited < 300; waited += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    shown = await readState(dir, 's1')
  }
  assert.equal(shown.pending.length, 0)
  assert.equal(statusPrompts.length, 1)
  release()
  await running

  assert.equal(statusPrompts.length, 2)
  assert.ok((statusPrompts[1] ?? '').includes('Deploy script built'))
  assert.equal((await readState(dir, 's1')).ledger.overview?.head?.title, 'Rollback script built')
})

test('three Status calls write in the order their updates landed', async () => {
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
  let statusCalls = 0
  const running = runBothCalls(
    dir,
    's1',
    async (_prompt, system) => {
      if (system !== STATUS_SYSTEM) return 'NONE'
      statusCalls += 1
      const mine = statusCalls
      if (mine === 1) await held

      return `HEAD: Script ${mine} built | Writing script ${mine}`
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

  assert.equal((await readState(dir, 's1')).ledger.overview?.head?.title, 'Script 3 built')
})

test('an update’s Status call waits while another process holds the Status calls’ lock, then reads that process’s Status and writes last', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2, turnsApplied: 1 },
    pending: [{ ex: ex(2, 'Built the rollback script.'), turnsStarted: 2 }],
  }))
  const statusPrompts: string[] = []
  let running: Promise<void> = Promise.resolve()
  await withLock(`${statePath(dir, 's1')}.results`, async () => {
    running = runBothCalls(
      dir,
      's1',
      async (prompt, system) => {
        if (system !== STATUS_SYSTEM) return 'NEW: do | - | Roll back | - | -'
        statusPrompts.push(prompt)

        return 'HEAD: Rollback script built | Rolling back a bad deploy'
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
    assert.equal(statusPrompts.length, 0)
    await updateState(dir, 's1', s =>
      appliedStatus(s, parseStatus('HEAD: Deploy script built | Deploying the app with one script')!, 1, 4),
    )
  })
  await running

  assert.equal(statusPrompts.length, 1)
  assert.ok((statusPrompts[0] ?? '').includes('Deploy script built'))
  assert.equal((await readState(dir, 's1')).ledger.overview?.head?.title, 'Rollback script built')
})
