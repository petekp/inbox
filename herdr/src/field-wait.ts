import { ENTER_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import type { Block } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import type { PanelSpace } from './panel-steps'

/**
 * A row's reply field as its press brings it in: the draw it came, and how long from then its buttons wait to fade in,
 * or null until the row's box starts to grow to the field's measured height.
 */
export type FieldWait = { since: number; waitMs: number | null }

/** How the buttons of a row's reply field draw while the field comes: shown or not, and the delay of their fade. */
export type FieldOpening = { isOpen: boolean; delayMs: number }

/** How long the buttons wait when the row's box never grows, as when the field is no taller than what it replaced. */
const MAX_WAIT_MS = HEIGHT_SETTLE_MS - ENTER_FADE_MS

/**
 * The reply field of row `b` at `now`, after `last`. The field's text field shows in the press's draw, and the row's box
 * grows from the draw that measures it. Its buttons, at the bottom of that box, wait until the box is nearly open, so
 * the growing edge never cuts them while they show. A row drawn for the first time with its field open waits for
 * nothing.
 */
export function stepFieldWait(
  last: { block: Block; fieldWait: FieldWait | null; restSpace: PanelSpace | null } | undefined,
  b: Block,
  space: PanelSpace,
  now: number,
): FieldWait | null {
  if (b.kind !== 'row' || b.field === null || !last) return null
  const wait = last.fieldWait
  if (last.block.kind !== 'row' || last.block.field === null) return { since: now, waitMs: null }
  if (wait === null || wait.waitMs !== null) return wait
  const isGrowing = last.restSpace !== null && space.to > last.restSpace.to

  return isGrowing ? { since: wait.since, waitMs: now - wait.since + enterDelayMs(space.to, space.box) } : wait
}

/** How the field's buttons draw at `now`, or null once they rest. */
export function fieldOpening(w: FieldWait | null, now: number): FieldOpening | null {
  if (w === null) return null
  const fadesAt = w.since + (w.waitMs ?? MAX_WAIT_MS)
  if (now >= fadesAt + ENTER_FADE_MS) return null
  const isOpen = now > w.since && (w.waitMs !== null || now >= fadesAt)

  return { isOpen, delayMs: Math.max(0, fadesAt - now) }
}

/** When the field's buttons next change how they draw. */
export const fieldTimes = (w: FieldWait | null): number[] =>
  w === null
    ? []
    : [w.since + NEXT_FRAME_MS, w.since + (w.waitMs ?? MAX_WAIT_MS) + ENTER_FADE_MS, w.since + MAX_WAIT_MS]
