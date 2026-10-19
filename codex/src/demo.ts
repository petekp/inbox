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
    lastActions: d.lastActions,
    prViews: d.prViews,
    subagents: d.work.subagents,
    presence: { ...s.presence, ...d.turns, isTurnRunning: d.work.isTurnRunning, progress: d.work.progress },
    heard: { ...s.heard, startAt: now },
  }
}
