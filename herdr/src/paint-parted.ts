import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'

/**
 * The slot a separator's dot is centred in: the width DOT takes in a line of the pane's text, measured in a capture, so
 * a parted line spaces its parts as a text line does and fits where that text would.
 */
const SEP_W = 9.5

/**
 * Parts joined by a dot, as items of a wrapping row. A part that does not fit moves whole to the next line. Each part
 * leads with a slot `SEP_W` wide, the first an empty one and the rest their dot, and the row reaches `SEP_W` left of its
 * box, which clips that strip. So the dot of a part that starts a line is not drawn, no line starts or ends with one,
 * and no part, the first included, reaches past the box's right edge.
 */
export function partedEl(parts: Element[], dotColor: Color): Element {
  // An element joins one parent only, so each part gets its own slot.
  const slot = (n: number) =>
    h_flex()
      .flex_none()
      .w(SEP_W)
      .justify_center()
      .text_color(dotColor)
      .when(n > 0, e => e.child('·'))
  const items = parts.map((part, n) =>
    h_flex().items_start().min_w(0).max_w_full().child(slot(n)).child(div().min_w(0).child(part)),
  )

  return div().overflow_hidden().min_w(0).child(h_flex().flex_wrap().items_start().ml(-SEP_W).children(items))
}
