import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import { NEEDS_YOU_MARKS } from '../../hooks/help'
import { RUNNING_PULSE_MS } from '../../hooks/timing'
import type { Button, Mark } from './blocks'
import { BUTTON_H, CONTROL_GAP, INSET, INSIDE_GAP, MARK_W, colorOf } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { checkboxEl } from './paint-checkbox'
import { TIMED_W, timeLeftEl } from './paint-timer'

/**
 * A button takes the look of its emphasis: `primary` filled, `normal` outlined, `quiet` a label with no side padding,
 * so a quiet button that starts a line puts its label where the text above it starts. A button whose press is out keeps its size, loses
 * its fill and border, and is the quietest thing in its row. A timed button's time left stays drawn and pauses while
 * its press is out. A hidden button keeps its place and draws nothing. A button of a block that is leaving draws but
 * takes no clicks, so the block keeps its height as it fades. A button that takes no clicks shows no hover or pressed
 * change.
 */
export function buttonEl(b: Button, p: Paint, isInert = false, isShrinkable = false): Element {
  const { t } = p
  const isPill = b.emphasis !== 'quiet'
  const runsOutAt = b.runsOutAt
  const left = p.timeLeft.get(b.id)
  const base = h_flex()
    .id(`button ${b.id}`)
    .when(!isShrinkable, e => e.flex_none())
    .when(isShrinkable, e => e.flex_shrink_1().min_w(0))
    .h(BUTTON_H)
    .items_center()
    .justify_center()
    .accessibility_label(b.label)
    .when(runsOutAt !== undefined, e =>
      e
        .relative()
        .w(TIMED_W)
        .rounded(BUTTON_H / 2),
    )
    .when(left !== undefined, e => (left ? e.child(timeLeftEl(b.id, left, runsOutAt ?? 0, p.now, t)) : e))
    .child(isShrinkable ? div().min_w(0).truncate().child(b.label) : b.label)
  const shaped =
    isPill && runsOutAt === undefined
      ? base
          .px(INSET)
          .rounded(BUTTON_H / 2)
          .border_1()
      : base
  if (b.isHidden) return shaped.invisible().disabled(true)
  if (b.isOut) return shaped.border_color(CLEAR).text_color(t.muted).opacity(0.5).disabled(true)
  const styled =
    b.emphasis === 'primary'
      ? shaped.border_color(t.solid).bg(t.solid).text_color(t.solid_foreground)
      : b.emphasis === 'normal'
        ? shaped.border_color(t.input).text_color(t.foreground)
        : shaped.text_color(t.muted)
  if (isInert) return styled
  const live =
    b.emphasis === 'primary'
      ? styled.hover(s => s.opacity(0.85)).active(s => s.opacity(0.7))
      : b.emphasis === 'normal'
        ? styled.hover(s => s.bg(t.hover)).active(s => s.bg(t.selected))
        : styled.hover(s => s.text_color(t.foreground)).active(s => s.text_color(t.foreground).opacity(0.7))

  return live.on_click((e, cx) => {
    cx.stop_propagation()
    p.press(b, cx, e.modifiers.alt)
  })
}

const CLEAR = '#00000000'

/** The buttons wrap by line. The follow-ups, which come last, share one group, so they wrap to the next line together. */
export const buttonsEl = (buttons: Button[], p: Paint, indent: number, isInert = false): Element => {
  const followUps = buttons.filter(b => b.isFollowUp)
  const others = buttons.filter(b => !b.isFollowUp)

  return h_flex()
    .flex_wrap()
    .items_center()
    .gap(CONTROL_GAP)
    .pt(CONTROL_GAP)
    .pl(indent)
    .children(others.map(b => buttonEl(b, p, isInert)))
    .when(followUps.length > 0, e =>
      e.child(
        h_flex()
          .flex_wrap()
          .items_center()
          .gap_x(CONTROL_GAP)
          .gap_y(INSIDE_GAP)
          .children(followUps.map(b => buttonEl(b, p, isInert))),
      ),
    )
}

/** A mark, at the start of the column that hangs before the text, so a tab's first marks sit on the panel's edge. */
export const markEl = (m: Mark | null, t: Theme, tint: Theme[keyof Theme] | null = null): Element =>
  m?.text === NEEDS_YOU_MARKS.task.mark
    ? div()
        .w(MARK_W)
        .flex_none()
        .child(checkboxEl(tint ?? (m.tone === null ? t.muted : colorOf(t, m.tone))))
    : div()
        .w(MARK_W)
        .flex_none()
        .text_color(tint ?? (m === null || m.tone === null ? t.muted : colorOf(t, m.tone)))
        .when(m?.isRunning === true, e => e.loop('opacity', { from: 1, to: 0.3, period: RUNNING_PULSE_MS }))
        .child(m?.text ?? '')

export const lineEl = (text: string, color: Theme[keyof Theme], indent: number = MARK_W) =>
  div().pl(indent).pt(INSIDE_GAP).whitespace_normal().text_color(color).child(text)

/** A press's result under the buttons that were pressed, a step below them as the buttons are below their text. */
export const resultLineEl = (text: string, color: Theme[keyof Theme], indent: number = MARK_W) =>
  lineEl(text, color, indent).pt(CONTROL_GAP)
