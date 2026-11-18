import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, v_flex } from 'gpui-base'
import { ENTER_FADE_MS, enterDelayMs } from '../../hooks/row-motion'
import type { Field } from './blocks'
import { BOX_RADIUS, BUTTON_H, INSET, SMALL_GAP } from './paint-theme'
import type { Paint } from './paint-theme'
import { buttonsEl } from './paint-parts'

/**
 * A field and its buttons. A field a press brings in shows its text field as soon as its box opens, while its buttons,
 * at the bottom of that box, fade in once the box is nearly open (`opening`), as an entering block's content does. A
 * leaving field keeps its buttons' fade toward shown, so buttons closed mid-fade go on from where they are while the
 * field fades out, instead of drawing at full opacity.
 */
export function fieldEl(
  f: Field,
  p: Paint,
  indent: number,
  isInert = false,
  opening: { isOpen: boolean; height: number } | null = null,
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

  const glide = { duration: ENTER_FADE_MS, delay: opening ? enterDelayMs(opening.height) : 0, easing: 'ease-out' as const }

  return v_flex()
    .pl(indent)
    .children(input)
    .child(
      buttonsEl(f.buttons, p, 0, isInert).when(opening !== null, e =>
        e
          .id(`buttons ${f.rowId}`)
          .opacity(opening?.isOpen ? 1 : 0)
          .transition('opacity', glide),
      ),
    )
}
