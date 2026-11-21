import { earliestOf } from '../../core/view/timing'
import type { PressOut } from '../../core/view/ui-controller-types'
import type { TabView as View } from './core'
import type { Feedback } from '../../core/view/feedback'
import type { PressKind } from '../../types'
import { localOuts, tabState } from './tab-state'

/** A row's saved last press, so the tab can tell when a view shows a press it has out. */
export function lastPressKey(v: View | null, id: string): string {
  return JSON.stringify(v?.lastActions[id] ?? null)
}

const pressesOut = (): PressOut[] => Object.values(tabState.ui.pressesOut)

/**
 * The latest press out on row `id`, or null: its action, so its button draws as out before the view says so, which is
 * null for a reply, since a reply is never out, and what the tab keeps of it in `localOuts`.
 */
export function outOn(
  id: string,
): { action: string | null; pending: Feedback | null; kind: PressKind | null; lastBefore: string } | null {
  const out = pressesOut()
    .filter(p => p.rowId === id)
    .pop()
  if (!out) return null
  const local = localOuts.get(out.pressId)

  return {
    action: out.isReply ? null : out.action,
    pending: local?.pending ?? null,
    kind: local?.kind ?? null,
    lastBefore: local?.lastBefore ?? '',
  }
}

/** Whether an Undo on row or PR `id` is out. */
export const isUndoing = (id: string): boolean =>
  pressesOut().some(p => p.rowId === id && (p.action === 'undo' || p.action === 'pr-undo'))

/** The rows and PRs whose Undo is out. */
export const undoingIds = (): Set<string> =>
  new Set(pressesOut().flatMap(p => (p.action === 'undo' || p.action === 'pr-undo' ? [p.rowId] : [])))

/** When the oldest press out began, or null while none is out. */
export const sendingSince = (): number | null => earliestOf(pressesOut().map(p => p.at))

/**
 * The status the tab draws for its Local press while the press is out: the press's pending result, until a view shows
 * the server's record of the press, which then draws as in the other looks, such as "Starting a re-run of CI…" after
 * "Refreshing PR #12…". Null for a message, and once a view shows the press.
 */
export function outPending(v: View | null, id: string): Feedback | null {
  const out = outOn(id)
  if (!out?.pending) return null

  return lastPressKey(v, id) === out.lastBefore ? out.pending : null
}
