import type { DemoCopy } from '../../types'
import type { PrPress } from '../../core/view/pr-press'
import { demoAfterPress, demoSent, type DemoSent } from '../../core/runtime/press-effects'
import type { RowPress } from '../../core/domain/presses'
import { emptySession } from '../../core/view/session-files'
import { pressOn } from '../../core/runtime/session-presses'
import { SETTLED_MS, type Holds } from '../../core/view/timing'
import type { SettledOutcome } from '../../core/view/ui-controller-types'

export type DemoPressed = { demo: DemoCopy; outcome: SettledOutcome; sent: DemoSent | null; hasEffects: boolean }

/** A press on the sample: it changes the sample copy and sends nothing. `sent` is the message the stand-in agent answers. */
export function demoPressOn(
  d: DemoCopy,
  p: RowPress | PrPress,
  now: number,
  holds: Holds,
  texts: { comparePage: string; compareInBackground: boolean },
): DemoPressed {
  const sample = emptySession()
  const r = pressOn(
    {
      ...sample,
      ledger: d.ledger,
      prViews: d.prViews,
      lastActions: d.lastActions,
      presence: { ...sample.presence, ...d.turns },
    },
    p,
    now,
    { settleWindowMs: SETTLED_MS, holds },
    texts,
  )
  if ('stale' in r)
    return { demo: d, outcome: { error: null, note: 'stale', isUnconfirmed: false }, sent: null, hasEffects: false }
  const after = demoAfterPress({ lastActions: d.lastActions, turns: d.turns }, r, new Set(Object.keys(holds.replies)))
  const sent = demoSent(r, after.turns)

  return {
    demo: { ...d, ...after },
    outcome: { error: null, note: null, isUnconfirmed: false, isDemoSent: sent !== null },
    sent,
    hasEffects: r.effects.length > 0,
  }
}
