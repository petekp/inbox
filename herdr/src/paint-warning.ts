import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { RowBlock } from './blocks'
import type { RowMotion } from './motion'
import { lineBoxEl } from './paint-pr-status'
import { sizeEl } from './paint-space'
import type { Paint } from './paint-theme'
import { warningBoxId, warningHeight, warningId } from './warning-line'

/**
 * The box of block `id`'s stopped warning, `atRest` with no motion. It springs open before the line fades in and shuts
 * after the line fades out, so the parts under it glide, and the block's box springs with it (`warningRise`). It is
 * drawn whether or not a warning shows, so it can shut, and holds no space when none does. `lineEl` draws the line
 * with the gaps the box holds. `isAtRest` draws it with no motion, as in a row's panel while the panel fades.
 */
export function warningBoxEl(
  id: string,
  atRest: string | null,
  p: Paint,
  lineEl: (text: string) => Element,
  isAtRest = false,
): Element {
  const m = p.motion.get(id)
  const height = warningHeight(id, m, p, isAtRest)
  const box = lineBoxEl(warningId(id), height, isAtRest ? null : (m?.warning ?? null), atRest, lineEl, p)

  return sizeEl(warningBoxId(id), p, box)
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
