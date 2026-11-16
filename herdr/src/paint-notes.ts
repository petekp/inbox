import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import type { Block } from './blocks'
import { CONTROL_GAP, EDGE, HEAD_LINE, HEAD_TEXT, NEST, TEXT_X, colorOf } from './paint-theme'
import type { Theme } from './paint-theme'

/** A rule's line, filling the space beside its text. */
export const ruleLine = (t: Theme): Element => div().flex_1().border_t(1).border_color(t.border)

export function ruleEl(b: Extract<Block, { kind: 'rule' }>, t: Theme): Element {
  if (b.text === null) return h_flex().pl(EDGE).pr(EDGE).child(ruleLine(t))

  return h_flex()
    .pl(TEXT_X)
    .pr(EDGE)
    .gap(CONTROL_GAP)
    .items_center()
    .child(
      div()
        .flex_none()
        .text_color(b.isTitle ? t.foreground : t.muted)
        .when(b.isTitle, e => e.font_semibold())
        .child(b.text),
    )
    .child(ruleLine(t))
}

export function noteEl(b: Extract<Block, { kind: 'note' }>, t: Theme, buttons: Element[] = []): Element {
  const text = div()
    .min_w(0)
    .when(b.isStrong, e => e.font_semibold())
    .text_color(b.isStrong ? t.foreground : colorOf(t, b.tone))
    .child(b.text)

  return h_flex()
    .flex_wrap()
    .items_baseline()
    .pl((b.isAtEdge ? EDGE : TEXT_X) + b.depth * NEST)
    .pr(EDGE)
    .whitespace_normal()
    .when(b.isStrong, e => e.text_size(HEAD_TEXT).line_height(HEAD_LINE))
    .child(text)
    .when(buttons.length > 0, e =>
      e.child(h_flex().flex_none().items_center().gap(CONTROL_GAP).pl(CONTROL_GAP).children(buttons)),
    )
}
