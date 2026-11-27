import { ENTER_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import type { Block } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { isGrowingFrom } from './panel-steps'
import type { PanelSpace } from './panel-steps'

/**
 * A row's reply field as its press brings it in: the draw it came, and how long from then its buttons wait to fade in,
 * or null until the row's box starts to grow to the field's measured height. `goneShown` is whether the buttons showed
 * when the row stopped drawing the field, as when it closes, so its fading panel keeps them as they were. It is null
 * while the field is drawn.
 */
export type FieldWait = { since: number; waitMs: number | null; goneShown: boolean | null }

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
  if (b.kind !== 'row' || !last) return null
  const wait = last.fieldWait
  if (b.field === null) return wait === null || wait.goneShown !== null ? wait : goneWait(wait, now)
  if (last.block.kind !== 'row' || last.block.field === null) return { since: now, waitMs: null, goneShown: null }
  if (wait === null || wait.waitMs !== null) return wait

  return isGrowingFrom(last.restSpace, space)
    ? { ...wait, waitMs: now - wait.since + enterDelayMs(space.to, space.box) }
    : wait
}

/** The wait of a field the row stopped drawing at `now`: its buttons stay hidden unless their fade had started. */
function goneWait(w: FieldWait, now: number): FieldWait | null {
  const opening = fieldOpening(w, now)

  return opening === null ? null : { ...w, goneShown: opening.isOpen && opening.delayMs === 0 }
}

/** How the field's buttons draw at `now`, or null once they rest. */
export function fieldOpening(w: FieldWait | null, now: number): FieldOpening | null {
  if (w === null) return null
  if (w.goneShown !== null) return { isOpen: w.goneShown, delayMs: 0 }
  const fadesAt = w.since + (w.waitMs ?? MAX_WAIT_MS)
  if (now >= fadesAt + ENTER_FADE_MS) return null
  const isOpen = now > w.since && (w.waitMs !== null || now >= fadesAt)

  return { isOpen, delayMs: Math.max(0, fadesAt - now) }
}

/** When the field's buttons next change how they draw. */
export const fieldTimes = (w: FieldWait | null): number[] =>
  w === null || w.goneShown !== null
    ? []
    : [w.since + NEXT_FRAME_MS, w.since + (w.waitMs ?? MAX_WAIT_MS) + ENTER_FADE_MS, w.since + MAX_WAIT_MS]
