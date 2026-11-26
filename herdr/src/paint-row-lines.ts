import { ENTER_FADE_MS, FAINT_OPACITY, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import type { Element } from 'gpui-kit'
import type { RowBlock, Tone } from './blocks'
import { HOLD_MS, NEXT_FRAME_MS } from './block-glide'
import { isStatusUnder } from './held-line'
import { aboveId, aboveLineId } from './heights'
import { sizeEl, springBox } from './paint-space'
import type { RowMotion } from './motion'
import { fadeEl } from './paint-parts'
import type { Paint } from './paint-theme'

/** A line a row draws between its title and its panel. */
type TitleLine = { text: string; tone: Tone; isHidden?: boolean; leftAt?: number; cameAt?: number }

/** The lines a row's form draws between its title and its panel: its settled label, a status after the title, its held line. */
const linesOf = (r: RowBlock): TitleLine[] => [
  ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
  ...(r.feedback && !isStatusUnder(r) ? [{ ...r.feedback, cameAt: r.lineCameAt }] : []),
  ...(r.heldLine ? [r.heldLine] : []),
]

/**
 * The lines a row draws between its title and its panel, drawn by `lineEl`, for `shown`, the form the row draws. A
 * closing row keeps the lines of the open form it closes from while its panel holds its height, as it keeps that
 * form's panel, so a line its closed form adds, such as a press's "Sending…" that its buttons held under them, does
 * not push the fading panel down. A kept line its closed form drops fades out with the panel (`withPanel`). Once the
 * panel is left out, a line the closed form adds fades in from the next draw, while the row's box shrinks to its
 * closed height, so no line pops in or out.
 */
export function titleLineEls(
  r: RowBlock,
  shown: RowBlock,
  m: RowMotion | undefined,
  p: Paint,
  lineEl: (l: TitleLine, n: number) => Element,
  withPanel: (el: Element) => Element,
): Element[] {
  const drawn = (l: TitleLine, n: number) => leavingEl(r, l, lineEl(l, n).id(`status above ${r.id} line ${n}`), n, p)
  const closing = m?.closing ?? null
  const lines = linesOf(shown)
  if (closing === null) return lines.map(drawn)
  const kept = linesOf(closing)
  const isAdded = (l: TitleLine) => !kept.some(k => k.text === l.text)
  const isDropped = (l: TitleLine) => !lines.some(s => s.text === l.text)
  const fadeName = (n: number) => `status above ${r.id} ${n}`
  if (!m?.isPanelLeftOut) {
    lines.forEach((l, n) => isAdded(l) && p.fades.fade(fadeName(n), 0, 0, 0, p.now))
    return kept.map((l, n) => (isDropped(l) ? withPanel(drawn(l, n)) : drawn(l, n)))
  }

  return lines.map((l, n) => {
    if (!isAdded(l)) return drawn(l, n)
    const name = fadeName(n)
    return fadeEl(lineEl(l, n).id(name), name, 1, { duration: ENTER_FADE_MS, delay: NEXT_FRAME_MS }, p)
  })
}

/**
 * A held line whose hold let go, as `holdLinesAbove` gives it: it fades out while its box holds the line's height, then
 * the box shuts, with the row's box, so the buttons under it glide up and no empty space stays. Other lines draw as
 * they are.
 */
function leavingEl(r: RowBlock, l: TitleLine, el: Element, n: number, p: Paint): Element {
  const leftAt = l.leftAt
  if (l.cameAt !== undefined) return comingEl(r, l.cameAt, el, n, p)
  if (leftAt === undefined) return el
  const isFading = p.now < leftAt + HOLD_MS
  const name = `status above ${r.id} line ${n}`
  const shown = l.isHidden ? el : fadeEl(el, name, p.now === leftAt ? 1 : 0, { duration: LEAVE_FADE_MS, delay: 0 }, p)
  const box = springBox(`fit ${aboveId(r.id)}`, isFading ? p.heights.get(aboveLineId(r.id)) : 0)

  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)))
}

/**
 * A status that came above a row's buttons, as `holdLinesAbove` gives it: its box opens from none, with the row's box,
 * so the buttons under it glide down, and the line shows faint in its first draw, so a press shows at once, then fades
 * in once the box is nearly open.
 */
function comingEl(r: RowBlock, cameAt: number, el: Element, n: number, p: Paint): Element {
  const isStart = p.now === cameAt
  const height = p.heights.get(aboveLineId(r.id))
  const name = `status above ${r.id} line ${n}`
  const fade = { duration: ENTER_FADE_MS, delay: isStart ? 0 : enterDelayMs(height ?? 0) }
  const shown = fadeEl(el, name, isStart ? FAINT_OPACITY : 1, fade, p)
  const box = springBox(`fit ${aboveId(r.id)}`, isStart ? 0 : height)

  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)))
}
