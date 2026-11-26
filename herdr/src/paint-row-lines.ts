import { ENTER_FADE_MS } from '../../core/view/row-motion'
import type { Element } from 'gpui-kit'
import type { RowBlock, Tone } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { isStatusUnder } from './held-line'
import type { RowMotion } from './motion'
import { fadeEl } from './paint-parts'
import type { Paint } from './paint-theme'

/** A line a row draws between its title and its panel. */
type TitleLine = { text: string; tone: Tone; isHidden?: boolean }

/** The lines a row's form draws between its title and its panel: its settled label, a status after the title, its held line. */
const linesOf = (r: RowBlock): TitleLine[] => [
  ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
  ...(r.feedback && !isStatusUnder(r) ? [r.feedback] : []),
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
  const drawn = (l: TitleLine, n: number) => lineEl(l, n).id(`status above ${r.id} line ${n}`)
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
