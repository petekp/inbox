import { demoSession } from '../../core/view/demo'
import { isCompareInBackground } from '../../core/domain/press-messages'
import { demoAfterPress, demoReplied, demoSent } from '../../core/runtime/press-effects'
import { pressOn } from '../../core/runtime/session-presses'
import { withCollapse } from '../../core/view/collapse'
import { sessionView } from '../../core/view/session-view'
import { NO_SYNC_INPUTS } from '../../core/view/sync-state'
import type { PanelSource } from './controller'
import type { InboxModel } from './panel'
import { emptyState } from './state'
import type { OmpState } from './state'
import { OMP } from './texts'

export function demoState(now: number): OmpState {
  return { ...emptyState('demo'), ...demoSession(now, OMP.agent) }
}

/** A panel source over the shared demo data. A press changes the sample and sends nothing. */
export function demoSource(deps: {
  now(): number
  settleWindowMs: number
  version: string
  isNextBuild?: boolean
  comparePage: string
  /** The person's inbox model, which the footer names as the live panel's does. */
  inboxModel: InboxModel
}): PanelSource {
  let state = demoState(deps.now())
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach(l => l())
  /** Each sent press's message, which the stand-in agent answers when the controller says its reply is due. */
  const sentById = new Map<number, NonNullable<ReturnType<typeof demoSent>>>()

  return {
    screen: async (holds, notes) => ({
      view: sessionView(state, deps.now(), deps.settleWindowMs, holds, notes, false, {
        ...NO_SYNC_INPUTS,
        isDemo: true,
      }),
      ...deps.inboxModel,
      isGhMissing: false,
      isFetchingPrs: false,
      stop: null,
      version: deps.version,
      isNextBuild: deps.isNextBuild,
      isDemo: true,
    }),
    press: async (p, holds, pressId) => {
      const at = deps.now()
      const r = pressOn(
        state,
        p,
        at,
        { settleWindowMs: deps.settleWindowMs, holds },
        {
          comparePage: deps.comparePage,
          compareInBackground: isCompareInBackground('omp'),
        },
      )
      if ('stale' in r) return { error: null, note: 'stale', isUnconfirmed: false }
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
      const sent = demoSent(r, after.turns)
      if (sent) sentById.set(pressId, sent)
      changed()

      return { error: null, note: null, isUnconfirmed: false, isDemoSent: sent !== null }
    },
    demoReply: pressId => {
      const sent = sentById.get(pressId)
      if (!sent) return
      sentById.delete(pressId)
      const replied = demoReplied({ lastActions: state.lastActions, turns: state.presence }, sent)
      state = { ...state, lastActions: replied.lastActions, presence: { ...state.presence, ...replied.turns } }
      changed()
    },
    collapse: async (id, isCollapsed) => {
      state = withCollapse(state, id, isCollapsed, deps.now())
      changed()
    },
    resume: async () => null,
    fetchPrsWhenDue: () => {},
    checkDelegatesWhenDue: () => {},
    savedUi: async () => null,
    keepUi: () => {},
    shown: () => {},
    showedRows: () => {},
    onChange: listener => {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
  }
}
