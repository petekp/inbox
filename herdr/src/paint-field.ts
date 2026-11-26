import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, v_flex } from 'gpui-base'
import { ENTER_FADE_MS } from '../../core/view/row-motion'
import type { Field } from './blocks'
import type { FieldOpening } from './field-wait'
import { BOX_RADIUS, BUTTON_H, INSET, SMALL_GAP } from './paint-theme'
import type { Paint } from './paint-theme'
import { buttonsEl, fadeEl } from './paint-parts'

/**
 * A field and its buttons. A field a press brings in shows its text field as soon as its box opens, while its buttons,
 * at the bottom of that box, fade in once the box is nearly open, after `opening`'s delay, as an entering block's content does. A
 * leaving field keeps its buttons' fade toward shown, so buttons closed mid-fade go on from where they are while the
 * field fades out, instead of drawing at full opacity.
 */
export function fieldEl(
  f: Field,
  p: Paint,
  indent: number,
  isInert = false,
  opening: FieldOpening | null = null,
): Element {
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

  const glide = { duration: ENTER_FADE_MS, delay: opening?.delayMs ?? 0 }
  const key = `buttons ${f.rowId}`

  return v_flex()
    .pl(indent)
    .children(input)
    .child(
      buttonsEl(f.buttons, p, 0, isInert).when(opening !== null, e =>
        fadeEl(e.id(key), key, opening?.isOpen ? 1 : 0, glide, p),
      ),
    )
}
