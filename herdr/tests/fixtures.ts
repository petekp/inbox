import type { Session } from '../../types'
import { demoSession } from '../../core/view/demo'
import { herdrEnvelope } from '../../core/remote/herdr-envelope'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import type { ShownTab } from '../../core/view/tabs'
import { applyPrPress } from '../../core/view/pr-tab'
import { tabBlocks } from '../src/draw'
import type { LookScreen, LookUi } from '../src/draw'
import type { Block } from '../src/blocks'

export const NOW = Date.UTC(2026, 10, 10, 12)
export const AGENT = 'Claude'

export const demoEnvelopeText = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    ...herdrEnvelope(
      { host: 'claude-code', agent: AGENT, sessionId: 's1', terminal: 't1', writtenAt: NOW },
      demoSession(NOW, AGENT),
    ),
    ...overrides,
  })

function readSample(): Session {
  const s = demoSession(NOW, AGENT)
  const views = Object.fromEntries(Object.entries(s.prViews.views).map(([ref, v]) => [ref, { ...v, fetchedAt: NOW }]))

  return { ...s, prViews: { ...s.prViews, views } }
}

export function demoScreen(sample = readSample()): LookScreen {
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const view = sessionView(sample, NOW, SETTLED_MS, holds)

  return { view, agent: AGENT, now: NOW, shownSince: NOW, isGhMissing: false, isFetchingPrs: false }
}

export const uiOn = (tab: ShownTab, changes: Partial<LookUi> = {}): LookUi => ({
  tab,
  selected: null,
  unfolded: [],
  closedAll: [],
  optionsShown: [],
  statusUnfolded: [],
  typing: null,
  ...changes,
})

export function finishedScreen(states: Record<string, 'MERGED' | 'CLOSED'>): LookScreen {
  const s = readSample()
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).map(([ref, v]) => [ref, states[ref] ? { ...v, state: states[ref] } : v]),
  )
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }

  return { ...demoScreen(), view: sessionView({ ...s, prViews: { ...s.prViews, views } }, NOW, SETTLED_MS, holds) }
}

export function dismissedPr(ref: string, at = NOW - 500, undoOut: string[] = [], s = readSample()) {
  const r = applyPrPress(
    s.ledger,
    s.prViews,
    s.lastActions,
    { action: 'pr-dismiss', ref },
    { now: at, turnsStarted: 0 },
  )
  if ('stale' in r) throw new Error('the Dismiss was stale')
  const listInput = at < NOW - SETTLED_MS ? { since: at, last: NOW - 100 } : null
  const shownSince = Math.min(NOW - 1000, at - 500)
  const holds = { replies: {}, discarded: {}, shownSince, listInput, undoOut }
  const view = sessionView(
    { ...s, ledger: r.ledger, lastActions: { ...s.lastActions, ...r.lasts } },
    NOW,
    SETTLED_MS,
    holds,
  )
  return { view, blocks: tabBlocks({ ...demoScreen(s), view, shownSince }, uiOn('prs')) }
}

export function dismissedSession(id: string, at: number) {
  const s = demoSession(NOW, AGENT)
  const item = s.ledger.items.find(i => i.id === id)!
  const dismissed = {
    ...s.ledger.closed[0]!,
    id,
    ask: item.ask,
    at,
    how: 'dismissed' as const,
    outcome: 'dismissed',
    item,
  }
  const ledger = { ...s.ledger, items: s.ledger.items.filter(i => i !== item), closed: [...s.ledger.closed, dismissed] }

  return { ...s, ledger }
}

export function withDismissedAsk(id: string, at: number) {
  const holds = { replies: {}, discarded: {}, shownSince: NOW - 1000, listInput: null }
  return {
    ...demoScreen(),
    view: sessionView(dismissedSession(id, at), NOW, SETTLED_MS, holds),
    shownSince: NOW - 1000,
  }
}

export const ALL = ['d11', 'd12', 'd13', 'd15']

export function asks(
  keep: string[],
  selected: string | null = null,
  added: { from: string; id: string } | null = null,
  collapsed: string[] = [],
): Block[] {
  const screen = demoScreen()
  const view = screen.view
  const questions = view.needsYou.questions.filter(r => keep.includes(r.id))
  const from = view.needsYou.questions.find(r => r.id === added?.from)
  if (added && from) questions.unshift({ ...from, id: added.id })

  return tabBlocks(
    { ...screen, view: { ...view, collapsed, needsYou: { ...view.needsYou, questions } } },
    uiOn('needsYou', { selected }),
  )
}
