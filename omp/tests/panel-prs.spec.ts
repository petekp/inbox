import { expect, test } from 'bun:test'

import {
  GH_MISSING_TEXT,
  GH_SIGNED_OUT_TEXT,
  prCheckId,
  prMarkId,
  prsEmptyHint,
  prThreadId,
  threadRowText,
  threadSentIn,
} from '../../hooks/pr-rows'
import { cancelledChecks, failingChecks } from '../../hooks/pr-checks'
import { waitingThreads } from '../../hooks/prs'
import { ago } from '../../hooks/text'
import type { LastAction, PrOrder } from '../../types'
import { rankedStatusOf } from '../../hooks/pr-order'
import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { helpKeys } from '../../hooks/help'
import { withFetchedPrs } from '../../hooks/session-presses'
import { sessionView } from '../../hooks/session-view'
import { demoState } from '../src/demo'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { emptyState } from '../src/state'
import { drawn, ESC, NOW, screenOf, text } from './panel-harness'

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

test('an order draws its title and reason above the PR blocks and a dim rank before each ranked PR, ahead of the rest', () => {
  const screen = withOrder({})
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const lines = text(screen, ui).split('\n')
  const title = lines.findIndex(l => l.includes('Merge in this order · set by omp 2m ago'))
  const heads = lines
    .slice(title + 2)
    .flatMap(l => l.match(/(?:\d+\. )?#\d+ /) ?? [])
    .map(h => h.trim())

  expect(title).toBeLessThan(lines.findIndex(l => /#\d+ /.test(l)))
  expect(lines[title + 1]).toContain('#33 builds on #29.')
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2m#33 builds on #29.`)
  expect(heads).toEqual(['1. #29', '2. #33', '#31'])
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2m1. ${ESC}22m`)
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
  expect(handleKey(screen, ui, 'g', NOW).press).toEqual({ action: 'pr-rank-again' })
  expect(handleKey(screen, { ...ui, selectedId: 'pr:order' }, 'enter', NOW).press).toEqual({ action: 'pr-rank-again' })

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
  expect(helpKeys('omp', false, 'prs', false).map(k => k.keys)).toContain('g')
})

test('a PR a fetch finds merged settles as ✓ Merged while the PRs tab shows, and u presses its Undo', () => {
  const s = demoState(NOW)
  const merged = { 'acme/visor#29': { ...s.prViews.views['acme/visor#29']!, state: 'MERGED' as const } }
  const settled = withFetchedPrs(s, merged, s.prViews.branchRef, false, NOW)
  const holds = { ...NO_HOLDS, shownSince: NOW - 1 }
  const screen = screenOf({ view: sessionView(settled, NOW, SETTLED_MS, holds) })
  const ui = { ...INITIAL_UI, tab: 'prs' as const, shownSince: NOW - 1 }
  expect(text(screen, ui)).toMatch(/#29 .*✓ Merged/)
  expect(handleKey(screen, ui, 'u', NOW).press).toEqual({ action: 'pr-undo', ref: 'acme/visor#29' })
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
  const refreshing = withLast(screen, id, {
    kind: 'local',
    action: 'pr-refresh',
    text: 'Refresh PRs',
    at: NOW,
    result: { state: 'pending', at: NOW, parts: [{ kind: 'refresh-prs', name: 'PRs', error: null, isCommand: false }] },
  })
  expect(text(refreshing, ui)).toContain('Refreshing PRs…')
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
  const open = text(pressed, { ...INITIAL_UI, tab: 'prs', selectedId: checkId }).split('\n')
  const buttons = open.findIndex(l => l.includes('Fix again'))
  expect(open[buttons + 1]?.trim()).toBe('✓ Asked to fix')
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
  const result = handleKey(screen, ui, 'a', NOW)
  expect(result.press).toMatchObject({ action: 'thread-address', thread: first.id })
  expect(handleKey(screen, ui, 'enter', NOW).press).toMatchObject({ action: 'thread-address' })
})

test('the PRs tab says when gh is missing, when gh is not signed in, and when there are no PRs', () => {
  const screen = screenOf({ isGhMissing: true })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).toContain(GH_MISSING_TEXT)
  const signedOut = (s: PanelScreen): PanelScreen => ({
    ...s,
    view: { ...s.view, prs: { ...s.view.prs, isGhSignedOut: true } },
  })
  expect(text(signedOut(screenOf()), ui)).toContain(GH_SIGNED_OUT_TEXT)
  expect(text(signedOut(screen), ui)).not.toContain(GH_SIGNED_OUT_TEXT)
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS) }
  expect(text(empty, ui)).toContain('No PRs')
  expect(text(empty, ui)).toContain(prsEmptyHint('session'))
  expect(text(signedOut(empty), ui)).toContain(GH_SIGNED_OUT_TEXT)
  expect(text({ ...empty, isFetchingPrs: true }, ui)).toContain('Checking for PRs…')
})
