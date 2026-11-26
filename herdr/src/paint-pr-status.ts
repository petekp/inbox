import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { Button, PrBlock } from './blocks'
import { fadeEl } from './paint-parts'
import { sizeEl, springBox } from './paint-space'
import type { Paint } from './paint-theme'
import { PR_TAIL_PARTS, prStatusHeight, prTailHeight, prTailId } from './pr-status'
import type { PrLine, PrTailPart } from './pr-status'
import { underId } from './under-line'
import type { UnderMotion } from './under-line'

/**
 * A line in a box whose height springs, as a PR block's or a stopped warning, so the lines under it move with its edge
 * as it comes and goes, and the box around it, the sum of its parts, never cuts them. The line fades in once its box is nearly open, and out while
 * its box holds, as `underMotion` says, then its box shuts. `atRest` is the line the block shows with no motion.
 */
export function lineBoxEl<L>(
  key: string,
  height: number | undefined,
  s: UnderMotion<L> | null,
  atRest: L | null,
  lineEl: (l: L) => Element | null,
  p: Paint,
): Element {
  const moving = height === undefined ? null : s
  const line = height === undefined ? atRest : (s?.line ?? null)
  const drawn = (line === null ? null : lineEl(line)) ?? div()
  const faded =
    moving === null || moving.opacity === null
      ? drawn.id(key)
      : fadeEl(drawn.id(key), key, moving.opacity, { duration: moving.fadeMs, delay: moving.delayMs }, p)

  return springBox(`fit ${key}`, height).child(sizeEl(key, p, faded))
}

/** A PR block's status line, which in a narrow pane its number leads, so it never comes or goes. */
export function prStatusEl(b: PrBlock, p: Paint, lineEl: (l: PrLine) => Element): Element {
  const m = p.motion.get(b.id)
  const isShown = (l: PrLine) => p.isNarrow || l.status !== null || l.unlisted.length > 0

  return lineBoxEl(
    underId(b.id),
    prStatusHeight(b, m, p),
    m?.status ?? null,
    b,
    l => (isShown(l) ? lineEl(l) : null),
    p,
  )
}

/** How a PR block draws each line under its status line. A going line's buttons take no press. */
type PrTailEls = {
  error: (text: string) => Element
  buttons: (buttons: Button[], isGoing: boolean) => Element
  result: (f: NonNullable<PrBlock['feedback']>) => Element
}

/** The lines under a PR block's status line, each in its own box, as `lineBoxEl` draws them. */
export function prTailEls(b: PrBlock, p: Paint, els: PrTailEls): Element[] {
  const m = p.motion.get(b.id)
  const box = (part: PrTailPart) => {
    const key = prTailId(part, b.id)
    const height = prTailHeight(b, part, m, p)
    const t = m?.prTail ?? null
    if (part === 'error') return lineBoxEl(key, height, t?.error ?? null, b.error, els.error, p)
    if (part === 'buttons') {
      const atRest = b.buttons.length > 0 ? b.buttons : null
      return lineBoxEl(key, height, t?.buttons ?? null, atRest, l => els.buttons(l, atRest === null), p)
    }
    return lineBoxEl(key, height, t?.result ?? null, b.feedback, els.result, p)
  }

  return PR_TAIL_PARTS.map(box)
}
