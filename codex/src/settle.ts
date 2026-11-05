import { prMarkId } from '../../hooks/pr-rows'
import type { SessionView } from '../../hooks/session-view'
import { allRows, settledRowIds } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import { isDrawnInPlace, isListInUseSince, isSendPending, SETTLED_MS } from '../../hooks/timing'
import type { ListInput } from '../../hooks/timing'
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
 * Whether a settled row the tab first listed at `seenAt` stays in place: for `SETTLED_MS`, as long as Undo lasts, and
 * then while the person keeps using the list, as `hooks/timing.ts:isSettledInPlace` says. A row whose send is pending
 * also stays, as there.
 */
function isSeenInPlace(seenAt: number, input: ListInput | null, now: number): boolean {
  return now - seenAt < SETTLED_MS || isListInUseSince(input, seenAt + SETTLED_MS, now)
}

/**
 * The settled rows the tab draws in place: those the view lists and `isSeenInPlace` keeps, less any that settled before
 * the tab showed its tab, which the view read before a switch still lists. A row whose Undo is out stays.
 */
export function drawnSettled(
  v: InboxView,
  shownSince: number,
  undoing: ReadonlySet<string> = new Set(),
  { seen = new Map<string, number>(), input = null as ListInput | null, now = Date.now() } = {},
): Set<string> {
  const isInPlace = (r: RowView) =>
    isDrawnInPlace(r, shownSince) &&
    ((r.state.is === 'settled' && isSendPending(r.state)) || isSeenInPlace(seen.get(r.id) ?? now, input, now))

  return new Set(
    allRows(v)
      .filter(r => r.state.is === 'settled' && (undoing.has(r.id) || isInPlace(r)))
      .map(r => r.id),
  )
}

/** Whether a settled row or PR still offers Undo: for `SETTLED_MS` from the first view that listed it. */
export function isUndoLeft(seenAt: number, now: number): boolean {
  return now - seenAt < SETTLED_MS
}
