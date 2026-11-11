import { demoSession } from '../../hooks/demo'
import { herdrEnvelope } from '../../hooks/herdr'
import { sessionView } from '../../hooks/session-view'
import { SETTLED_MS } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import { freshUi } from '../src/draw'
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
