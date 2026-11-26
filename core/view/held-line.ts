import { pressUnderWaySince } from './feedback'
import type { Feedback } from './feedback'

/**
 * A status line a row holds in its own place while it shows its buttons: the line it drew there last, whether that
 * line is a failure's, whether its words draw hidden, and when its hold let go, or null while it holds.
 */
export type HeldLine<L> = { line: L; isFailure: boolean; isHidden: boolean; leftAt: number | null }

/** What a row draws in the place: the line, with or without its words, and when it started to leave, if it is leaving. */
type PlaceLine<L> = { line: L; isHidden: boolean; leftAt: number | null }

/** What decides the place in one draw. */
type PlaceNow<L> = {
  /** The row's status, when it belongs in the place, as a status after the title does. */
  own: L | null
  isOwnFailure: boolean
  /** The row's status goes under its buttons. */
  isUnder: boolean
  isPressUnderWay: boolean
}

/**
 * A press under way, as `pressUnderWaySince` reads it. A queued message does not hold the place, since it can wait a
 * whole turn.
 */
export const isPressUnderWay = (f: Feedback | null): boolean => pressUnderWaySince(f) !== null

/**
 * The line a row with buttons draws in the place where its status goes after its title, at `now`, after `kept`, the
 * line it held there. The hold keeps the row's buttons from moving under a press: the status of a press under way goes
 * under the buttons, and the line it took the place of stays.
 * - A status that belongs in the place takes it.
 * - While a press is under way, the place keeps the line it last drew. A failure keeps its space without its words,
 *   since the press retries what it says failed.
 * - Once no press is under way, the line stays with its words while the row's status stays under its buttons, as with
 *   "Not confirmed". A failure's line lets go, since its words no longer hold.
 * - Otherwise the hold lets go, as when the press ended with no status, or the status cleared on the clock. The line
 *   keeps the words it drew while it leaves, for `leaveMs`, as the look fades it and closes its space, so the place
 *   never stays empty.
 */
export function stepHeldLine<L>(
  kept: HeldLine<L> | undefined,
  place: PlaceNow<L>,
  now: number,
  leaveMs: number,
): { kept: HeldLine<L> | undefined; drawn: PlaceLine<L> | null } {
  if (place.own !== null) {
    const line = place.own
    return { kept: { line, isFailure: place.isOwnFailure, isHidden: false, leftAt: null }, drawn: null }
  }
  if (!kept) return { kept: undefined, drawn: null }
  const drawn = (k: HeldLine<L>) => ({ kept: k, drawn: { line: k.line, isHidden: k.isHidden, leftAt: k.leftAt } })
  if (kept.leftAt !== null) return now < kept.leftAt + leaveMs ? drawn(kept) : { kept: undefined, drawn: null }
  if (place.isPressUnderWay) return drawn({ ...kept, isHidden: kept.isFailure })
  if (place.isUnder && !kept.isFailure) return drawn(kept)

  return drawn({ ...kept, leftAt: now })
}

/** When a held line next changes how it draws: when its leave ends, `leaveMs` after its hold let go. */
export const heldLineEndsAt = (kept: HeldLine<unknown> | null | undefined, leaveMs: number): number | null =>
  kept?.leftAt == null ? null : kept.leftAt + leaveMs
