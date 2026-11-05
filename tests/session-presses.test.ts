import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { endTurn, notePrompt, turnEnded, turnStarted } from '../hooks/session-turns'
import { pressOn, recorded, withFetchedPrs } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import type { PrView, RowNote } from '../types'
import { runUpdates } from '../hooks/session-host'
import { press, wakeAfterSettle } from '../hooks/host-press'
import { allRows } from '../hooks/rows'
import { COMPARE_LIMIT_MS, NO_HOLDS } from '../hooks/timing'
import { feedbackOf, feedbackText } from '../hooks/feedback'
import { checkRowId, isBlockPressShown, prBlockRows, prMarkId, prRowWaits } from '../hooks/pr-rows'
import { checkActions } from '../hooks/pr-tab'
import { prPressEffect } from '../hooks/pr-press'
import { upgradeSession } from '../hooks/session-files'
import { EMPTY } from '../hooks/ledger'
import { checkKey } from '../hooks/prs'
import { fakeHost } from './session-fake-host'
import { FIX_REF, BLOCKED_PR } from './session-helpers'

test('a refused Done message leaves its row reading Not sent, with Undo', async () => {
  let clock = 1_000_000
  const scripted = fakeHost(async () => null).host
  const host = {
    ...scripted,
    now: () => clock,
    deliver: async () => ({ state: 'rejected' as const, reason: 'queue refused' }),
  }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'done', id }, false, NO_HOLDS)
  clock += host.settleWindowMs
  await wakeAfterSettle(host)
  const view = sessionView(await host.read(), clock, host.settleWindowMs)

  expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual([{ error: 'queue refused', canUndo: true }])
})

async function pressedCompare() {
  const { host } = fakeHost(async () => 'NONE')
  const call = async (tool: 'record' | 'close', args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, tool, args, await host.now())
      result = r.result
      return r.state
    })
    return result
  }
  const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'In-memory'] }
  await call('record', question)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await host.update(async s => turnStarted(s, await host.now()))
  const compared = { ...question, steps: ['/tmp/project/.scratch/compare/caches.html'] }

  return { host, call, id, compared }
}

test('a close with a reason of a question recorded again after its Compare press is refused in that turn, and takes effect in a later one', async () => {
  const { host, call, id, compared } = await pressedCompare()
  await call('record', compared)

  expect(await call('close', { id, reason: 'replaced by the compared copy' })).toBe(
    'Not closed: your record updated this question, and it stays open for the user.',
  )
  expect((await host.read()).ledger.items.map(i => i.id)).toEqual([id])

  await host.update(async s => turnEnded(endTurn(CLAUDE_CODE, s, 'I pick Redis.', false), await host.now()))
  await host.update(async s => turnStarted(s, await host.now()))
  expect(await call('close', { id, reason: 'the person dropped caching' })).toMatch(/^Closed\./)
})

test('a record after the agent closed the question with a reason in its Compare turn reopens that question and updates it', async () => {
  const { host, call, id, compared } = await pressedCompare()

  expect(await call('close', { id, reason: 'replaced by the compared copy' })).toMatch(/^Closed\./)
  expect(await call('record', compared)).toBe('Already open, so this record updated it and added its new steps.')
  const { ledger } = await host.read()
  expect(ledger.items.map(i => i.id)).toEqual([id])
  expect(ledger.closed.map(c => c.id)).toEqual([])
})

test("a close with the person's answer after a Compare press takes effect", async () => {
  const { host, call, id, compared } = await pressedCompare()
  await call('record', compared)

  expect(await call('close', { id, answer: 'Redis' })).toMatch(/^Closed\./)
  expect((await host.read()).ledger.items).toEqual([])
})

test('Compare reads Comparing… after its reply until the agent records the question again with its page, or until its limit passes', async () => {
  const { host, delivered } = fakeHost(async () => 'NONE')
  const record = async (args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, 'record', args, await host.now())
      result = r.result
      return r.state
    })
    return result
  }
  const turn = async (prompt: string, reply: string) => {
    await host.update(s => notePrompt(CLAUDE_CODE, s, prompt, false).state)
    await host.update(s => endTurn(CLAUDE_CODE, s, reply, false))
    await runUpdates(host)
  }
  const question = {
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    design_choice: true,
  }
  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add caching to the API', false).state)
  await record(question)
  await host.update(s => endTurn(CLAUDE_CODE, s, 'Which cache should the API use?', false))
  await runUpdates(host)
  const id = (await host.read()).ledger.items[0]!.id
  const row = async (later = 0) => {
    const view = sessionView(await host.read(), (await host.now()) + later, host.settleWindowMs)
    const r = allRows(view).find(x => x.id === id)!

    return { feedback: r.feedback && feedbackText(r.feedback, 'terminal'), actions: r.actions.map(a => a.label) }
  }

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  })
  expect(await row(COMPARE_LIMIT_MS)).toEqual({
    feedback: 'No comparison came back',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  const reported = await record({ ...question, steps: ['/tmp/project/.scratch/compare/caches.html', 'npm test'] })
  expect(reported).toBe(
    'Already open, so this record updated it and added its new steps. Some steps were not an absolute file path or a link, so they are left out.',
  )
  expect(await row()).toEqual({
    feedback: '✓ Compared',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches again.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })
})

test('while a press is out, its button stays out and a second press sends nothing, even when a newer note shows on the row', async () => {
  const { host } = fakeHost(async () => null)
  const question = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, 1).state)
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

async function blockedPrHost(refreshed: (pr: PrView, at: number) => PrView, start: PrView = BLOCKED_PR) {
  const { host, delivered } = fakeHost(async () => null)
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: start } },
  }))
  const shownWhileRefreshing: string[] = []
  const shownOn = async (rowId: string) => {
    const s = await host.read()
    const f = feedbackOf(rowId, s.lastActions[rowId], undefined, s.presence, await host.now())
    return f ? feedbackText(f, 'terminal') : null
  }
  host.refreshPrs = async () => {
    for (const id of [prMarkId(FIX_REF), checkRowId(FIX_REF, 'test')]) {
      const text = await shownOn(id)
      if (text) shownWhileRefreshing.push(text)
    }
    const at = await host.now()
    await host.update(s => withFetchedPrs(s, { [FIX_REF]: refreshed(s.prViews.views[FIX_REF]!, at) }, null, false))
  }

  return { host, delivered, shownWhileRefreshing, shownOn }
}

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
      await still.host.update(s => endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, text, false).state, 'Done.', false))
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
