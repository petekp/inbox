import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import type { RowBlock } from './blocks'
import type { RowMotion } from './motion'
import { lineBoxEl } from './paint-pr-status'
import { fadeEl } from './paint-parts'
import { sizeEl } from './paint-space'
import type { Paint } from './paint-theme'
import { warningBoxId, warningHeight, warningId } from './warning-line'

/**
 * The box of block `id`'s stopped warning, `atRest` with no motion. It springs open before the line fades in and shuts
 * after the line fades out, so the parts under it glide, and the block's box springs with it (`warningRise`). It is
 * drawn whether or not a warning shows, so it can shut, and holds no space when none does. `lineEl` draws the line
 * with the gaps the box holds. `isLeftForm` draws it in the form a row leaves as it closes or changes form, as
 * `heldBoxEl` says.
 */
export function warningBoxEl(
  id: string,
  atRest: string | null,
  p: Paint,
  lineEl: (text: string) => Element,
  isLeftForm = false,
): Element {
  const m = p.motion.get(id)
  const box = isLeftForm
    ? heldBoxEl(id, atRest, p, lineEl)
    : lineBoxEl(warningId(id), warningHeight(id, m, p, false), m?.warning ?? null, atRest, lineEl, p)

  return sizeEl(warningBoxId(id), p, box)
}

/**
 * The warning box of the form a row leaves while its panel fades. It holds the height it last had, so the parts under
 * it stay still. Its line fades out from the opacity it shows, or goes at once when the box was still opening, so the
 * box never cuts a line that shows.
 */
function heldBoxEl(id: string, line: string | null, p: Paint, lineEl: (text: string) => Element): Element {
  const key = warningId(id)
  const height = p.heights.get(warningBoxId(id)) ?? 0
  const isOpen = height >= (p.heights.get(key) ?? 0)
  const drawn = (line === null ? div() : lineEl(line)).id(key)
  const faded = fadeEl(drawn, key, 0, { duration: isOpen ? LEAVE_FADE_MS : 0, delay: 0 }, p)

  return div()
    .id(`fit ${key}`)
    .flex_none()
    .overflow_hidden()
    .h(height)
    .child(sizeEl(key, p, faded))
}

/**
 * Whether a row draws its stopped warning box: while the row is not settled and has a warning, or its box still holds
 * space as the warning leaves. A row with none draws no box, so its parts keep their gaps (`partPt`) at rest.
 */
export const isWarningDrawn = (r: RowBlock, m: RowMotion | undefined, p: Paint): boolean =>
  r.settled === null && (r.warning !== undefined || Boolean(m?.warning) || (p.heights.get(warningBoxId(r.id)) ?? 0) > 0)

/** A row's stopped warning box, `gap` under the part above, on the row's tree when `trunk` passes it. */
export const rowWarningEl = (box: Element, gap: number, trunk: Element | null): Element =>
  div()
    .relative()
    .pt(gap)
    .child(box)
    .children(trunk ? [trunk] : [])
