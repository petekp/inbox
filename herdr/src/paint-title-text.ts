import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { isOpenRow } from './blocks'
import type { RowBlock } from './blocks'
import type { Paint } from './paint-theme'
import { CLIPPED_HEIGHT, cutTitleOf, oneLineTitleOf, shortTitleOf, titleCopiesOf, wrappedTitleOf } from './title-cut'
import type { ShortTitle } from './title-cut'
import type { TitleFade } from '../../core/view/row-motion'
import { fadeEl } from './paint-parts'

/**
 * A row's title text: wrapped whole while the row is open, else in its short form (`shortTitleOf`), with the hidden
 * copies that measure it. While its title moves, both of the move's forms are drawn, the tall form in flow so the
 * title measures its height, and the short form over its first lines, and the title fades from one to the other. A
 * move between the open and the closed row has the whole title as its tall form. One between a settled row's one line
 * and a collapsed row's cut has the cut.
 */
export function titleTextEl(r: RowBlock, p: Paint, color: Color): Element {
  const m = p.motion.get(r.id)
  const g = m?.title ?? null
  const short = shortTitleOf(r, m?.swap?.from ?? null, p.heights)
  const text = div()
    .flex_1()
    .min_w(0)
    .relative()
    .text_color(color)
    .children(titleCopiesOf(r, p.heights).map(c => copyEl(c.key, c.text, p)))
  const whole = div().child(wrappedTitleOf(r, p.heights))
  if (g === null) return text.child(isOpenRow(r) ? whole : shortTitleEl(short))
  const form = (id: string, isShown: boolean, fade: TitleFade): Element =>
    fadeEl(div().id(id), id, isShown ? 1 : 0, { duration: fade.ms, delay: fade.delayMs }, p)
  const isCutTall = g.tallForm === 'cut'
  const tall = isCutTall ? shortTitleEl(cutTitleOf(r, p.heights)) : whole
  const shortForm = shortTitleEl(g.isShortOneLine ? oneLineTitleOf(r, p.heights) : short)

  return text.child(form(`tall ${r.id}`, g.isTallShown, g.tall).child(tall)).child(
    div()
      .absolute()
      .top(0)
      .left(0)
      .w_full()
      .child(form(`short ${r.id}`, !g.isTallShown, g.short).child(shortForm)),
  )
}

/**
 * A copy of a row's title, drawn hidden at the title's width, that reports its size under `key`. A change of its width
 * alone draws again, since the cut the title draws is chosen from copies measured at one width.
 */
const copyEl = (key: string, text: string, p: Paint): Element =>
  div()
    .id(`copy ${key}`)
    .absolute()
    .top(0)
    .left(0)
    .w_full()
    .opacity(0)
    .on_size_change((size, cx) => p.measure(key, size, cx, true))
    .child(text)

/** A short title's text: on one line with an ellipsis, on a line and a cut line, clipped to its lines, or wrapped. */
function shortTitleEl(s: ShortTitle): Element {
  if (s.isOneLine) return div().truncate().child(s.text)
  if (s.secondLine !== undefined) return div().child(div().child(s.text)).child(div().truncate().child(s.secondLine))

  return div()
    .when(s.isClipped, e => e.max_h(CLIPPED_HEIGHT).overflow_hidden())
    .child(s.text)
}
