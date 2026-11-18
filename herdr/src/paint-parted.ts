import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import { SPACE_UNIT } from '../../hooks/layout'

/** The slot a separator's dot is centred in: about the width ` · ` takes in the pane's font. */
const SEP_W = 3 * SPACE_UNIT

/**
 * Parts joined by a dot, as items of a wrapping row. A part that does not fit moves whole to the next line. Each part
 * after the first leads with its dot, and the row reaches `SEP_W` left of its box, which clips that strip, so the dot
 * of a part that starts a line is not drawn and no line starts or ends with one.
 */
export function partedEl(parts: Element[], dotColor: Color): Element {
  const [first, ...rest] = parts
  // An element joins one parent only, so each part gets its own dot.
  const dot = () => h_flex().flex_none().w(SEP_W).justify_center().text_color(dotColor).child('·')
  const items = [
    ...(first ? [div().ml(SEP_W).min_w(0).max_w_full().child(first)] : []),
    ...rest.map(part => h_flex().items_start().min_w(0).max_w_full().child(dot()).child(div().min_w(0).child(part))),
  ]

  return div().overflow_hidden().min_w(0).child(h_flex().flex_wrap().items_start().ml(-SEP_W).children(items))
}
