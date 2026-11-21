import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import { answersFitLine } from '../../core/view/action-plan'
import type { Button, RowBlock } from './blocks'
import { CONTROL_GAP, EDGE, MARK_W, NEST, SMALL_GAP } from './paint-theme'
import { buttonEl } from './paint-parts'
import { PATH_X, lineColor } from './paint-space'
import type { Paint, Theme } from './paint-theme'

/** The trunk of a row's tree under the middle of the row's mark, from `top` to the end of its box or down to `height`. */
export const trunkEl = (top: number, height: number | `${number}%` | null, t: Theme, isSelected: boolean): Element => {
  const el = div()
    .absolute()
    .left(PATH_X - EDGE)
    .top(top)
    .w(1)
    .border_l_1()
    .border_color(lineColor(t, isSelected ? t.selected : t.background))

  return height === null ? el.bottom(0) : el.h(height)
}

/** A tree's arm, from `from` to `to` across its box and with its top edge at `top`. */
export const armEl = (from: number, to: number, top: number | `${number}%`, color: Color): Element =>
  div()
    .absolute()
    .left(from)
    .top(top)
    .w(to - from)
    .h(1)
    .border_t_1()
    .border_color(color)

/** Where an arm ends, `SMALL_GAP` before the text column, across a line under a row's title. */
export const ARM_END = NEST - SMALL_GAP

/** The key an answer's button reports its size under. */
const answerKey = (buttonId: string) => `answer ${buttonId}`

/**
 * Whether a row's answers draw side by side: when its block offers that form and the answers' buttons, as last
 * measured, fit the row's text column. Before a button first measures, its row draws them side by side, so the common
 * case of short answers draws in its final form at once.
 */
export function isSideBySide(
  r: RowBlock,
  p: Paint,
): r is RowBlock & { sideBySide: NonNullable<RowBlock['sideBySide']> } {
  if (!r.sideBySide) return false
  const widths = r.sideBySide.optionIds.map(id => p.heights.widthOf(answerKey(id)))
  if (widths.some(w => w === undefined)) return true

  return answersFitLine(widths as number[], CONTROL_GAP, p.rowTextRoom)
}

/**
 * An answer's button, or several answers' side by side, with the arm at the buttons' middle, however many lines a
 * label wraps to. The box starts at the line's left edge, as the trunk's place does. On the last answer the trunk runs
 * on from the button's top to the arm, and the arm starts on the trunk, so it fills the elbow's corner. Each button
 * reports its width, which `isSideBySide` reads. A lone answer's label wraps to the line, and side by side each button
 * keeps its whole label.
 */
export const answersEl = (
  answers: Button[],
  p: Paint,
  isInert: boolean,
  isLast: boolean,
  t: Theme,
  isSelected: boolean,
): Element => {
  const arm = armEl(PATH_X - EDGE, ARM_END, '50%', lineColor(t, isSelected ? t.selected : t.background))
  const isAlone = answers.length === 1
  const buttons = answers.map(b =>
    buttonEl(b, p, isInert, isAlone).on_size_change((size, cx) => p.measure(answerKey(b.id), size, cx, true)),
  )

  return h_flex()
    .relative()
    .min_w(0)
    .pl(MARK_W)
    .child(isAlone ? buttons[0]! : h_flex().flex_wrap().gap(CONTROL_GAP).children(buttons))
    .children(isLast ? [arm, trunkEl(0, '50%', t, isSelected)] : [arm])
}
