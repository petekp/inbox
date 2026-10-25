import { demoSession } from '../../hooks/demo'
import { emptyState } from './state'
import type { SessionState } from './state'
import { CODEX } from './texts'

export function demoState(now: number): SessionState {
  const s = emptyState('demo')

  return {
    ...s,
    ...demoSession(now, CODEX.agent),
    root: '/demo',
    heard: { ...s.heard, startAt: now },
  }
}
