import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../core/domain/model-text'
import { pressOn, recorded, withFetchedPrs } from '../core/runtime/session-presses'
import { sessionView } from '../core/view/session-view'
import type { PrView, RowNote } from '../types'
import { press } from '../core/runtime/host-press'
import { allRows } from '../core/view/rows'
import { NO_HOLDS } from '../core/view/timing'
import { feedbackOf, feedbackText } from '../core/view/feedback'
import { checkRowId, isBlockPressShown, prBlockRows, prMarkId, prRowWaits } from '../core/view/pr-rows'
import { checkActions } from '../core/view/pr-tab'
import { prPressEffect } from '../core/view/pr-press'
import { upgradeSession } from '../core/view/session-files'
import { EMPTY } from '../core/domain/ledger'
import { checkKey } from '../core/domain/prs'
import { fakeHost } from './session-fake-host'
import { FIX_REF, BLOCKED_PR } from './session-helpers'
import { blockedPrHost, repliedTo } from './session-pr-helpers'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import { rowVersion } from '../core/domain/preconditions'

test('while a press is out, its button stays out and a second press sends nothing, even when a newer note shows on the row', async () => {
  const { host } = fakeHost(async () => null)
  const question = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, 1, TOOL_FIELDS, null).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'explain', id }, false, NO_HOLDS)
  const s = await host.read()
  const at = await host.now()
  const explainOf = (notes: Record<string, RowNote>) => {
    const row = allRows(sessionView(s, at, host.settleWindowMs, NO_HOLDS, notes)).find(r => r.id === id)!
    const explain = row.actions.find(a => a.press.action === 'explain')!

    return { feedback: row.feedback?.is, label: explain.label, isOut: explain.isOut }
  }
  const again = pressOn(
    s,
    { action: 'explain', id },
    at,
    { settleWindowMs: host.settleWindowMs, holds: NO_HOLDS },
    host,
  )

  expect('stale' in again ? null : again.effects).toEqual([])
  expect(explainOf({})).toEqual({ feedback: 'working', label: 'Explain', isOut: true })
  expect(explainOf({ [id]: { note: 'stale', at } })).toEqual({ feedback: 'note', label: 'Explain', isOut: true })
})

test('Resolve conflicts and Fix check the PR on GitHub first, reading Refreshing at once, and send nothing once the problem is gone', async () => {
  const resolved = await blockedPrHost((pr, at) => ({ ...pr, mergeable: 'MERGEABLE', fetchedAt: at }))
  const conflicts = await press(resolved.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(resolved.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(conflicts.note).toBe('stale')
  expect(resolved.delivered).toEqual([])

  const passed = await blockedPrHost((pr, at) => ({
    ...pr,
    checks: [{ name: 'test', bucket: 'pass', url: null }],
    fetchedAt: at,
  }))
  const fix = await press(passed.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
  expect(passed.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(fix.note).toBe('stale')
  expect(passed.delivered).toEqual([])
})

test('Resolve conflicts and Fix send their message when the PR on GitHub still has the problem, after an earlier press of the same fix', async () => {
  const still = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }))
  for (const round of [1, 2]) {
    const conflicts = await press(still.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
    const fix = await press(still.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
    expect([conflicts.note, fix.note]).toEqual([null, null])
    expect(still.delivered.length).toBe(2 * round)
    for (const text of still.delivered.slice(-2))
      await still.host.update(async s => repliedTo(s, text, await still.host.now()))
    await still.host.refreshPrs()
  }
  expect(still.delivered[2]).toContain('PR #12 (https://github.com/acme/app/pull/12) conflicts with main.')
  expect(still.delivered[3]).toContain('The test check failed on PR #12')
  expect(await still.shownOn(prMarkId(FIX_REF))).toBe('✓ Asked to resolve conflicts')
})

test('a fix press whose check of the PR fails sends nothing and says why on its row', async () => {
  const unread = await blockedPrHost(pr => ({ ...pr, error: 'HTTP 502' }))
  const conflicts = await press(unread.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(conflicts.note).toBe(null)
  expect(unread.delivered).toEqual([])
  expect(await unread.shownOn(prMarkId(FIX_REF))).toBe('Could not refresh PR #12: HTTP 502')
})

const RUN_77 = 'https://github.com/acme/app/actions/runs/77/job'

async function cancelledRunHost(isRunningOnGitHub: () => boolean) {
  const { host } = fakeHost(async () => null)
  const ghRuns: string[][] = []
  const refreshes: number[] = []
  let ghAnswer = { exitCode: 0, stdout: '', stderr: '' }
  let duringGh = async () => {}
  const checks = [
    { name: 'e2e', bucket: 'cancelled' as const, url: `${RUN_77}/9`, workflow: 'CI' },
    { name: 'e2e-mac', bucket: 'cancelled' as const, url: `${RUN_77}/10`, workflow: 'CI' },
  ]
  host.gh = {
    ...host.gh,
    find: async () => 'gh',
    run: () => async args => {
      ghRuns.push(args)
      await duringGh()
      return ghAnswer
    },
  }
  host.refreshPrs = async () => {
    refreshes.push(ghRuns.length)
    const bucket = isRunningOnGitHub() ? ('pending' as const) : ('cancelled' as const)
    const at = await host.now()
    await host.update(s =>
      withFetchedPrs(
        s,
        { [FIX_REF]: { ...BLOCKED_PR, checks: checks.map(c => ({ ...c, bucket })), fetchedAt: at } },
        null,
        false,
        at,
      ),
    )
  }
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: { ...BLOCKED_PR, checks } } },
  }))
  const shownOn = async (rowId: string) => {
    const s = await host.read()
    const f = feedbackOf(rowId, s.lastActions[rowId], undefined, s.presence, await host.now())
    return f ? feedbackText(f, 'terminal') : null
  }
  const blockShows = async () => {
    const s = await host.read()
    return isBlockPressShown(s.prViews.views[FIX_REF]!, s.lastActions) ? shownOn(prMarkId(FIX_REF)) : null
  }
  const rerun = (name: string) =>
    press(host, { action: 'check-rerun', ref: FIX_REF, check: checkKey({ name, workflow: 'CI' }) }, false, NO_HOLDS)
  const answer = (a: typeof ghAnswer) => {
    ghAnswer = a
  }
  const whileGhRuns = (f: () => Promise<void>) => {
    duringGh = f
  }

  return { host, ghRuns, refreshes, shownOn, blockShows, rerun, answer, whileGhRuns }
}

test('Re-run reads the PR on GitHub first, and starts nothing when the check is no longer cancelled there', async () => {
  const t = await cancelledRunHost(() => true)

  expect((await t.rerun('e2e')).note).toBe('stale')
  expect(t.ghRuns).toEqual([])
  expect(t.refreshes).toEqual([0])
})

test('Re-run asks gh to re-run the run, and the PR block says it started once the refresh shows the run running and drops the row', async () => {
  let isStarted = false
  const t = await cancelledRunHost(() => isStarted)
  const sibling: { isOut?: boolean; note?: string | null; block?: string | null } = {}
  t.whileGhRuns(async () => {
    t.whileGhRuns(async () => {})
    const s = await t.host.read()
    const pr = s.prViews.views[FIX_REF]!
    const presses = { lastActions: s.lastActions, turns: s.presence, now: await t.host.now() }
    sibling.isOut = checkActions(pr, pr.checks[1]!, presses).find(a => a.label === 'Re-run')?.isOut
    sibling.note = (await t.rerun('e2e-mac')).note
    sibling.block = await t.blockShows()
    isStarted = true
  })

  expect((await t.rerun('e2e')).note).toBe(null)
  expect(t.ghRuns).toEqual([['run', 'rerun', '77', '--failed', '-R', 'acme/app']])
  expect(sibling).toEqual({ isOut: true, note: 'stale', block: null })
  expect(t.refreshes).toEqual([0, 1])
  const pr = (await t.host.read()).prViews.views[FIX_REF]!
  expect(prBlockRows(pr, false, { thread: () => 'thread', check: c => c.name }).rows).toEqual([])
  expect(await t.blockShows()).toBe('✓ Started a re-run of CI')
})

test('Re-run reads GitHub refusing a run that is already running as started, and refreshes after any other refusal too', async () => {
  const running = await cancelledRunHost(() => false)
  running.answer({ exitCode: 1, stdout: '', stderr: 'run 77 cannot be rerun; This workflow is already running\n' })
  await running.rerun('e2e')
  expect(await running.shownOn(checkRowId(FIX_REF, 'CI / e2e'))).toBe('✓ Started a re-run of CI')
  expect(await running.blockShows()).toBe(null)

  const refused = await cancelledRunHost(() => false)
  refused.answer({ exitCode: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration\n' })
  await refused.rerun('e2e')
  expect(refused.refreshes).toEqual([0, 1])
  expect(await refused.blockShows()).toBe(null)
  expect(await refused.shownOn(checkRowId(FIX_REF, 'CI / e2e'))).toBe(
    'Could not start a re-run of CI: HTTP 403: Resource not accessible by integration',
  )
})

const SAME_NAME_CHECKS: PrView['checks'] = [
  { name: 'test', bucket: 'fail', url: 'https://github.com/acme/app/actions/runs/5/job/1', workflow: 'CI' },
  { name: 'test', bucket: 'fail', url: 'https://github.com/acme/app/actions/runs/6/job/2', workflow: 'Nightly' },
]

test('two checks with one name in different workflows are two rows, and Fix and Open log on one act on that check', async () => {
  const pr = { ...BLOCKED_PR, mergeable: 'MERGEABLE', checks: SAME_NAME_CHECKS }
  const [ci, nightly] = SAME_NAME_CHECKS.map(checkKey) as [string, string]
  const t = await blockedPrHost((p, at) => ({ ...p, fetchedAt: at }), pr)
  expect(prRowWaits([pr], {}).map(r => r.id)).toEqual([checkRowId(FIX_REF, ci), checkRowId(FIX_REF, nightly)])
  expect(prPressEffect(pr, { action: 'log', ref: FIX_REF, check: ci })).toEqual({
    kind: 'open',
    target: SAME_NAME_CHECKS[0]!.url,
    name: 'the log',
  })

  expect((await press(t.host, { action: 'check-fix', ref: FIX_REF, check: nightly }, false, NO_HOLDS)).note).toBe(null)
  expect(t.delivered.map(m => m.split('\n')[0])).toEqual([
    `The Nightly / test check failed on PR #12 (https://github.com/acme/app/pull/12). Read its log (${SAME_NAME_CHECKS[1]!.url}), find the cause, fix it in code, and verify.`,
  ])
  const s = await t.host.read()
  expect(prRowWaits([s.prViews.views[FIX_REF]!], s.lastActions).map(r => r.isWaiting)).toEqual([true, false])
})

test('a check saved by its name alone loads named by workflow and name when one check has that name, and loading twice changes nothing', () => {
  const checks: PrView['checks'] = [
    { name: 'lint', bucket: 'fail', url: null, workflow: 'CI' },
    ...SAME_NAME_CHECKS,
    { name: 'deploy', bucket: 'fail', url: null },
  ]
  const last = { kind: 'handoff' as const, action: 'check-fix', text: 'Fix', at: 1 }
  const old = (name: string) => checkRowId(FIX_REF, name)
  const loaded = upgradeSession({
    prViews: { views: { [FIX_REF]: { ...BLOCKED_PR, checks } }, branchRef: null, isFetching: false },
    lastActions: { [old('lint')]: last, [old('test')]: last, [old('deploy')]: last },
    sent: [{ text: 'Fix lint', press: null, at: 1, row: old('lint') }],
    ledger: {
      ...EMPTY,
      prOrder: {
        refs: [FIX_REF],
        label: null,
        why: null,
        statuses: { [FIX_REF]: { status: 'blocked', threads: [], failing: ['lint', 'test', 'deploy'] } },
        dismissed: [],
        by: 'Claude',
        at: 1,
      },
    },
  })

  expect(Object.keys(loaded.lastActions)).toEqual([old('CI / lint'), old('test'), old('deploy')])
  expect(loaded.sent.map(x => x.row)).toEqual([old('CI / lint')])
  expect(loaded.ledger.prOrder?.statuses?.[FIX_REF]?.failing).toEqual(['CI / lint', 'test', 'deploy'])
  expect(upgradeSession(loaded)).toEqual(loaded)
})

test('a row press whose row changed since it was drawn, or that is too old, sends and saves nothing and says why', async () => {
  const { host, delivered } = fakeHost(async () => null)
  const ask = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(async s => recorded(CLAUDE_CODE, s, 'record', ask, await host.now(), TOOL_FIELDS, null).state)
  const [item] = (await host.read()).ledger.items
  if (!item) throw new Error('The question was not recorded.')
  const drawn = rowVersion(await host.read(), item.id)
  await host.update(s => ({ ...s, ledger: { ...s.ledger, items: [{ ...item, ask: 'Ship it today?' }] } }))
  const before = await host.read()

  const changed = await press(host, { action: 'explain', id: item.id }, false, NO_HOLDS, undefined, [
    { kind: 'row-version', row: item.id, version: drawn },
  ])
  const expired = await press(host, { action: 'explain', id: item.id }, false, NO_HOLDS, undefined, [
    { kind: 'expires-at', at: await host.now() },
  ])

  expect([changed.error, expired.error]).toEqual([
    'This changed before your press. Nothing was sent.',
    'This press is too old to run. Nothing was sent.',
  ])
  expect([await host.read(), delivered]).toEqual([before, []])
})

test('a row press acts when its row is as drawn and it is not too old, and when it carries no checks', async () => {
  const { host, delivered } = fakeHost(async () => null)
  for (const ask of ['Ship it?', 'Tag it?'])
    await host.update(
      async s =>
        recorded(CLAUDE_CODE, s, 'record', { kind: 'question', ask, options: ['Yes', 'No'] }, 1, TOOL_FIELDS, null)
          .state,
    )
  const [checked, unchecked] = (await host.read()).ledger.items
  if (!checked || !unchecked) throw new Error('The questions were not recorded.')
  const when = [
    { kind: 'row-version' as const, row: checked.id, version: rowVersion(await host.read(), checked.id) },
    { kind: 'expires-at' as const, at: (await host.now()) + 60_000 },
  ]

  const outcomes = [
    await press(host, { action: 'explain', id: checked.id }, false, NO_HOLDS, undefined, when),
    await press(host, { action: 'explain', id: unchecked.id }, false, NO_HOLDS),
  ]

  expect([outcomes.map(o => o.error), delivered.length]).toEqual([[null, null], 2])
})
