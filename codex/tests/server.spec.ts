import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoView } from '../../hooks/demo'
import { feedbackOf } from '../../hooks/feedback'
import { notePrompt, viewOf } from '../src/core'
import { readState, updateState } from '../src/state'
import { ghAnswer, prServer } from './server-fixtures'

test('a PR press sends its prompt through codex queue and records the press on its row', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const d = demoView(100, 'Codex')
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  const pr = Object.values(d.prViews.views).find(v => v.threads.some(t => t.isWaiting))!
  const thread = pr.threads.find(t => t.isWaiting)!
  const r = await call('inbox_press', {
    press: { action: 'thread-address', ref: pr.ref, thread: thread.id },
    thread: 's1',
  })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.slice(0, 4), ['/apps/codex', 'queue', '--thread', 's1'])
  assert.match(calls[0]?.[5] ?? '', new RegExp(thread.path))
  const id = `${pr.ref} thread ${thread.id}`
  assert.equal(r.result.structuredContent.view.lastActions[id]?.action, 'thread-address')
  assert.equal((await readState(dir, 's1')).sent[0]?.row, id)
})

test('a bulk PR prompt arrives on every affected row without acknowledging a newer thread press', async () => {
  let at = 100
  const { dir, call } = await prServer(ghAnswer, () => at)
  const d = demoView(100, 'Codex')
  const pr = Object.values(d.prViews.views).find(
    v => v.threads.filter(t => t.isWaiting && !t.isLinesChanged).length >= 2,
  )!
  assert.ok(pr)
  const threads = pr.threads.filter(t => t.isWaiting && !t.isLinesChanged)
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  await call('inbox_press', { press: { action: 'pr-address-all', ref: pr.ref }, thread: 's1' })
  const queued = await readState(dir, 's1')
  const text = queued.sent[0]!.text
  const bulk = notePrompt(queued, text, 110).state
  const rows = [`pr:${pr.ref}`, ...threads.map(t => `${pr.ref} thread ${t.id}`)]
  for (const id of rows) {
    assert.equal(bulk.lastActions[id]?.delivery?.state, 'arrived')
    assert.equal(feedbackOf(id, bulk.lastActions[id], undefined, bulk.presence, 110)?.is, 'done')
  }
  at = 200
  await call('inbox_press', { press: { action: 'thread-discuss', ref: pr.ref, thread: threads[0]!.id }, thread: 's1' })
  const newer = await readState(dir, 's1')
  const arrived = notePrompt(newer, text, 210).state
  assert.equal(arrived.lastActions[rows[0]!]?.delivery?.state, 'arrived')
  assert.equal(arrived.lastActions[rows[2]!]?.delivery?.state, 'arrived')
  assert.deepEqual(arrived.lastActions[rows[1]!], newer.lastActions[rows[1]!])
  const discussed = notePrompt(arrived, newer.sent[1]!.text, 220).state
  assert.equal(discussed.lastActions[rows[1]!]?.delivery?.state, 'arrived')
})

test('tracked PR steps are drawn and open the same linked and branch PRs without duplicate links', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const d = demoView(100, 'Codex')
  assert.ok(d.prViews.branchRef)
  const branch = d.prViews.views[d.prViews.branchRef]!
  const linked = d.ledger.prs.map(ref => d.prViews.views[ref]).find(pr => pr && pr.ref !== branch.ref)!
  assert.ok(linked)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      prs: [linked.ref],
      items: [
        {
          id: 'i1',
          kind: 'question',
          ask: `Merge PR #${linked.number} and PR #${branch.number}?`,
          label: null,
          from: 'record',
          options: ['Yes', 'No'],
          rec: null,
          helps: [{ kind: 'link', url: linked.url, name: `PR #${linked.number}` }],
          at: 1,
          turn: 1,
        },
      ],
    },
    prViews: d.prViews,
  }))
  const row = viewOf(await readState(dir, 's1'), 100).needsYou.questions[0]!
  assert.equal(row.steps.length, 2)
  for (const action of row.actions) {
    if (action.press.action !== 'step') continue
    const reply = await call('inbox_press', { press: action.press, thread: 's1' })
    assert.equal(reply.result.structuredContent.error, null)
  }
  assert.deepEqual(calls, [
    ['open', linked.url],
    ['open', branch.url],
  ])
})

test('a PR press with an unknown queue outcome keeps its receipt and unconfirmed feedback', async () => {
  const d = demoView(100, 'Codex')
  const conflicting = Object.values(d.prViews.views).find(v => v.mergeable === 'CONFLICTING')!
  const ref = conflicting.ref
  const conflictingView = JSON.stringify({
    ...conflicting,
    baseRefName: conflicting.base,
    statusCheckRollup: [],
  })
  const { dir, call } = await prServer(args => {
    if (args[1] === 'queue') return { code: 1, stdout: '', stderr: 'no such thread' }
    if (args[1] === 'pr' && args.includes(String(conflicting.number)))
      return { code: 0, stdout: conflictingView, stderr: '' }
    return ghAnswer(args)
  })
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  const r = await call('inbox_press', { press: { action: 'pr-conflicts', ref }, thread: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal((r.result.structuredContent as unknown as { delivery: string }).delivery, 'unconfirmed')
  const s = await readState(dir, 's1')
  assert.equal(s.lastActions[`pr:${ref}`]?.delivery?.state, 'unconfirmed')
  assert.equal(s.sent[0]?.phase, 'uncertain')
})
