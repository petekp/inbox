import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { isOpenRow } from './blocks'
import type { RowBlock } from './blocks'
import type { Paint } from './paint-theme'
import { CLIPPED_HEIGHT, cutTitleOf, shortTitleOf, titleCopiesOf } from './title-cut'
import type { ShortTitle } from './title-cut'
import type { TitleFade } from '../../core/view/row-motion'

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
    .children(titleCopiesOf(r, p.heights).map(c => copyEl(c.key, c.text, c.isWidthDrawn, p)))
  if (g === null) return text.child(isOpenRow(r) ? div().child(r.title) : shortTitleEl(short))
  const form = (id: string, isShown: boolean, fade: TitleFade): Element =>
    div()
      .id(id)
      .opacity(isShown ? 1 : 0)
      .transition('opacity', { duration: fade.ms, delay: fade.delayMs, easing: 'ease-out' })
  const isCutTall = g.tallForm === 'cut'
  const tall = isCutTall ? shortTitleEl(cutTitleOf(r, p.heights)) : div().child(r.title)
  const shortForm = shortTitleEl(g.isShortOneLine ? { ...short, text: r.title, isOneLine: true } : short)

  return text.child(form(`tall ${r.id}`, g.isTallShown, g.tall).child(tall)).child(
    div()
      .absolute()
      .top(0)
      .left(0)
      .w_full()
      .child(form(`short ${r.id}`, !g.isTallShown, g.short).child(shortForm)),
  )
}

/** A copy of a row's title, drawn hidden at the title's width, that reports its size under `key`. */
const copyEl = (key: string, text: string, isWidthDrawn: boolean, p: Paint): Element =>
  div()
    .id(`copy ${key}`)
    .absolute()
    .top(0)
    .left(0)
    .w_full()
    .opacity(0)
    .on_size_change((size, cx) => p.measure(key, size, cx, isWidthDrawn))
    .child(text)

/** A short title's text: on one line with an ellipsis, clipped to its lines, or wrapped. */
function shortTitleEl(s: ShortTitle): Element {
  if (s.isOneLine) return div().truncate().child(s.text)

  return div()
    .when(s.isClipped, e => e.max_h(CLIPPED_HEIGHT).overflow_hidden())
    .child(s.text)
}
