import { demoSession } from '../../hooks/demo'
import { demoAfterPress, demoTurns } from '../../hooks/presses'
import { pressOn, sessionView } from '../../hooks/session'
import type { PanelSource } from './controller'
import { emptyState } from './state'
import type { OmpState } from './state'

export function demoState(now: number): OmpState {
  return { ...emptyState('demo'), ...demoSession(now) }
}

/** A panel source over the shared demo data. A press changes the sample and sends nothing. */
export function demoSource(deps: {
  now(): number
  after(fn: () => void, ms: number): void
  settleWindowMs: number
}): PanelSource {
  let state = demoState(deps.now())
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach(l => l())

  return {
    screen: async holds => ({
      view: sessionView(state, deps.now(), deps.settleWindowMs, true, holds),
      modelName: null,
      isGhMissing: false,
      isFetchingPrs: false,
      stop: null,
      isDemo: true,
    }),
    press: async (p, holds) => {
      const at = deps.now()
      const r = pressOn(state, p, at)
      if ('stale' in r) return { error: null, note: 'stale' }
      const after = demoAfterPress(
        { lastActions: state.lastActions, turns: state.presence },
        r,
        new Set(Object.keys(holds.replies)),
      )
      state = {
        ...state,
        ledger: after.ledger,
        lastActions: after.lastActions,
        presence: { ...state.presence, ...after.turns },
      }
      if (r.effects.some(e => e.kind === 'send'))
        deps.after(() => {
          state = { ...state, presence: { ...state.presence, ...demoTurns(state.presence, [], true) } }
          changed()
        }, deps.settleWindowMs)
      changed()

      return { error: null, note: null }
    },
    resume: async () => null,
    fetchPrsWhenDue: () => {},
    shown: () => {},
    onChange: listener => {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
  }
}
