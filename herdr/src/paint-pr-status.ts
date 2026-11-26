import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { PrBlock } from './blocks'
import { fadeEl } from './paint-parts'
import { sizeEl, springBox } from './paint-space'
import type { Paint } from './paint-theme'
import { prStatusHeight } from './pr-status'
import type { PrLine } from './pr-status'
import { underId } from './under-line'

/**
 * A PR block's status line in a box whose height springs, so the lines under it move with its edge as it comes and
 * goes, and the PR's box, the sum of its parts, never cuts them. The line fades in once its box is nearly open, and
 * out while its box holds, as `underMotion` says, then its box shuts.
 */
export function prStatusEl(b: PrBlock, p: Paint, lineEl: (l: PrLine) => Element): Element {
  const m = p.motion.get(b.id)
  const key = underId(b.id)
  const height = prStatusHeight(b, m, p)
  const s = height === undefined ? null : (m?.status ?? null)
  const line: PrLine | null = height === undefined ? b : (s?.line ?? null)
  const drawn = line && (p.isNarrow || line.status !== null || line.unlisted.length > 0) ? lineEl(line).id(key) : div()
  const faded =
    s?.opacity === null || s === null
      ? drawn
      : fadeEl(drawn, key, s.opacity, { duration: s.fadeMs, delay: s.delayMs }, p)

  return springBox(`fit ${key}`, height).child(sizeEl(key, p, faded))
}
