import type { PressKind } from '../../types'
import { holdsStatusWhileOut } from './feedback'
import type { Feedback } from './feedback'
import { pendingResult } from './pressed'
import type { Effect } from './press-reducer'
import type { SessionView } from './session-view'
import type { PressOut } from './ui-controller-types'

/** What a press that sends reads on its row from the moment of the press until the host records it. */
export const SENDING = 'Sending…'

/**
 * The latest press out on row or PR line `id` that `view` does not show yet, or null. The view shows a press once its
 * row's last action is not the one it had when pressed. A reply is never out, so it counts as none.
 */
export function unshownPressOut(
  pressesOut: Readonly<Record<number, PressOut>>,
  view: Pick<SessionView, 'lastActions'>,
  id: string,
): PressOut | null {
  const out = Object.values(pressesOut)
    .filter(p => p.rowId === id && !p.isReply)
    .pop()
  if (!out || (view.lastActions[id]?.at ?? null) !== out.atBefore) return null

  return out
}

/**
 * What a row reads while a press of `kind` is out and its host has not recorded it: the opens and copies it runs, as
 * "Opening plan.md…", or `SENDING`. Null for a Mark press, which keeps the status the row drew, as
 * `holdsStatusWhileOut` says.
 */
export function unshownPressFeedback(kind: PressKind | null, effects: readonly Effect[], at: number): Feedback | null {
  if (holdsStatusWhileOut(kind)) return null
  if (effects.some(e => e.kind !== 'send')) return { is: 'local', result: pendingResult([...effects], at) }

  return { is: 'sending', label: SENDING, at, sentAt: at }
}
