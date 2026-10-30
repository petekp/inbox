import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoView } from '../../hooks/demo'
import { SETTLED_MS } from '../../hooks/view'
import { makeServer } from '../src/server'
import { POLL_MS, SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { fakeRunner, tempDir } from './helpers'
import { GH_VIEW, ghAnswer, prServer, viewAfterFetch } from './server-fixtures'
import type { PrReply, PrView } from './server-fixtures'

test('dismissing a linked PR unlinks it and settles its block as a dismissed row, until the tab shows another tab', async () => {
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
  const stayed = await call('inbox_view', { shownSince: 0 })
  assert.deepEqual(undoOf(stayed.result.structuredContent), [['settled', false]])
  assert.ok(ref in (await readState(dir, 's1')).prViews.views)
  const switched = await call('inbox_view', { shownSince: t })
  assert.equal(drawn(switched.result.structuredContent).includes(ref), false)
  assert.equal(ref in (await readState(dir, 's1')).prViews.views, false)
})

test('an order_prs call links the PRs it names, the next view ranks them first under the order’s lines, and once a ranked PR changed, Rank again sends the agent its message', async () => {
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
    args => {
      const named = args[0] === 'gh' && args[1] === 'pr' ? args.find(a => /^\d+$/.test(a)) : undefined
      return named ? { code: 0, stdout: view(Number(named)), stderr: '' } : ghAnswer(args)
    },
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
  assert.deepEqual((await readState(dir, 's1')).ledger.prs, ['acme/app#9', 'acme/app#7'])
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

test('Dismiss merged unlinks the merged PRs and settles each block with its own Undo', async () => {
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
  const merged = d.ledger.prs.filter(r => r !== d.prViews.branchRef)
  const views = Object.fromEntries(
    Object.entries(d.prViews.views).map(([ref, v]) => [ref, merged.includes(ref) ? { ...v, state: 'MERGED' } : v]),
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
      arguments: { press: { action: 'pr-dismiss-merged' }, thread: 's1', shownSince: 0 },
      _meta: { thread_id: 's1' },
    },
  })) as PrReply
  const states = r.result.structuredContent.view.prs.drawn.map(x => [
    x.pr.ref,
    x.state.is,
    x.state.is === 'settled' ? x.state.canUndo : null,
  ])
  assert.deepEqual(
    states.filter(([ref]) => merged.includes(ref as string)).map(([, is, canUndo]) => [is, canUndo]),
    [
      ['settled', true],
      ['settled', true],
    ],
  )
  assert.deepEqual((await readState(dir, 's1')).ledger.prs, [d.prViews.branchRef])
})
