import { demoSession } from '../../hooks/demo'
import { herdrEnvelope } from '../../hooks/herdr'
import { sessionView } from '../../hooks/session-view'
import { SETTLED_MS } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import { applyPrPress } from '../../hooks/pr-tab'
import { freshUi, tabBlocks } from '../src/draw'
import type { LookScreen, LookUi } from '../src/draw'

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

export function demoScreen(isNextBuild = true): LookScreen {
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const view = sessionView(demoSession(NOW, AGENT), NOW, SETTLED_MS, holds)

  return { view, agent: AGENT, now: NOW, shownSince: NOW, isNextBuild, isGhMissing: false }
}

export const uiOn = (tab: ShownTab, changes: Partial<LookUi> = {}): LookUi => ({ ...freshUi(tab), ...changes })

export function finishedScreen(states: Record<string, 'MERGED' | 'CLOSED'>): LookScreen {
  const s = demoSession(NOW, AGENT)
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).map(([ref, v]) => [ref, states[ref] ? { ...v, state: states[ref] } : v]),
  )
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }

  return { ...demoScreen(), view: sessionView({ ...s, prViews: { ...s.prViews, views } }, NOW, SETTLED_MS, holds) }
}

export function dismissedPr(ref: string) {
  const s = demoSession(NOW, AGENT)
  const r = applyPrPress(
    s.ledger,
    s.prViews,
    s.lastActions,
    { action: 'pr-dismiss', ref },
    { now: NOW - 500, turnsStarted: 0 },
  )
  if ('stale' in r) throw new Error('the Dismiss was stale')
  const holds = { replies: {}, discarded: {}, shownSince: NOW - 1000, listInput: null }
  const view = sessionView(
    { ...s, ledger: r.ledger, lastActions: { ...s.lastActions, ...r.lasts } },
    NOW,
    SETTLED_MS,
    holds,
  )
  return { view, blocks: tabBlocks({ ...demoScreen(), view, shownSince: NOW - 1000 }, uiOn('prs')) }
}

export function withDismissedAsk(id: string, at: number) {
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
  const holds = { replies: {}, discarded: {}, shownSince: NOW - 1000, listInput: null }
  return { ...demoScreen(), view: sessionView({ ...s, ledger }, NOW, SETTLED_MS, holds), shownSince: NOW - 1000 }
}
