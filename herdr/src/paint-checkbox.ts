import { PathBuilder, div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { Theme } from './paint-theme'

const CHECKBOX_PX = 11
const CHECK_PATH = PathBuilder.stroke(1.5).move_to('27%', '53%').line_to('43%', '69%').line_to('74%', '31%').build()

/** The Tasks mark, a checked box drawn as a shape, since the font's ☑ is small beside the other marks. */
export const checkboxEl = (color: Theme[keyof Theme]): Element =>
  div()
    .relative()
    .flex_none()
    .w(CHECKBOX_PX)
    .h(CHECKBOX_PX)
    .border_1()
    .border_color(color)
    .rounded(3)
    .child(
      window
        .paint_path(CHECK_PATH, color)
        .absolute()
        .top(0)
        .left(0)
        .size(`${CHECKBOX_PX - 2}px`),
    )
