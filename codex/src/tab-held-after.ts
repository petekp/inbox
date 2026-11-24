import type { FeedbackTone } from '../../core/view/feedback'

/** A status an open row's line draws after its title, and whether it keeps its space without its words. */
export type AfterLine = { text: string; tone: FeedbackTone; isHidden: boolean }

/** The status each open row's line last drew after its title, by row id. */
const heldAfter = new Map<string, AfterLine>()

/**
 * The status an open row's line draws after its title, given `after`, the one the row shows there now. While the row's
 * status goes under its buttons, as while a press is out or after it with "Not confirmed", the line keeps the status it
 * drew before, such as "✓ Explained", so the row's body and buttons keep their place. A failure keeps its space without
 * its words, since the press retries what it says failed. A status that belongs after the title takes the place, and
 * with no status the place stays empty until the row closes. The Herdr panel holds its line above the buttons the
 * same way, in `holdLinesAbove`.
 */
export function holdAfter(id: string, after: AfterLine | null, isStatusUnder: boolean, isFailed: boolean) {
  const kept = heldAfter.get(id)
  if (!isStatusUnder && after) {
    heldAfter.set(id, { ...after, isHidden: isFailed })
    return after
  }
  if (!kept) return isStatusUnder ? null : after
  const held = isStatusUnder ? kept : { ...kept, isHidden: true }
  heldAfter.set(id, held)

  return held
}

/** Ends the hold of a row that no longer draws its open form and has no press out, or that the tab no longer draws. */
export const dropHeldAfter = (id: string) => heldAfter.delete(id)

export const heldAfterIds = (): string[] => [...heldAfter.keys()]
