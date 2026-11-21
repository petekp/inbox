import { allRows } from '../../core/view/rows'
import type { SettledState } from '../../core/view/rows'
import {
  earliestOf,
  isDrawnInPlace,
  isListInUseSince,
  isPressOutSince,
  isSendOnItsWay,
  SETTLED_MS,
} from '../../core/view/timing'
import type { ListInput } from '../../core/view/timing'
import type { InboxView } from '../../core/view/view'

export const POLL_MS = 3000

export const SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS

/** What the tab reads to place a settled row or PR block on its own clock. */
type TabPlacing = {
  shownSince: number
  seen: ReadonlyMap<string, number>
  input: ListInput | null
  now: number
  /** When the oldest press still under way on the row's tab began, from the view or a press the tab has not heard back on, or null. */
  pressOutSince: number | null
}

/**
 * Whether a settled row the tab first listed at `seenAt` has not outlasted its fold time: `SETTLED_MS`, as long as Undo
 * lasts, and then while a press begun before that is still out or the person has been using the list since before it,
 * as `core/view/timing.ts:isSettledInPlace` says. A press or input begun after it folded leaves it folded.
 */
function isSeenInPlace(seenAt: number, { input, now, pressOutSince }: TabPlacing): boolean {
  const dueAt = seenAt + SETTLED_MS

  return now < dueAt || isPressOutSince(pressOutSince, dueAt) || isListInUseSince(input, dueAt, now)
}

/**
 * Whether the tab keeps a settled row or PR block in place: the rule of `core/view/timing.ts:isSettledInPlace`, timed from
 * the first view that listed it, less any that settled before the tab showed its tab.
 */
export function isTabInPlace(id: string, state: SettledState, p: TabPlacing): boolean {
  const isWaiting = isSendOnItsWay(state.delivery) || isSeenInPlace(p.seen.get(id) ?? p.now, p)

  return isDrawnInPlace({ state }, p.shownSince) && isWaiting
}

/**
 * The settled rows the tab draws in place, by `isTabInPlace`. A row whose Undo is out stays. `localPressSince` is when
 * the oldest press the tab has not heard back on began, or null.
 */
export function drawnSettled(
  v: InboxView,
  shownSince: number,
  undoing: ReadonlySet<string> = new Set(),
  {
    seen = new Map<string, number>(),
    input = null as ListInput | null,
    now = Date.now(),
    localPressSince = null as number | null,
  } = {},
): Set<string> {
  const placing = (pressOutSince: number | null): TabPlacing => ({
    shownSince,
    seen,
    input,
    now,
    pressOutSince: earliestOf([pressOutSince, localPressSince]),
  })
  const byTab = { needsYou: placing(v.needsYou.pressOutSince), findings: placing(v.findings.pressOutSince) }

  return new Set(
    allRows(v)
      .filter(
        r =>
          r.state.is === 'settled' &&
          (undoing.has(r.id) || isTabInPlace(r.id, r.state, r.finding ? byTab.findings : byTab.needsYou)),
      )
      .map(r => r.id),
  )
}

/** Whether a settled row or PR still offers Undo: for `SETTLED_MS` from the first view that listed it. */
export function isUndoLeft(seenAt: number, now: number): boolean {
  return now - seenAt < SETTLED_MS
}
