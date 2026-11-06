import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { emptySession } from '../hooks/session-files'
import { recorded, withFetchedPrs } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import type { PrView, Session } from '../types'
import { isPrFetchDue, prFetchTracker } from '../hooks/host-prs'
import { DOT } from '../hooks/rows'
import { NO_HOLDS } from '../hooks/timing'
import { applyPrPress } from '../hooks/pr-tab'
import { MAX_PRS } from '../hooks/pr-fetch'
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

test('an order_prs call ranks its PRs above the rest, tracks one the session lacks past the PR limit without linking it, ranks a merged PR no longer and takes it off a tab no look shows, keeps a dismissed PR’s place for Undo, and an empty call clears it', () => {
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
  expect(order.state.ledger.prs).toEqual(s.ledger.prs)
  const fetched = withFetchedPrs(order.state, { 'acme/app#20': openPr(20) }, null, false, 1)
  const tab = (x: Session) => sessionView(x, at + 2 * 60_000, 1000, NO_HOLDS).prs
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

  const merged = withFetchedPrs(fetched, { 'acme/app#3': { ...openPr(3), state: 'MERGED' } }, null, false, 1)
  expect(ranks(merged).slice(0, 2)).toEqual([
    [20, 1],
    [1, 2],
  ])
  expect(ranks(merged).map(([n]) => n)).not.toContain(3)

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
  expect(sessionView(settling, at + 1000, 60_000, showing).prs.order?.title).toBe(
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

const linkedSession = (numbers: number[]): Session => {
  const base = emptySession()
  return {
    ...base,
    ledger: { ...base.ledger, prs: numbers.map(n => `acme/app#${n}`) },
    prViews: { ...base.prViews, views: Object.fromEntries(numbers.map(n => [`acme/app#${n}`, openPr(n)])) },
  }
}

const orderedAndFetched = (s: Session, numbers: number[], at: number): Session => {
  const ordered = recorded(
    CLAUDE_CODE,
    s,
    'order_prs',
    { repo: 'acme/app', numbers, label: 'Review in this order', why: 'Smallest first.' },
    at,
  ).state
  const views = Object.fromEntries(numbers.map(n => [`acme/app#${n}`, openPr(n)]))

  return withFetchedPrs(ordered, views, null, false, 1)
}

const drawnNumbers = (s: Session, at: number) => sessionView(s, at, 1000, NO_HOLDS).prs.drawn.map(d => d.pr.number)

test('clearing an order takes the PRs only it ranked off the tab, keeps a ranked PR the session linked, and frees their places under the PR limit', () => {
  const linked = Array.from({ length: MAX_PRS }, (_, n) => n + 1)
  const s = linkedSession(linked)
  const at = 1_000_000
  const ordered = orderedAndFetched(s, [40, 41, 2], at)
  expect(drawnNumbers(ordered, at).slice(0, 3)).toEqual([40, 41, 2])

  const cleared = recorded(CLAUDE_CODE, ordered, 'order_prs', { numbers: [] }, at).state
  expect(cleared.ledger.prs).toEqual(s.ledger.prs)
  expect(drawnNumbers(cleared, at).sort((a, b) => a - b)).toEqual(linked)
  expect(sessionView(cleared, at, 1000, NO_HOLDS).prs.olderText).toBeNull()
})

test('a new order takes the PRs only the order it replaces ranked off the tab, and keeps the session’s own PRs under the PR limit', () => {
  const linked = Array.from({ length: MAX_PRS }, (_, n) => n + 1)
  const s = linkedSession(linked)
  const at = 1_000_000
  const first = orderedAndFetched(s, [40, 41], at)
  const replaced = orderedAndFetched(first, [3], at)

  expect(replaced.ledger.prs).toEqual(s.ledger.prs)
  expect(drawnNumbers(replaced, at)).not.toContain(40)
  expect(drawnNumbers(replaced, at)).not.toContain(41)
  expect(drawnNumbers(replaced, at).sort((a, b) => a - b)).toEqual(linked)
  expect(sessionView(replaced, at, 1000, NO_HOLDS).prs.olderText).toBeNull()
})

const pressed = (s: Session, p: Parameters<typeof applyPrPress>[3], at: number) => {
  const r = applyPrPress(s.ledger, s.prViews, s.lastActions, p, { now: at, turnsStarted: 0 })
  if ('stale' in r) return null
  const lastActions = Object.fromEntries(
    Object.entries({ ...s.lastActions, ...r.lasts }).filter(([id]) => !r.drop.includes(id)),
  )
  return { ...s, ledger: r.ledger, lastActions }
}

test('after the order is cleared a dismissed PR stays off the tab, and Undo links it again only if the session had linked it', () => {
  const s = linkedSession([1, 2])
  const at = 1_000_000
  const ordered = orderedAndFetched(s, [40, 2], at)
  const clear = (x: Session) => recorded(CLAUDE_CODE, x, 'order_prs', { numbers: [] }, at).state

  const linkedGone = pressed(ordered, { action: 'pr-dismiss', ref: 'acme/app#2' }, at)!
  expect(drawnNumbers(clear(linkedGone), at)).toEqual([1])
  expect(pressed(clear(linkedGone), { action: 'pr-undo', ref: 'acme/app#2' }, at)?.ledger.prs).toEqual([
    'acme/app#1',
    'acme/app#2',
  ])

  const rankedGone = pressed(ordered, { action: 'pr-dismiss', ref: 'acme/app#40' }, at)!
  expect(rankedGone.ledger.prOrder?.dismissed).toEqual(['acme/app#40'])
  const undone = pressed(rankedGone, { action: 'pr-undo', ref: 'acme/app#40' }, at)!
  expect(undone.ledger.prs).toEqual(s.ledger.prs)
  expect(drawnNumbers(undone, at)).toContain(40)
  expect(drawnNumbers(clear(undone), at)).not.toContain(40)
  expect(pressed(clear(rankedGone), { action: 'pr-undo', ref: 'acme/app#40' }, at)).toBeNull()
})

test('a fetch that finds a ranked PR merged settles its block as Merged under the ranked PRs, keeps it in the order for Undo, and Undo keeps it on the tab for good', () => {
  const s = linkedSession([1])
  const at = 1_000_000
  const ordered = orderedAndFetched(s, [40, 1], at)
  const mergedView = { 'acme/app#40': { ...openPr(40), state: 'MERGED' as const } }
  const merged = withFetchedPrs(ordered, mergedView, null, false, at)
  expect(merged.ledger.prOrder?.dismissed).toEqual(['acme/app#40'])
  expect(merged.ledger.prOrder?.refs).toEqual(['acme/app#40', 'acme/app#1'])
  const shown = sessionView(merged, at, 1000, { ...NO_HOLDS, shownSince: at - 1 }).prs.drawn
  expect(shown.map(d => [d.pr.number, d.state.is === 'settled' && [d.state.label, d.state.canUndo]])).toEqual([
    [1, false],
    [40, ['Merged', true]],
  ])
  expect(drawnNumbers(merged, at)).toEqual([1])

  const kept = pressed(merged, { action: 'pr-undo', ref: 'acme/app#40' }, at)!
  expect(kept.ledger.prOrder?.dismissed).toEqual([])
  expect(withFetchedPrs(kept, mergedView, null, false, at + 1).ledger.prOrder?.dismissed).toEqual([])
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
    sessionView(x, at + 60_000, 1000, { ...NO_HOLDS, shownSince }).prs.order
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
  const firstFetch = withFetchedPrs(set, { 'acme/app#1': failing, 'acme/app#4': openPr(4) }, null, false, 1)
  expect(Object.keys(firstFetch.ledger.prOrder?.statuses ?? {})).toEqual(refs)
  expect(view(firstFetch)?.changed?.text).toBe('1 PR changed since')

  const later = withFetchedPrs(
    firstFetch,
    { 'acme/app#2': { ...openPr(2), threads: [thread as never] }, 'acme/app#4': { ...openPr(4), state: 'MERGED' } },
    null,
    false,
    1,
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
  const changedAgain = withFetchedPrs(ranked, { 'acme/app#3': failingThree }, null, false, 1)
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
  expect(withFetchedPrs(old, { 'acme/app#3': failing }, null, false, 1).ledger.prOrder?.statuses).toBeNull()
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
