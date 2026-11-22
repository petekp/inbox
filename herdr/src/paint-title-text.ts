import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { isOpenRow } from './blocks'
import type { RowBlock } from './blocks'
import type { Paint } from './paint-theme'
import type { TitleFade } from '../../core/view/row-motion'

/**
 * A row's title text: wrapped while the row is open, else on one line cut with an ellipsis. While its title moves, both
 * forms are drawn, the wrapped form in flow so the title measures its wrapped height, and the one-line form over its
 * first line, and the title fades from one to the other.
 */
export function titleTextEl(r: RowBlock, p: Paint, color: Color): Element {
  const isOpen = isOpenRow(r)
  const m = p.motion.get(r.id)?.title ?? null
  const text = div()
    .flex_1()
    .min_w(0)
    .text_color(color)
    .when(isOpen, e => e.font_semibold())
  if (m === null) return text.when(!isOpen, e => e.truncate()).child(r.title)
  const form = (id: string, isShown: boolean, fade: TitleFade): Element =>
    div()
      .id(id)
      .opacity(isShown ? 1 : 0)
      .transition('opacity', { duration: fade.ms, delay: fade.delayMs, easing: 'ease-out' })

  return text
    .relative()
    .child(form(`wrapped ${r.id}`, m.isWrapShown, m.wrapped).child(r.title))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .w_full()
        .child(form(`one line ${r.id}`, !m.isWrapShown, m.oneLine).truncate().child(r.title)),
    )
}
