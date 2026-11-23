import { expect, test } from 'bun:test'

import {
  GH_MISSING_TEXT,
  GH_SIGNED_OUT_TEXT,
  CLEAR_FINISHED_ID,
  prCheckId,
  prMarkId,
  PR_REFRESH_ID,
  prThreadId,
  threadRowText,
  threadSentIn,
} from '../../core/view/pr-rows'
import { cancelledChecks, failingChecks } from '../../core/domain/pr-checks'
import { prsEmptyHint } from '../../core/view/empty-tab'
import { waitingThreads } from '../../core/domain/prs'
import { ago } from '../../core/domain/text'
import type { LastAction, PrOrder } from '../../types'
import { rankedStatusOf } from '../../core/view/pr-order'
import { SETTLED_MS, NO_HOLDS } from '../../core/view/timing'
import { helpKeys } from '../../core/view/help'
import { withFetchedPrs } from '../../core/runtime/session-presses'
import { sessionView } from '../../core/view/session-view'
import { demoState } from '../src/demo'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { emptyState } from '../src/state'
import { cursorOf, drawn, ESC, keyed, keys, NOW, screenOf, text, withCursorOn } from './panel-harness'

function withOrder(prOrder: Partial<PrOrder>, lastActions: Record<string, LastAction> = {}): PanelScreen {
  const s = demoState(NOW)
  const order: PrOrder = {
    refs: ['acme/visor#29', 'acme/visor#33'],
    label: 'Merge in this order',
    why: '#33 builds on #29.',
    statuses: null,
    dismissed: [],
    by: 'omp',
    at: NOW - 2 * 60_000,
    ...prOrder,
  }
  const ordered = { ...s, ledger: { ...s.ledger, prOrder: order }, lastActions: { ...s.lastActions, ...lastActions } }

  return screenOf({ view: sessionView(ordered, NOW, SETTLED_MS, NO_HOLDS) })
}

test('an order draws its title and reason above the ranked PR blocks, with no rank numbers, and a dim Other PRs line above the rest', () => {
  const screen = withOrder({})
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const lines = text(screen, ui).split('\n')
  const title = lines.findIndex(l => l.includes('Merge in this order · set by omp 2m ago'))
  const heads = lines
    .slice(title + 2)
    .flatMap(l => l.match(/(?:\d+\. )?#\d+ |Other PRs/) ?? [])
    .map(h => h.trim())

  expect(title).toBeLessThan(lines.findIndex(l => /#\d+ /.test(l)))
  expect(lines[title + 1]).toContain('#33 builds on #29.')
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2m#33 builds on #29.`)
  expect(heads).toEqual(['#29', '#33', 'Other PRs', '#31'])
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2mOther PRs`)
  expect(text(screen, ui)).not.toContain('changed since')
  expect(text(screenOf(), ui)).not.toContain('Merge in this order')
})

test('a ranked PR that changed since the order draws the changed line with Rank again, which g from any row or Enter on it presses, and its status once pressed', () => {
  const views = demoState(NOW).prViews.views
  const was = rankedStatusOf(views['acme/visor#29']!)
  const statuses = {
    'acme/visor#29': { ...was, status: was.status === 'ready' ? ('waiting' as const) : ('ready' as const) },
    'acme/visor#33': rankedStatusOf(views['acme/visor#33']!),
  }
  const screen = withOrder({ statuses })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const lines = text(screen, ui).split('\n')
  const changed = lines.findIndex(l => l.includes('1 PR changed since'))

  expect(changed).toBe(lines.findIndex(l => l.includes('#33 builds on #29.')) + 1)
  expect(lines[changed]).toContain('g Rank again')
  expect(keyed(screen, ui, 'g', NOW).press).toEqual({ action: 'pr-rank-again' })
  expect(keyed(screen, withCursorOn({ ...ui }, 'pr:order'), 'enter', NOW).press).toEqual({ action: 'pr-rank-again' })

  const pressed = withOrder(
    { statuses },
    {
      'pr:order': {
        kind: 'talk',
        action: 'pr-rank-again',
        text: 'Rank again',
        at: NOW,
        turnsStarted: demoState(NOW).presence.turnsStarted,
      },
    },
  )
  expect(text(pressed, ui)).toMatch(/1 PR changed since\s+g Rank again\s+Ranking…/)
  const narrow = text(pressed, ui, 40).split('\n')
  const at = narrow.findIndex(l => l.includes('1 PR changed since'))
  expect(narrow[at]).toContain('g Rank again')
  expect(narrow[at + 1]?.trim()).toBe('Ranking…')
  expect(helpKeys('omp').map(k => k.keys)).toContain('g')
})

function withFinished(states: Record<string, 'MERGED' | 'CLOSED'>): PanelScreen {
  const s = demoState(NOW)
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).map(([ref, v]) => [ref, states[ref] ? { ...v, state: states[ref] } : v]),
  )

  return screenOf({ view: sessionView({ ...s, prViews: { ...s.prViews, views } }, NOW, SETTLED_MS, NO_HOLDS) })
}

test('Clear merged and closed draws above the PR blocks, and m from any row or Enter on it returns the press', () => {
  const screen = withFinished({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const lines = text(screen, ui).split('\n')
  const at = lines.findIndex(l => l.includes('m Clear merged and closed'))
  expect(at).toBeGreaterThan(-1)
  expect(at).toBeLessThan(lines.findIndex(l => /#(29|31|33) /.test(l)))
  const onThread = withCursorOn(
    ui,
    screen.view.prs.drawn.flatMap(d => waitingThreads(d.pr).map(t => `${d.pr.ref} thread ${t.id}`))[0]!,
  )
  expect(keyed(screen, onThread, 'm', NOW).press).toEqual({ action: 'pr-clear-finished' })
  expect(keyed(screen, withCursorOn({ ...ui }, CLEAR_FINISHED_ID), 'enter', NOW).press).toEqual({
    action: 'pr-clear-finished',
  })
  expect(helpKeys('omp').map(k => k.keys)).toContain('m')
})

test('the PRs tab opens with Clear merged and closed unselected when no PR waits, so Enter does not clear', () => {
  const s = demoState(NOW)
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).map(([ref, v]) => [
      ref,
      {
        ...v,
        state: ref === 'acme/visor#29' ? ('MERGED' as const) : v.state,
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        checks: [],
        threads: [],
      },
    ]),
  )
  const screen = screenOf({ view: sessionView({ ...s, prViews: { ...s.prViews, views } }, NOW, SETTLED_MS, NO_HOLDS) })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).toContain('Clear merged and closed')
  expect(keyed(screen, ui, 'enter', NOW).press).not.toEqual({ action: 'pr-clear-finished' })
})

test('Clear merged and closed does not show when the only finished PR is the branch’s own', () => {
  const screen = withFinished({ 'acme/visor#31': 'MERGED' })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).not.toContain('Clear merged and closed')
  expect(keyed(screen, ui, 'm', NOW).press).toBeUndefined()
})

const refreshDone = (at: number): LastAction => ({
  kind: 'local',
  action: 'pr-refresh',
  text: 'Refresh PRs',
  at,
  result: { state: 'done', at, parts: [{ kind: 'refresh-prs', name: 'PRs', error: null, isCommand: false }] },
})

const cursorLine = (screen: PanelScreen, ui: PanelUi) =>
  text(screen, ui)
    .split('\n')
    .find(l => l.includes('❯'))

function steppedTo(screen: PanelScreen, ui: PanelUi, id: string): PanelUi {
  let at = ui
  for (let n = 0; n < 20 && cursorOf(at) !== id; n++) at = keys(screen, at, 'k')
  if (cursorOf(at) !== id) throw new Error(`k never reached ${id}`)

  return at
}

test('after Refresh PRs reads the PR that could not be read, the cursor stays on its line, Enter presses nothing, and the tab shown again opens at its first waiting row', () => {
  const failed = demoState(NOW)
  const [first] = screenOf().view.prs.drawn
  if (!first) throw new Error('the demo draws no PR')
  const ref = first.pr.ref
  const view = failed.prViews.views[ref]
  if (!view) throw new Error(`the demo has no view of ${ref}`)
  failed.prViews.views[ref] = { ...view, error: 'HTTP 502' }
  const shownSince = NOW - 60_000
  const before = screenOf({ view: sessionView(failed, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince }) })
  const onRefresh = steppedTo(before, { ...INITIAL_UI, tab: 'prs', shownSince }, PR_REFRESH_ID)
  expect(keyed(before, onRefresh, 'enter', NOW).press).toEqual({ action: 'pr-refresh' })

  const read = demoState(NOW)
  read.lastActions[PR_REFRESH_ID] = refreshDone(NOW - 1_000)
  const after = screenOf({ view: sessionView(read, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince }) })
  expect(cursorLine(after, onRefresh)).toContain('Refreshed PRs')
  expect(keyed(after, onRefresh, 'enter', NOW).press).toBeUndefined()
  expect(keyed(after, onRefresh, 'enter', NOW).sent).toEqual([])

  const back = keys(after, onRefresh, '2', '4')
  expect(cursorOf(back)).toBeNull()
  expect(cursorLine(after, back)).toBe(cursorLine(after, { ...INITIAL_UI, tab: 'prs', shownSince }))
  expect(cursorLine(after, back)).not.toContain('Refreshed PRs')
})

test('after Clear merged and closed leaves the PRs tab, the cursor rests on no line and Enter presses nothing', () => {
  const finished = withFinished({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' })
  const onClear = steppedTo(finished, { ...INITIAL_UI, tab: 'prs' }, CLEAR_FINISHED_ID)
  expect(keyed(finished, onClear, 'enter', NOW).press).toEqual({ action: 'pr-clear-finished' })

  const cleared = screenOf()
  expect(text(cleared, onClear)).not.toContain('Clear merged and closed')
  expect(cursorLine(cleared, onClear)).toBeUndefined()
  expect(keyed(cleared, onClear, 'enter', NOW).press).toBeUndefined()
  expect(cursorOf(keys(cleared, onClear, 'j'))).not.toBe(CLEAR_FINISHED_ID)
})

test('a PR a fetch finds merged settles as ✓ Merged while the PRs tab shows, and u presses its Undo', () => {
  const s = demoState(NOW)
  const merged = { 'acme/visor#29': { ...s.prViews.views['acme/visor#29']!, state: 'MERGED' as const } }
  const settled = withFetchedPrs(s, merged, s.prViews.branchRef, false, NOW)
  const holds = { ...NO_HOLDS, shownSince: NOW - 1 }
  const screen = screenOf({ view: sessionView(settled, NOW, SETTLED_MS, holds) })
  const ui = { ...INITIAL_UI, tab: 'prs' as const, shownSince: NOW - 1 }
  expect(text(screen, ui)).toMatch(/#29 .*✓ Merged/)
  expect(keyed(screen, ui, 'u', NOW).press).toEqual({ action: 'pr-undo', ref: 'acme/visor#29' })
})

function withLast(screen: PanelScreen, id: string, last: LastAction): PanelScreen {
  return { ...screen, view: { ...screen.view, lastActions: { ...screen.view.lastActions, [id]: last } } }
}

test('a local press reads its pending and failed results on the PR block', () => {
  const screen = screenOf()
  const block = screen.view.prs.drawn[0]!.pr
  const id = `pr:${block.ref}`
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const pending = withLast(screen, id, {
    kind: 'local',
    action: 'pr-open',
    text: 'Open PR',
    at: NOW,
    result: {
      state: 'pending',
      at: NOW,
      parts: [{ kind: 'open', name: `PR #${block.number}`, error: null, isCommand: false }],
    },
  })
  expect(text(pending, ui)).toContain(`Opening PR #${block.number}…`)
  const refreshing = withLast(screen, PR_REFRESH_ID, {
    kind: 'local',
    action: 'pr-refresh',
    text: 'Refresh PRs',
    at: NOW,
    result: { state: 'pending', at: NOW, parts: [{ kind: 'refresh-prs', name: 'PRs', error: null, isCommand: false }] },
  })
  expect(
    text(refreshing, ui)
      .split('\n')
      .findIndex(l => l.includes('Refreshing PRs…')),
  ).toBeLessThan(
    text(refreshing, ui)
      .split('\n')
      .findIndex(l => /#\d+ /.test(l)),
  )
  const failed = withLast(screen, id, {
    kind: 'local',
    action: 'pr-open',
    text: 'Open PR',
    at: NOW,
    result: {
      state: 'failed',
      at: NOW,
      parts: [{ kind: 'open', name: `PR #${block.number}`, error: 'no browser', isCommand: false }],
    },
  })
  expect(text(failed, ui)).toContain(`Could not open PR #${block.number}: no browser`)
})

test('a press on the PRs tab says when it was made, and a failing check keeps Asked to fix under its buttons when open', () => {
  const screen = screenOf()
  const { pr } = screen.view.prs.drawn[0]!
  const check = failingChecks(pr)[0]!
  const checkId = prCheckId(pr, check)
  const resolving = withLast(screen, prMarkId(pr.ref), {
    kind: 'handoff',
    action: 'pr-conflicts',
    text: 'Resolve conflicts',
    at: NOW - 5 * 60_000,
  })
  const pressed = withLast(resolving, checkId, {
    kind: 'handoff',
    action: 'check-fix',
    text: 'Fix',
    at: NOW - 14 * 60_000,
  })
  const drawn = text(pressed, { ...INITIAL_UI, tab: 'prs' })
  expect(drawn).toMatch(/✓ Asked to resolve conflicts\s+5m ago/)
  expect(drawn).toMatch(/Addressed\s+2m ago/)
  expect(drawn).toMatch(new RegExp(`${check.name}\\s+✓ Asked to fix\\s+14m ago`))
  const open = text(pressed, withCursorOn({ ...INITIAL_UI, tab: 'prs' }, checkId)).split('\n')
  const buttons = open.findIndex(l => l.includes('Fix again'))
  expect(open[buttons + 1]?.replace(/^ │ /, '').trim()).toBe('✓ Asked to fix')
})

test('a thread row reads its comment’s time and a check row its finish time before any press', () => {
  const screen = screenOf()
  const { pr } = screen.view.prs.drawn[0]!
  const lines = text(screen, { ...INITIAL_UI, tab: 'prs' }).split('\n')
  const rowOf = (title: string) => lines.find(l => l.includes(title)) ?? ''
  const isUnpressed = (id: string) => screen.view.lastActions[id] === undefined
  const threads = waitingThreads(pr).filter(t => t.at !== null && isUnpressed(prThreadId(pr, t)))
  const checks = [...failingChecks(pr), ...cancelledChecks(pr)].filter(c => isUnpressed(prCheckId(pr, c)))

  expect(threads.length).toBeGreaterThan(0)
  expect(checks.length).toBeGreaterThan(0)
  for (const t of threads) expect(rowOf(threadRowText(pr, t, {}).title)).toMatch(new RegExp(`${ago(NOW - t.at!)}\\s*$`))
  for (const c of checks) expect(rowOf(`/ ${c.name}`)).toMatch(new RegExp(`${ago(NOW - c.finishedAt!)}\\s*$`))
})

test('the PRs tab opens on the first thread that waits, and its press goes through the PR press', () => {
  const screen = screenOf()
  const { pr } = screen.view.prs.drawn[0]!
  const first = waitingThreads(pr).find(t => !threadSentIn(screen.view.lastActions)(pr, t))!
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const result = keyed(screen, ui, 'a', NOW)
  expect(result.press).toMatchObject({ action: 'thread-address', thread: first.id })
  expect(keyed(screen, ui, 'enter', NOW).press).toMatchObject({ action: 'thread-address' })
})

test('the PRs tab says when gh is missing, when gh is not signed in, and when there are no PRs', () => {
  const withGh = (s: PanelScreen, gh: PanelScreen['view']['prs']['gh']): PanelScreen => ({
    ...s,
    view: { ...s.view, prs: { ...s.view.prs, gh } },
  })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(withGh(screenOf({ isGhMissing: true }), { is: 'unavailable', why: 'gh-missing' }), ui)).toContain(
    GH_MISSING_TEXT,
  )
  const signedOut = (s: PanelScreen) => withGh(s, { is: 'unavailable', why: 'gh-signed-out' })
  expect(text(signedOut(screenOf()), ui)).toContain(GH_SIGNED_OUT_TEXT)
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS) }
  expect(text(empty, ui)).toContain('No PRs')
  expect(text(empty, ui)).toContain(prsEmptyHint('session'))
  expect(text(signedOut(empty), ui)).toContain(GH_SIGNED_OUT_TEXT)
  expect(text({ ...empty, isFetchingPrs: true }, ui)).toContain('Checking for PRs…')
})
