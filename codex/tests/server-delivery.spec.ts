import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { test } from 'node:test'

import { NO_HOLDS } from '../../hooks/timing'
import { notePrompt, viewOf } from '../src/core'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, statePath, updateState } from '../src/state'
import { ANSWER, setup } from './server-fixtures'

test('an accepted queue survives a failed final state write as an unconfirmed press', async () => {
  const { dir } = await setup(0)
  let accepted = false
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async args => {
      if (args[1] === 'queue') {
        accepted = true
        mkdirSync(`${statePath(dir, 's1')}.${process.pid}.tmp`)
        return { code: 0, stdout: 'Queued message q1\n', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const reply = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'inbox_press', arguments: ANSWER, _meta: { thread_id: 's1' } },
  })) as { result: { content: { text: string }[]; structuredContent: { error: string | null; delivery: string } } }
  const s = await readState(dir, 's1')

  assert.equal(accepted, true)
  assert.equal(reply.result.structuredContent.error, null)
  assert.equal(reply.result.structuredContent.delivery, 'unconfirmed')
  assert.doesNotMatch(reply.result.content[0]!.text, /Not sent/)
  assert.equal(s.ledger.closed[0]?.id, 'i1')
  assert.equal(s.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(s.sent[0]?.phase, 'attempting')
  assert.equal(s.sent[0]?.text, 'Re "Ship it?": Yes')
})

test('an unknown older send blocks identical later arrivals from certifying the newer press', async () => {
  const { dir } = await setup(0)
  let queues = 0
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async args =>
      args[1] === 'queue' && queues++ === 0
        ? { code: 1, stdout: '', stderr: 'outcome unknown' }
        : { code: 0, stdout: 'Queued message q2\n', stderr: '' },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const explain = () =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'inbox_press',
        arguments: { press: { action: 'explain', id: 'i1' }, thread: 's1' },
        _meta: { thread_id: 's1' },
      },
    })
  await explain()
  await explain()
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.sent.map(x => x.phase),
    ['uncertain', 'accepted'],
  )
  assert.equal(s.lastActions.i1?.delivery?.state, 'unconfirmed')

  const afterFirst = notePrompt(s, s.sent[0]!.text, 200).state
  const afterSecond = notePrompt(afterFirst, s.sent[0]!.text, 210).state
  assert.equal(afterFirst.sent.length, 2)
  assert.equal(afterSecond.sent.length, 2)
  assert.equal(afterSecond.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(afterFirst.turn.press, null)
})

test('same-millisecond identical sends on different rows acknowledge only their own delivery', async () => {
  const { dir, call } = await setup(0, () => 100)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, items: [...s.ledger.items, { ...s.ledger.items[0]!, id: 'i2' }] },
  }))
  for (const id of ['i1', 'i2'])
    await call('inbox_press', { press: { action: 'explain', id }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  assert.equal(queued.sent[0]!.text, queued.sent[1]!.text)
  const first = notePrompt(queued, queued.sent[0]!.text, 110).state
  assert.equal(first.lastActions.i1?.delivery?.state, 'arrived')
  assert.equal(first.lastActions.i2?.delivery?.state, 'unconfirmed')
  const second = notePrompt(first, first.sent[0]!.text, 120).state
  assert.equal(second.lastActions.i2?.delivery?.state, 'arrived')
})

test('a settled Fix keeps its delivery unconfirmed after one indistinguishable arrival', async () => {
  let at = 100
  const { dir, call } = await setup(0, () => at)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      findings: [
        { id: 'f1', kind: 'issue', title: 'Retry loop spins', detail: 'No delay.', path: null, at: 1 },
        { id: 'f2', kind: 'issue', title: 'Retry loop spins', detail: 'No delay.', path: null, at: 2 },
      ],
    },
  }))
  await call('inbox_press', { press: { action: 'address', id: 'f1' }, thread: 's1' }, { thread_id: 's1' })
  at = 200
  await call('inbox_press', { press: { action: 'address', id: 'f2' }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  assert.equal(queued.sent[0]!.text, queued.sent[1]!.text)
  const first = notePrompt(queued, queued.sent[0]!.text, 210).state
  const row = viewOf(first, 210, { ...NO_HOLDS, shownSince: 100 }).findings.rows.find(r => r.id === 'f2')
  assert.equal(row?.state.is, 'settled')
  assert.equal(row?.state.is === 'settled' ? row.state.delivery : null, 'unconfirmed')
  const later = viewOf(first, 210 + SETTLE_WINDOW_MS + 1)
  assert.equal(later.findings.closed.find(f => f.id === 'f2')?.delivery, 'unconfirmed')
})

test('an answered question keeps unconfirmed delivery in Closed after its settle window', async () => {
  const { dir, call } = await setup(0, () => 100)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, items: [...s.ledger.items, { ...s.ledger.items[0]!, id: 'i2' }] },
  }))
  for (const id of ['i1', 'i2'])
    await call('inbox_press', { press: { action: 'answer', id, option: 'Yes' }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  const first = notePrompt(queued, queued.sent[0]!.text, 110).state
  const later = viewOf(first, 110 + SETTLE_WINDOW_MS + 1)
  assert.equal(later.needsYou.closed.questions.find(q => q.id === 'i2')?.delivery, 'unconfirmed')
  assert.equal(
    later.needsYou.questions.find(q => q.id === 'i2'),
    undefined,
  )
})
