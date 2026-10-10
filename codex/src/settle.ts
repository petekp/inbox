// How long the Inbox tab draws a row that just closed, and how long a press may
// take. The tab polls, so it times each settled row from the first view that
// lists it, not from the close. Pure, so the server and the tab share it.

import { allRows, SETTLED_MS, settledRowIds } from '../../hooks/view'
import type { InboxView } from '../../hooks/view'

/** How often the tab asks the server for its view. */
export const POLL_MS = 3000

/**
 * How long a press may go unanswered before it reads as not sent and polls resume. It must exceed the
 * server's limits on a press's lock waits, `codex queue` and opens, or a press that went through reads as failed.
 */
export const PRESS_TIMEOUT_MS = 60_000

/** How long after a close the server lists its row as settled: SETTLED_MS and two polls, so a poll sees every close. */
export const SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS

/** The rows a view lists as settled. */
export function settledIds(v: InboxView): string[] {
  return settledRowIds(allRows(v))
}

/** When the tab first saw each row the view lists as settled: kept from `seen`, or `now` for one new to it. */
export function settledSeen(seen: ReadonlyMap<string, number>, listed: string[], now: number): Map<string, number> {
  return new Map(listed.map(id => [id, seen.get(id) ?? now]))
}

/** How long a settled row takes to fade and collapse once its SETTLED_MS ends. */
export const EXIT_MS = 200

/**
 * The settled rows the tab draws in place: first seen less than SETTLED_MS ago, `held` rows, whose Undo
 * press is out, and leaving rows for EXIT_MS from `leftAt`, when their exit started, or from the end of
 * their SETTLED_MS before it starts. The rest show in their Closed fold.
 */
export function drawnSettled(
  seen: ReadonlyMap<string, number>,
  now: number,
  held: ReadonlySet<string> = new Set(),
  leftAt: ReadonlyMap<string, number> = new Map(),
): Set<string> {
  const isDrawn = (id: string, at: number) => {
    const left = leftAt.get(id)

    return held.has(id) || now - at < SETTLED_MS || now - (left ?? at + SETTLED_MS) < EXIT_MS
  }

  return new Set([...seen].filter(([id, at]) => isDrawn(id, at)).map(([id]) => id))
}

/** The drawn settled rows past their SETTLED_MS, which fade and collapse before they leave. */
export function leavingSettled(seen: ReadonlyMap<string, number>, now: number, held: ReadonlySet<string>): Set<string> {
  return new Set([...seen].filter(([id, at]) => !held.has(id) && now - at >= SETTLED_MS).map(([id]) => id))
}
