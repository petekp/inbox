import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { noteHook, notePrompt } from '../src/core'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { handleHook } from '../src/hook'
import { fakeRunner, hookDeps, input, rolloutAt, tempDir, turnRow } from './helpers'

test('a chat saved mid-turn stays running until a view or a press finds the turn ended in its rollout', async () => {
  const dir = tempDir()
  const rollout = join(dir, 'rollout.jsonl')
  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n`)
  const running = () =>
    updateState(dir, 's1', s => ({
      ...s,
      transcriptPath: rollout,
      presence: { ...s.presence, isTurnRunning: true },
    }))
  await running()
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    })
  const isRunning = async () => (await readState(dir, 's1')).presence.isTurnRunning
  const viewNow = async () => {
    await call('inbox_view', {})

    return (await isRunning()) ? 'running' : null
  }

  assert.equal(await viewNow(), 'running')
  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n${turnRow('task_complete', 't1')}\n`)
  assert.equal(await viewNow(), null)

  await running()
  writeFileSync(rollout, `${turnRow('task_started', 't2')}\n`)
  assert.equal(await viewNow(), 'running')
  writeFileSync(rollout, `${turnRow('task_started', 't2')}\n${turnRow('turn_aborted', 't2')}\n`)
  await call('inbox_press', { press: { action: 'done', id: 'i1' }, thread: 'another chat' })
  assert.equal(await isRunning(), false)
})

test('a turn another plugin’s Stop continues runs again once a view finds it running in the rollout', async () => {
  const dir = tempDir()
  const rollout = join(dir, 'rollout.jsonl')
  writeFileSync(rollout, '')
  const deps = hookDeps(dir)
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const viewNow = async () => {
    await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 's1' } },
    })

    return (await readState(dir, 's1')).presence.isTurnRunning ? 'running' : null
  }

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1', transcript_path: rollout }), deps)
  assert.equal(await viewNow(), 'running')
  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n`)
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't1', transcript_path: rollout }), deps)
  assert.equal((await readState(dir, 's1')).presence.isTurnRunning, false)
  assert.equal(await viewNow(), 'running')

  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n${turnRow('task_complete', 't1')}\n`)
  assert.equal(await viewNow(), null)
})

test('Done on a task Codex just left waits while a turn runs, queues one message once the rollout shows the turn interrupted, and Undo then reads stale', async () => {
  const dir = tempDir()
  const task = (id: string, ask: string, turn: number) => ({
    id,
    kind: 'task' as const,
    label: null,
    from: 'record' as const,
    ask,
    options: [],
    rec: null,
    helps: [],
    turn,
    at: 1,
  })
  const rollout = join(dir, 'rollout.jsonl')
  writeFileSync(rollout, `${turnRow('task_started', 't3')}\n`)
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    cliPath: '/apps/codex',
    transcriptPath: rollout,
    ledger: {
      ...s.ledger,
      turn: 2,
      nextId: 3,
      items: [task('i1', 'Water the plants', 1), task('i2', 'Sign in to npm', 2)],
    },
  }))
  let t = 100
  const runner = fakeRunner(() => ({ code: 0, stdout: 'Queued message q1\n', stderr: '' }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => t,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    }) as Promise<{
      result: { structuredContent: { note: string | null } }
    }>
  const poll = () => call('inbox_view', {})

  await call('inbox_press', { press: { action: 'done', id: 'i1' }, thread: 's1' })
  await call('inbox_press', { press: { action: 'done', id: 'i2' }, thread: 's1' })
  await updateState(dir, 's1', s => ({ ...s, presence: { ...s.presence, isTurnRunning: true } }))
  t += SETTLE_WINDOW_MS
  await poll()
  const queued = () => runner.calls.filter(c => c[0] === '/apps/codex')
  assert.deepEqual(queued(), [])

  writeFileSync(rollout, `${turnRow('task_started', 't3')}\n${turnRow('turn_aborted', 't3')}\n`)
  await poll()
  await poll()
  assert.deepEqual(queued(), [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Done: Sign in to npm']])
  const undo = await call('inbox_press', { press: { action: 'undo', id: 'i2' }, thread: 's1' })
  assert.equal(undo.result.structuredContent.note, 'stale')
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.ledger.closed.map(c => [c.id, c.isSentToAgent ?? false]),
    [
      ['i1', false],
      ['i2', true],
    ],
  )
  assert.deepEqual(notePrompt(s, s.sent[0]!.text, t).state.turn.press, { id: 'i2', action: 'done' })
})

function openSetup() {
  const dir = tempDir()
  const home = tempDir()
  const updates: string[] = []
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => '/apps/codex',
    openCatchUp: { codexHome: home, startUpdate: id => updates.push(id) },
  })
  const call = (name: string, id: string, meta: Record<string, unknown> = { thread_id: id }) =>
    handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {}, _meta: meta } })

  return { dir, home, updates, call }
}

test('the tab’s first view of a chat with earlier turns marks it behind and starts one catch-up, even across polls', async () => {
  const { dir, home, updates, call } = openSetup()
  const rollout = rolloutAt(home, 'c1', { cwd: '/repo' })
  await call('inbox_view', 'c1')
  await call('inbox_view', 'c1')

  const s = await readState(dir, 'c1')
  assert.equal(s.presence.ledgerState, 'behind')
  assert.equal(s.transcriptPath, rollout)
  assert.equal(s.root, '/repo')
  assert.equal(s.cliPath, '/apps/codex')
  assert.deepEqual(updates, ['c1'])

  await handleHook(input('SessionStart', { session_id: 'c1', cwd: '/repo', transcript_path: rollout }), {
    ...hookDeps(dir),
    startUpdate: id => updates.push(`hook ${id}`),
  })
  assert.deepEqual(updates, ['c1'])
})

test('the tab’s first view of a forked chat gives it the parent’s ledger and starts no catch-up', async () => {
  const { dir, home, updates, call } = openSetup()
  await updateState(dir, 'parent', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 3, turnsApplied: 3 },
    ledger: { ...s.ledger, turn: 3, updates: 1, nextId: 4 },
  }))
  rolloutAt(home, 'fork', { forked_from_id: 'parent' })
  await call('inbox_view', 'fork')

  const s = await readState(dir, 'fork')
  assert.equal(s.presence.ledgerState, 'current')
  assert.deepEqual(updates, [])
})

test('the tab changes nothing for a chat with no rollout, and does not look again once it appears', async () => {
  const { dir, home, updates, call } = openSetup()
  await call('inbox_view', 'c2')
  rolloutAt(home, 'c2')
  await call('inbox_view', 'c2')

  const s = await readState(dir, 'c2')
  assert.equal(s.presence.ledgerState, 'current')
  assert.equal(s.transcriptPath, null)
  assert.deepEqual(updates, [])
})

test('a chat whose hooks already ran is left as it is when its tab opens', async () => {
  const { dir, home, updates, call } = openSetup()
  rolloutAt(home, 'c3')
  await updateState(dir, 'c3', s => noteHook(s, 'start', 50))
  await call('inbox_view', 'c3')

  const s = await readState(dir, 'c3')
  assert.equal(s.presence.ledgerState, 'current')
  assert.equal(s.transcriptPath, null)
  assert.deepEqual(updates, [])
})

test('a call the model makes does not catch up the chat', async () => {
  const { dir, home, updates, call } = openSetup()
  rolloutAt(home, 'c4')
  const agent = { 'x-codex-turn-metadata': { session_id: 'c4', turn_id: 't1' } }
  await call('inbox', 'c4', agent)
  await call('record', 'c4', agent)

  assert.equal((await readState(dir, 'c4')).presence.ledgerState, 'current')
  assert.deepEqual(updates, [])
})
