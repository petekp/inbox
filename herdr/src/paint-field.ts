import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, v_flex } from 'gpui-base'
import type { Field } from './blocks'
import { BOX_RADIUS, BUTTON_H, INSET, SMALL_GAP } from './paint-theme'
import type { Paint } from './paint-theme'
import { buttonsEl } from './paint-parts'

export function fieldEl(f: Field, p: Paint, indent: number, isInert = false): Element {
  const { t } = p
  const state = p.input(f.rowId)
  const input = state
    ? [
        div()
          .min_h(BUTTON_H)
          .px(INSET)
          .py(SMALL_GAP)
          .rounded(BOX_RADIUS)
          .border_1()
          .border_color(t.input)
          .child(Input.new(state).w_full()),
      ]
    : []

  return v_flex()
    .pl(indent)
    .children(input)
    .child(buttonsEl(f.buttons, p, 0, isInert))
}
