// The tab's demo: the mod's `/inbox demo` samples as a session, kept in the
// server's memory. Presses change only this copy and send nothing to Codex.

import { demoView } from '../../hooks/demo'
import { emptyState } from './state'
import type { SessionState } from './state'

export function demoState(now: number): SessionState {
  const d = demoView(now)
  const s = emptyState('demo')

  return {
    ...s,
    root: '/demo',
    ledger: d.ledger,
    checks: d.checks,
    lastActions: d.lastActions,
    presence: { ...s.presence, ...d.turns },
  }
}
