import { prMarkId } from '../../hooks/pr-tab'
import type { SessionView } from '../../hooks/session'
import { allRows, isDrawnInPlace, SETTLED_MS, settledRowIds } from '../../hooks/view'
import type { InboxView } from '../../hooks/view'

export const POLL_MS = 3000

export const SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS

export function settledIds(v: SessionView): string[] {
  return [
    ...settledRowIds(allRows(v)),
    ...v.prs.drawn.flatMap(d => (d.state.is === 'settled' ? [prMarkId(d.pr.ref)] : [])),
  ]
}

export function settledSeen(seen: ReadonlyMap<string, number>, listed: string[], now: number): Map<string, number> {
  return new Map(listed.map(id => [id, seen.get(id) ?? now]))
}

/**
 * The settled rows the tab draws in place: those the view lists, less any that settled before the tab showed its tab,
 * which the view read before a switch still lists. A row whose Undo is out stays.
 */
export function drawnSettled(v: InboxView, shownSince: number, undoing: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(
    allRows(v)
      .filter(r => r.state.is === 'settled' && (undoing.has(r.id) || isDrawnInPlace(r, shownSince)))
      .map(r => r.id),
  )
}

/** Whether a settled row or PR still offers Undo: for `SETTLED_MS` from the first view that listed it. */
export function isUndoLeft(seenAt: number, now: number): boolean {
  return now - seenAt < SETTLED_MS
}
