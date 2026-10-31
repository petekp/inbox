import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { emptySession } from '../hooks/session-files'
import { recorded, withFetchedPrs } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import type { Session } from '../hooks/session'
import type { PrView } from '../types'
import { isPrFetchDue, prFetchTracker } from '../hooks/session-host'
import { DOT } from '../hooks/rows'
import { NO_HOLDS } from '../hooks/timing'
import { applyPrPress } from '../hooks/pr-tab'
import { fetchTracked, GH_RUNS_AT_ONCE, MAX_PRS } from '../hooks/pr-fetch'
import { FIX_REF, BLOCKED_PR } from './session-helpers'

const openPr = (number: number): PrView => ({
  ...BLOCKED_PR,
  ref: `acme/app#${number}`,
  number,
  title: `Work ${number}`,
  url: `https://github.com/acme/app/pull/${number}`,
  mergeable: 'MERGEABLE',
  checks: [],
})

test('an order_prs call ranks its PRs above the rest, links one the session lacks past the PR limit, ranks a merged PR no longer, keeps a dismissed PR’s place for Undo, and an empty call clears it', () => {
  const linked = Array.from({ length: MAX_PRS + 3 }, (_, n) => n + 1)
  const base = emptySession()
  const s: Session = {
    ...base,
    ledger: { ...base.ledger, prs: linked.map(n => `acme/app#${n}`) },
    prViews: { ...base.prViews, views: Object.fromEntries(linked.map(n => [`acme/app#${n}`, openPr(n)])) },
  }
  const at = 1_000_000
  const order = recorded(
    CLAUDE_CODE,
    s,
    'order_prs',
    { repo: 'acme/app', numbers: [3, 20, 1], label: 'Merge in this order', why: '#20 waits on #3.' },
    at,
  )
  expect(order.personLine).toBe('PR order: Merge in this order, 3 PRs')
  expect(order.result).toContain('1 of them was not in the tab yet')
  expect(order.state.ledger.prs.at(-1)).toBe('acme/app#20')
  const fetched = withFetchedPrs(order.state, { 'acme/app#20': openPr(20) }, null, false)
  const tab = (x: Session) => sessionView(x, at + 2 * 60_000, 1000, true, NO_HOLDS).prs
  const ranks = (x: Session) => tab(x).drawn.map(d => [d.pr.number, d.rank])

  expect(ranks(fetched).slice(0, 4)).toEqual([
    [3, 1],
    [20, 2],
    [1, 3],
    [15, null],
  ])
  expect(tab(fetched).drawn).toHaveLength(MAX_PRS + 3)
  expect(tab(fetched).olderText).toBe('1 older PR not shown: #2')
  expect(tab(fetched).order?.title).toBe(`Merge in this order${DOT}set by Claude 2m ago`)
  expect(tab(fetched).order?.why).toBe('#20 waits on #3.')

  const merged = withFetchedPrs(fetched, { 'acme/app#3': { ...openPr(3), state: 'MERGED' } }, null, false)
  expect(ranks(merged).slice(0, 2)).toEqual([
    [20, 1],
    [1, 2],
  ])
  expect(ranks(merged).at(-1)).toEqual([3, null])

  const press = (x: Session, p: Parameters<typeof applyPrPress>[3]) => {
    const r = applyPrPress(x.ledger, x.prViews, x.lastActions, p, { now: at, turnsStarted: 0 })
    if ('stale' in r) throw new Error('stale press')
    return { ...x, ledger: r.ledger, lastActions: { ...x.lastActions, ...r.lasts } }
  }
  const dismissed = press(fetched, { action: 'pr-dismiss', ref: 'acme/app#20' })
  expect(dismissed.ledger.prOrder?.refs).toEqual(['acme/app#3', 'acme/app#20', 'acme/app#1'])
  expect(ranks(dismissed).slice(0, 2)).toEqual([
    [3, 1],
    [1, 2],
  ])
  const undone = press(dismissed, { action: 'pr-undo', ref: 'acme/app#20' })
  expect(ranks(undone).slice(0, 3)).toEqual(ranks(fetched).slice(0, 3))
  const onlyRanked = recorded(
    CLAUDE_CODE,
    fetched,
    'order_prs',
    { repo: 'acme/app', numbers: [20], label: 'Review this first', why: 'It is the smallest.' },
    at,
  ).state
  const showing = { ...NO_HOLDS, shownSince: at - 1 }
  const settling = press(onlyRanked, { action: 'pr-dismiss', ref: 'acme/app#20' })
  expect(sessionView(settling, at + 1000, 60_000, true, showing).prs.order?.title).toBe(
    `Review this first${DOT}set by Claude just now`,
  )

  const cleared = recorded(CLAUDE_CODE, fetched, 'order_prs', { numbers: [] }, at)
  expect(cleared.state.ledger.prOrder).toBeNull()
  expect(cleared.personLine).toBe('PR order cleared')
  expect(tab(cleared.state).order).toBeNull()
  expect(ranks(cleared.state).every(([, rank]) => rank === null)).toBe(true)
  expect(recorded(CLAUDE_CODE, s, 'order_prs', { numbers: [3] }, at).result).toBe('Not set: give repo as owner/name.')
  const unlabeled = recorded(CLAUDE_CODE, s, 'order_prs', { repo: 'acme/app', numbers: [3], why: 'Smallest.' }, at)
  expect(unlabeled.result).toBe('Not set: give label, what the user does with the order.')
  expect(unlabeled.state.ledger.prOrder).toBeNull()
  const unexplained = recorded(CLAUDE_CODE, s, 'order_prs', { repo: 'acme/app', numbers: [3], label: 'Merge' }, at)
  expect(unexplained.result).toBe('Not set: give why, the reason for this order.')
  expect(unexplained.state.ledger.prOrder).toBeNull()
})

test('an order reads as changed once a ranked open PR is newly blocked, gains a waiting thread or failing check, or becomes ready, and Rank again asks the agent to rank its open PRs again until a new order replaces it', () => {
  const base = emptySession()
  const refs = [1, 2, 3, 4].map(n => `acme/app#${n}`)
  const s: Session = {
    ...base,
    ledger: { ...base.ledger, prs: refs.slice(0, 3) },
    prViews: { ...base.prViews, views: Object.fromEntries([1, 2, 3].map(n => [`acme/app#${n}`, openPr(n)])) },
  }
  const at = 1_000_000
  const order = { repo: 'acme/app', label: 'Merge in this order', why: '#2 waits on #1.' }
  const set = recorded(CLAUDE_CODE, s, 'order_prs', { ...order, numbers: [1, 2, 3, 4] }, at).state
  expect(Object.keys(set.ledger.prOrder?.statuses ?? {})).toEqual(refs.slice(0, 3))
  const view = (x: Session, shownSince: number | null = null) =>
    sessionView(x, at + 60_000, 1000, true, { ...NO_HOLDS, shownSince }).prs.order
  expect(view(set)?.changed).toBeNull()

  const failing: PrView = { ...openPr(1), checks: [{ name: 'lint', bucket: 'fail', url: null }] }
  const thread = {
    id: 't1',
    isWaiting: true,
    isLinesChanged: false,
    path: 'a.ts',
    line: 1,
    body: 'Rename it',
    url: '',
    at: null,
  }
  const firstFetch = withFetchedPrs(set, { 'acme/app#1': failing, 'acme/app#4': openPr(4) }, null, false)
  expect(Object.keys(firstFetch.ledger.prOrder?.statuses ?? {})).toEqual(refs)
  expect(view(firstFetch)?.changed?.text).toBe('1 PR changed since')

  const later = withFetchedPrs(
    firstFetch,
    { 'acme/app#2': { ...openPr(2), threads: [thread as never] }, 'acme/app#4': { ...openPr(4), state: 'MERGED' } },
    null,
    false,
  )
  expect(view(later)?.changed?.text).toBe('2 PRs changed since')
  expect(view(later)?.changed?.actions.map(a => [a.label, a.hotkey, a.kind])).toEqual([['Rank again', 'g', 'talk']])

  const r = applyPrPress(
    later.ledger,
    later.prViews,
    later.lastActions,
    { action: 'pr-rank-again' },
    {
      now: at + 60_000,
      turnsStarted: 0,
    },
  )
  if ('stale' in r) throw new Error('stale press')
  expect(r.effects).toEqual([
    {
      kind: 'send',
      text: 'The PR order you set for the PRs tab, "Merge in this order", is out of date: #1 and #2 changed since you set it.\nRank its open PRs in acme/app again (#1, #2, #3), and set the new order with order_prs.',
      by: null,
    },
  ])
  const pressed = { ...later, lastActions: { ...later.lastActions, ...r.lasts } }
  expect(Object.keys(r.lasts)).toEqual(['pr:order'])
  expect(view(pressed)?.changed?.actions[0]?.isOut).toBe(true)

  const reranked = recorded(CLAUDE_CODE, pressed, 'order_prs', { ...order, numbers: [3, 1, 2] }, at + 90_000).state
  const { delivery: _delivery, ...sent } = reranked.lastActions['pr:order']!
  const ranked = {
    ...reranked,
    lastActions: { ...reranked.lastActions, 'pr:order': sent },
    presence: { ...reranked.presence, turnsStarted: 1, turnsApplied: 1 },
  }
  expect(view(ranked, at + 30_000)?.changed).toEqual({ text: null, actions: [], showsPress: true })
  expect(view(ranked, at + 80_000)?.changed).toBeNull()
  const failingThree: PrView = { ...openPr(3), checks: [{ name: 'lint', bucket: 'fail', url: null }] }
  const changedAgain = withFetchedPrs(ranked, { 'acme/app#3': failingThree }, null, false)
  expect(view(changedAgain, at + 30_000)?.changed).toMatchObject({ text: '1 PR changed since', showsPress: false })
  expect(
    applyPrPress(
      ranked.ledger,
      ranked.prViews,
      ranked.lastActions,
      { action: 'pr-rank-again' },
      {
        now: at,
        turnsStarted: 0,
      },
    ),
  ).toEqual({ stale: true })

  const old = {
    ...later,
    ledger: { ...later.ledger, prOrder: { ...later.ledger.prOrder!, why: null, statuses: null } },
  }
  expect(view(old)).toEqual({ title: `Merge in this order${DOT}set by Claude 1m ago`, why: null, changed: null })
  expect(withFetchedPrs(old, { 'acme/app#3': failing }, null, false).ledger.prOrder?.statuses).toBeNull()
})

test('a fetch of many PRs runs at most GH_RUNS_AT_ONCE gh runs at once, and reads every PR', async () => {
  let running = 0
  let most = 0
  const run = async (args: string[]) => {
    running += 1
    most = Math.max(most, running)
    for (let n = 0; n < 3; n++) await Promise.resolve()
    running -= 1
    const number = Number(args[2])
    const view = { number, title: `Work ${number}`, url: `https://github.com/acme/app/pull/${number}`, state: 'OPEN' }

    return { exitCode: 0, stdout: args[0] === 'pr' ? JSON.stringify(view) : '{"data":{}}', stderr: '' }
  }
  const refs = Array.from({ length: 20 }, (_, n) => `acme/app#${n + 1}`)
  const order = { refs, label: null, why: null, statuses: null, by: 'Claude', at: 0 }
  const state = { views: {}, branchRef: null, isFetching: false }
  const fetched = await fetchTracked(run, state, { prs: refs, prOrder: order }, false, () => 5)

  expect(Object.keys(fetched.views)).toHaveLength(20)
  expect(most).toBe(GH_RUNS_AT_ONCE)
})

test('PRs are due for a fetch 15 seconds after the last once the agent replied since it, and otherwise after 2 minutes', () => {
  const s = {
    ...emptySession(),
    ledger: { ...emptySession().ledger, prs: [FIX_REF] },
    prViews: { ...emptySession().prViews, views: { [FIX_REF]: BLOCKED_PR } },
  }
  const repliedAt = (at: number | null) => ({ ...s, presence: { ...s.presence, lastReplyAt: at } })
  expect(isPrFetchDue(repliedAt(1_005_000), 1_000_000, 1_015_000)).toBe(true)
  expect(isPrFetchDue(repliedAt(1_005_000), 1_000_000, 1_014_000)).toBe(false)
  expect(isPrFetchDue(repliedAt(999_000), 1_000_000, 1_015_000)).toBe(false)
  expect(isPrFetchDue(repliedAt(null), 1_000_000, 1_120_000)).toBe(true)
})

test('a fetch a press asks for while another runs starts once that one ends, and presses during one fetch share the next', async () => {
  const tracker = prFetchTracker(() => 1)
  const started: string[] = []
  let endFirst = () => {}
  const first = tracker.fetchNow('s1', () => {
    started.push('first')
    return new Promise<void>(resolve => (endFirst = resolve))
  })
  const pressed = () =>
    tracker.fetchNow('s1', async () => {
      started.push('after')
    })
  const both = [pressed(), pressed()]
  expect(started).toEqual(['first'])
  endFirst()
  await Promise.all([first, ...both])
  expect(started).toEqual(['first', 'after'])
})
