import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'

import { applyUpdate } from '../../hooks/ledger-update'
import { parseReply } from '../../hooks/reply-parse'
import { notePrompt, viewOf } from '../src/core'
import type { View } from '../src/core'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, statePath, updateState } from '../src/state'
import { tempDir } from './helpers'
import { setup } from './server-fixtures'

test('a row the tab holds keeps its closed record through more closes than the Closed list keeps, from the agent’s tools and the per-reply update, and its reply still sends', async () => {
  const { dir, calls, call } = await setup(0)
  const others = Array.from({ length: 13 }, (_, n) => `i${n + 2}`)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      nextId: 15,
      items: [...s.ledger.items, ...others.map(id => ({ ...s.ledger.items[0]!, id, ask: `Ship ${id}?` }))],
    },
  }))
  const holds = { replies: { i1: 50 }, discarded: {} }
  const agent = { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } }
  await call('inbox_view', holds, { thread_id: 's1' })
  await call('close', { id: 'i1', reason: 'settled in chat' }, agent)
  for (const id of others.slice(0, 7)) await call('close', { id, reason: 'done' }, agent)
  const update = parseReply(
    others
      .slice(7)
      .map(id => `CLOSED: ${id} | done`)
      .join('\n'),
  )!
  await updateState(dir, 's1', s => ({ ...s, ledger: applyUpdate(s.ledger, update, 100, 1) }))

  assert.deepEqual(
    (await readState(dir, 's1')).ledger.closed.map(c => c.id),
    ['i1', ...others.slice(1)],
  )
  const r = await call(
    'inbox_press',
    { press: { action: 'type', id: 'i1', text: 'Ship it anyway' }, thread: 's1', ...holds },
    { thread_id: 's1' },
  )
  assert.equal(r.result.structuredContent.note, null)
  assert.deepEqual(
    calls.filter(c => c[1] === 'queue'),
    [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Ship it anyway']],
  )
})

test('every row the agent closes while the tab shows its tab keeps its closed record and stays in place, through more closes than the Closed list keeps', async () => {
  const { dir, call } = await setup(0)
  const others = Array.from({ length: 13 }, (_, n) => `i${n + 2}`)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      nextId: 15,
      items: [...s.ledger.items, ...others.map(id => ({ ...s.ledger.items[0]!, id, ask: `Ship ${id}?` }))],
    },
  }))
  const agent = { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } }
  const tab = { thread_id: 's1' }
  await call('inbox_view', { shownSince: 50 }, tab)
  for (const id of ['i1', ...others]) await call('close', { id, reason: 'done' }, agent)

  assert.deepEqual(
    (await readState(dir, 's1')).ledger.closed.map(c => c.id),
    ['i1', ...others],
  )
  const shown = (await call('inbox_view', { shownSince: 50 }, tab)).result.structuredContent as unknown as View
  assert.deepEqual(
    shown.needsYou.questions.filter(q => q.state.is === 'settled').map(q => q.id),
    ['i1', ...others],
  )

  await call('inbox_view', { shownSince: 200 }, tab)
  assert.deepEqual(
    (await readState(dir, 's1')).ledger.closed.map(c => c.id),
    others.slice(1),
  )
})

test('a close Codex read, then undone, is reported again when the row closes a second time', async () => {
  const { dir, calls, call } = await setup(0)
  const press = (action: string) =>
    call('inbox_press', { press: { action, id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  const prompt = async (text: string) => {
    let notes: string[] = []
    await updateState(dir, 's1', s => {
      const r = notePrompt(s, text, 200)
      notes = r.notes
      return r.state
    })
    return notes.join('\n')
  }
  const closedLine = /Closed since you last read the inbox:\n- "Ship it\?" → dismissed by the user/

  await press('dismiss')
  assert.match(await prompt('carry on'), closedLine)
  const undone = await press('undo')
  assert.equal(undone.result.structuredContent.note, null)
  assert.deepEqual(
    undone.result.structuredContent.view.needsYou.questions.map(q => [q.id, q.state.is]),
    [['i1', 'open']],
  )
  await press('dismiss')
  assert.match(await prompt('and now?'), closedLine)
  assert.deepEqual(calls, [])
})

for (const failure of ['none', 'checkpoint', 'completion', 'queue', 'lookup'] as const) {
  test(`Done notification batches survive ${failure} and retain honest delivery and Undo state`, async t => {
    const dir = tempDir()
    t.after(() => rm(dir, { recursive: true, force: true }))
    await updateState(dir, 's1', s => ({
      ...s,
      ledger: {
        ...s.ledger,
        turn: 1,
        nextId: 3,
        items: ['i1', 'i2'].map(id => ({
          id,
          kind: 'task' as const,
          label: null,
          from: 'record',
          ask: `Complete ${id}`,
          options: [],
          rec: null,
          helps: [],
          turn: 1,
          at: 1,
        })),
      },
    }))
    let now = 100
    let queues = 0
    let atDispatch: Awaited<ReturnType<typeof readState>> | null = null
    const temporary = `${statePath(dir, 's1')}.${process.pid}.tmp`
    const server = () =>
      makeServer({
        comparePage: '/plugin/dist/compare-page.html',
        dir,
        now: () => now,
        tabHtml: '<html></html>',
        fallbackCli: async () => {
          if (failure === 'lookup') throw new Error('No queue command')
          return '/codex'
        },
        exec: async argv => {
          if (!argv.includes('queue')) return { code: -1, stdout: '', stderr: 'No external commands' }
          queues++
          atDispatch = await readState(dir, 's1')
          if (failure === 'completion') mkdirSync(temporary)
          return failure === 'queue'
            ? { code: 1, stdout: '', stderr: 'Lost queue outcome' }
            : { code: 0, stdout: 'Queued message done-batch', stderr: '' }
        },
      })
    let handle = server()
    const call = (name: string, args: Record<string, unknown> = {}) =>
      handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args, _meta: { thread_id: 's1' } },
      })
    for (const id of ['i1', 'i2']) {
      await call('inbox_press', { press: { action: 'done', id }, thread: 's1' })
      now++
    }
    now += SETTLE_WINDOW_MS
    if (failure === 'checkpoint') mkdirSync(temporary)
    await call('inbox_view')
    await rm(temporary, { recursive: true, force: true })
    let state = await readState(dir, 's1')
    if (failure === 'checkpoint' || failure === 'lookup') {
      assert.equal(queues, 0)
      assert.deepEqual(state.sent, [])
      assert.ok(state.ledger.closed.every(c => !c.isSentToAgent))
      const undo = await call('inbox_press', { press: { action: 'undo', id: 'i1' }, thread: 's1' })
      assert.equal((undo?.result as { structuredContent: { note: string | null } }).structuredContent.note, null)
      assert.ok((await readState(dir, 's1')).ledger.items.some(i => i.id === 'i1'))
      return
    }
    assert.equal(queues, 1)
    const intent = atDispatch as Awaited<ReturnType<typeof readState>> | null
    assert.ok(intent)
    assert.equal(intent.sent[0]?.phase, 'attempting')
    assert.ok(intent.ledger.closed.every(c => c.isSentToAgent))
    assert.ok(['i1', 'i2'].every(id => intent.lastActions[id]?.delivery?.state === 'unconfirmed'))
    assert.equal(state.sent.length, 1)
    assert.equal(
      state.sent[0]?.phase,
      failure === 'none' ? 'accepted' : failure === 'queue' ? 'uncertain' : 'attempting',
    )
    assert.equal(new Set(['i1', 'i2'].map(id => state.lastActions[id]?.delivery?.state)).size, 1)
    assert.ok(state.ledger.closed.every(c => c.isSentToAgent))
    const expected = failure === 'none' ? 'queued' : 'unconfirmed'
    assert.deepEqual(
      viewOf(state, now).needsYou.closed.tasks.map(c => c.delivery),
      [expected, expected],
    )
    handle = server()
    await call('inbox_view')
    await call('inbox_view')
    assert.equal(queues, 1)
    const undo = await call('inbox_press', { press: { action: 'undo', id: 'i1' }, thread: 's1' })
    assert.equal((undo?.result as { structuredContent: { note: string | null } }).structuredContent.note, 'stale')
    state = notePrompt(await readState(dir, 's1'), state.sent[0]!.text, now).state
    const isOutcomeLost = failure === 'queue'
    assert.equal(state.sent.length, isOutcomeLost ? 1 : 0)
    assert.deepEqual(
      viewOf(state, now).needsYou.closed.tasks.map(c => c.delivery),
      isOutcomeLost ? ['unconfirmed', 'unconfirmed'] : [null, null],
    )
  })
}
