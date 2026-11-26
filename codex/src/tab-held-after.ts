import type { FeedbackTone } from '../../core/view/feedback'
import { heldLineEndsAt, stepHeldLine } from '../../core/view/held-line'
import type { HeldLine } from '../../core/view/held-line'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'

/** A status an open row's line draws after its title. */
type AfterLine = { text: string; tone: FeedbackTone }

/** How an open row's line draws its status after its title: without its words, or fading out as its hold lets go. */
export type DrawnAfter = AfterLine & { isHidden: boolean; isLeaving: boolean }

/** The status each open row's line last drew after its title, by row id. */
const heldAfter = new Map<string, HeldLine<AfterLine>>()

/**
 * The status an open row's line draws after its title, given `after`, the one the row shows there now. While the row's
 * status goes under its buttons, as while a press is out, the line keeps the status it drew before, such as
 * "✓ Explained", so the row's body and buttons keep their place, and `stepHeldLine` says when it lets go. A status
 * that lets go fades out with its words, then the line drops it. The Herdr panel holds its line above the buttons by
 * the same rule, in `holdLinesAbove`.
 */
export function holdAfter(
  id: string,
  after: AfterLine | null,
  place: { isStatusUnder: boolean; isFailed: boolean; isPressUnderWay: boolean },
  now: number,
): DrawnAfter | null {
  const own = place.isStatusUnder ? null : after
  const step = stepHeldLine(
    heldAfter.get(id),
    { own, isOwnFailure: place.isFailed, isUnder: place.isStatusUnder, isPressUnderWay: place.isPressUnderWay },
    now,
    LEAVE_FADE_MS,
  )
  if (step.kept) heldAfter.set(id, step.kept)
  else heldAfter.delete(id)
  if (own) return { ...own, isHidden: false, isLeaving: false }
  const d = step.drawn

  return d ? { ...d.line, isHidden: d.isHidden, isLeaving: d.leftAt !== null } : null
}

/** Ends the hold of a row that no longer draws its open form and has no press out, or that the tab no longer draws. */
export const dropHeldAfter = (id: string) => heldAfter.delete(id)

export const heldAfterIds = (): string[] => [...heldAfter.keys()]

/** When the next held status that lets go has faded out, so the tab draws the line without it then. */
export function heldAfterEndsAt(): number | null {
  const ends = [...heldAfter.values()].flatMap(k => {
    const end = heldLineEndsAt(k, LEAVE_FADE_MS)
    return end === null ? [] : [end]
  })

  return ends.length === 0 ? null : Math.min(...ends)
}
