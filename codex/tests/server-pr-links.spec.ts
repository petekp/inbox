import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoView } from '../../hooks/demo'
import { SETTLED_MS } from '../../hooks/timing'
import { makeServer } from '../src/server'
import { POLL_MS, SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { fakeRunner, tempDir } from './helpers'
import { GH_VIEW, ghAnswer, prsAnswer, prServer, viewAfterFetch } from './server-fixtures'
import type { PrReply, PrView } from './server-fixtures'

test('dismissing a linked PR unlinks it and settles its block as a dismissed row, which folds when the settle window ends unless the person is still using the list or the tab still shows its Undo, and its view goes once the tab shows another tab', async () => {
  let t = 100
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const runner = fakeRunner(() => ({ code: -1, stdout: '', stderr: '' }))
  const handle = makeServer({
    dir,
    now: () => t,
    exec: runner.exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    comparePage: '/plugin/dist/compare-page.html',
  })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    }) as Promise<PrReply>
  const d = demoView(100, 'Codex')
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, prs: d.ledger.prs },
    prViews: { ...d.prViews, branchRef: null },
  }))
  const ref = d.ledger.prs.find(r => r !== d.prViews.branchRef)!
  const dismissed = await call('inbox_press', { press: { action: 'pr-dismiss', ref }, thread: 's1', shownSince: 0 })
  const drawn = (v: PrView) => v.prs.drawn.map(x => x.pr.ref)
  assert.ok(drawn(dismissed.result.structuredContent.view).includes(ref))
  assert.deepEqual(dismissed.result.structuredContent.view.prs.drawn.find(x => x.pr.ref === ref)?.state, {
    is: 'settled',
    label: 'Dismissed',
    at: 100,
    canUndo: true,
    offersUndo: true,
    closedAs: 'dismissed',
    delivery: null,
  })
  assert.equal((await readState(dir, 's1')).ledger.prs.includes(ref), false)
  const undoOf = (v: PrView) => v.prs.drawn.filter(x => x.pr.ref === ref).map(x => [x.state.is, x.state.canUndo])
  t += SETTLED_MS + POLL_MS
  assert.deepEqual(undoOf((await call('inbox_view', { shownSince: 0 })).result.structuredContent), [['settled', true]])
  t += SETTLE_WINDOW_MS
  const inUse = { since: 100 + SETTLE_WINDOW_MS - 1, last: t }
  const held = await call('inbox_view', { shownSince: 0, listInput: inUse })
  assert.deepEqual(undoOf(held.result.structuredContent), [['settled', false]])
  const named = await call('inbox_view', { shownSince: 0, undoShown: [`pr:${ref}`] })
  assert.deepEqual(undoOf(named.result.structuredContent), [['settled', false]])
  const folded = await call('inbox_view', { shownSince: 0 })
  assert.equal(drawn(folded.result.structuredContent).includes(ref), false)
  assert.ok(ref in (await readState(dir, 's1')).prViews.views)
  const switched = await call('inbox_view', { shownSince: t })
  assert.equal(drawn(switched.result.structuredContent).includes(ref), false)
  assert.equal(ref in (await readState(dir, 's1')).prViews.views, false)
})

test('an order_prs call ranks the PRs it names without linking them, the next view fetches them and ranks them first under the order’s lines, and once a ranked PR changed, Rank again sends the agent its message', async () => {
  let at = 100
  const extraCheck = new Set<number>()
  const view = (number: number) => {
    const base = JSON.parse(GH_VIEW)
    const checks = extraCheck.has(number)
      ? [...base.statusCheckRollup, { name: 'test', conclusion: 'FAILURE', workflowName: 'CI' }]
      : base.statusCheckRollup
    return JSON.stringify({
      ...base,
      number,
      url: `https://github.com/acme/app/pull/${number}`,
      statusCheckRollup: checks,
    })
  }
  const { dir, call } = await prServer(
    args =>
      args[0] === 'gh' && args[2] === 'graphql'
        ? { code: 0, stdout: prsAnswer(args, view), stderr: '' }
        : ghAnswer(args),
    () => at,
  )
  const set = (await call('order_prs', {
    repo: 'acme/app',
    numbers: [9, 7],
    label: 'Merge in this order',
    why: '#7 builds on #9.',
  })) as unknown as {
    result: { content: { text: string }[] }
  }
  assert.match(set.result.content[0]!.text, /^Set\. These 2 PRs show first in the PRs section of the Inbox tab/)
  const ordered = (await readState(dir, 's1')).ledger
  assert.deepEqual(ordered.prs, [])
  assert.deepEqual(ordered.prOrder?.refs, ['acme/app#9', 'acme/app#7'])
  const { prs } = (await viewAfterFetch(call)).result.structuredContent
  assert.deepEqual(
    prs.drawn.map(d => [d.pr.number, d.rank]),
    [
      [9, 1],
      [7, 2],
    ],
  )
  assert.match(prs.order?.title ?? '', /^Merge in this order · set by Codex/)
  assert.equal(prs.order?.why, '#7 builds on #9.')
  assert.equal(prs.order?.changed, null)
  assert.deepEqual(Object.keys((await readState(dir, 's1')).ledger.prOrder?.statuses ?? {}), [
    'acme/app#9',
    'acme/app#7',
  ])

  extraCheck.add(9)
  at += 3 * 60_000
  const changed = (await viewAfterFetch(call)).result.structuredContent.prs.order?.changed
  assert.equal(changed?.text, '1 PR changed since')
  assert.deepEqual(
    changed?.actions.map(a => [a.label, a.hotkey]),
    [['Rank again', 'g']],
  )
  await call('inbox_press', { press: { action: 'pr-rank-again' }, thread: 's1', shownSince: 0 })
  const s = await readState(dir, 's1')
  assert.equal(s.lastActions['pr:order']?.action, 'pr-rank-again')
  assert.deepEqual(
    s.sent.map(x => [x.row, x.text]),
    [
      [
        'pr:order',
        'The PR order you set for the PRs tab, "Merge in this order", is out of date: #9 changed since you set it.\nRank its open PRs in acme/app again (#9, #7), and set the new order with order_prs.',
      ],
    ],
  )
})

test('Clear merged and closed unlinks the merged and closed PRs and settles each block with its own Undo', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const runner = fakeRunner(() => ({ code: -1, stdout: '', stderr: '' }))
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: runner.exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    comparePage: '/plugin/dist/compare-page.html',
  })
  const d = demoView(100, 'Codex')
  const [merged, closed] = d.ledger.prs.filter(r => r !== d.prViews.branchRef)
  const finished: Record<string, string> = { [merged!]: 'MERGED', [closed!]: 'CLOSED' }
  const views = Object.fromEntries(
    Object.entries(d.prViews.views).map(([ref, v]) => [ref, finished[ref] ? { ...v, state: finished[ref] } : v]),
  )
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, prs: d.ledger.prs },
    prViews: { ...d.prViews, views } as typeof d.prViews,
  }))
  const r = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'inbox_press',
      arguments: { press: { action: 'pr-clear-finished' }, thread: 's1', shownSince: 0 },
      _meta: { thread_id: 's1' },
    },
  })) as PrReply
  const states = r.result.structuredContent.view.prs.drawn.map(x => [
    x.pr.ref,
    x.state.is,
    x.state.is === 'settled' ? x.state.canUndo : null,
  ])
  assert.deepEqual(
    states.filter(([ref]) => ref === merged || ref === closed),
    [
      [merged, 'settled', true],
      [closed, 'settled', true],
    ],
  )
  assert.deepEqual(r.result.structuredContent.view.prs.clear, [])
  assert.deepEqual((await readState(dir, 's1')).ledger.prs, [d.prViews.branchRef])
})
