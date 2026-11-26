import { PathBuilder, div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { Theme } from './paint-theme'

const CHECKBOX_PX = 11
const CHECK_PATH = PathBuilder.stroke(1.5).move_to('27%', '53%').line_to('43%', '69%').line_to('74%', '31%').build()

/**
 * The Tasks heading's ☑, or an open task's □ when `isChecked` is false, as a box drawn as a shape, since the font's
 * boxes are small beside the other marks.
 */
export const checkboxEl = (color: Theme[keyof Theme], isChecked = true): Element =>
  div()
    .relative()
    .flex_none()
    .w(CHECKBOX_PX)
    .h(CHECKBOX_PX)
    .border_1()
    .border_color(color)
    .rounded(3)
    .when(isChecked, e =>
      e.child(
        window
          .paint_path(CHECK_PATH, color)
          .absolute()
          .top(0)
          .left(0)
          .size(`${CHECKBOX_PX - 2}px`),
      ),
    )
