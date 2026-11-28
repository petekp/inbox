import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { NEEDS_YOU_MARKS, TASK_MARK } from '../../core/view/help'
import { RUNNING_PULSE_MS } from '../../core/view/timing'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import { NEXT_FRAME_MS } from './block-glide'
import type { Button, Mark } from './blocks'
import {
  BUTTON_H,
  BUTTON_LABEL_X,
  BUTTON_PAD_X,
  BUTTON_PAD_Y,
  CONTROL_GAP,
  INSIDE_GAP,
  LINE_HEIGHT,
  MARK_W,
  colorOf,
  supportingOf,
} from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { checkboxEl } from './paint-checkbox'
import { TIMED_W, timeLeftEl } from './paint-timer'
import type { HeldFades } from './held-fades'

/**
 * A button takes the look of its emphasis: `primary` filled, `normal` outlined, `quiet` a label with no side padding,
 * so a quiet button that starts a line puts its label where the text above it starts. A button whose press is out keeps its size, loses
 * its fill and border, and is the quietest thing in its row. A timed button's time left stays drawn and pauses while
 * its press is out. A spent Undo keeps its place, drawn as quiet as a button whose press is out. A button of a block that is leaving draws but
 * takes no clicks, so the block keeps its height as it fades. A button that takes no clicks shows no hover or pressed
 * change. A button that `canWrap` narrows to its line and wraps its label onto more lines, growing a line's height for
 * each. A timed button keeps one line, since its time left fills it. A button on a tinted fill, such as a banner's, names
 * that fill as `under`: its label while its press is out takes the supporting text level over it, since a faded muted
 * label is hard to read there.
 */
export function buttonEl(b: Button, p: Paint, isInert = false, canWrap = false, under?: Theme[keyof Theme]): Element {
  const { t } = p
  const isPill = b.emphasis !== 'quiet'
  const runsOutAt = b.runsOutAt
  const left = p.timeLeft.get(b.id)
  const isWrapping = canWrap && runsOutAt === undefined
  const base = h_flex()
    .id(b.isSpent ? `spent ${b.id}` : `button ${b.id}`)
    .when(!isWrapping, e => e.flex_none().h(BUTTON_H))
    .when(isWrapping, e => e.flex_shrink_1().min_w(0).min_h(BUTTON_H).py(BUTTON_PAD_Y))
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
    .child(isWrapping ? div().min_w(0).whitespace_normal().child(b.label) : labelEl(b))
  const shaped = !isPill
    ? base
    : runsOutAt === undefined
      ? base
          .px(BUTTON_PAD_X)
          .rounded(BUTTON_H / 2)
          .border_1()
      : base.border_1()
  if (b.isSpent) {
    const spent = shaped.text_color(t.muted).opacity(SPENT_OPACITY).disabled(true)
    if (b.leftAt === undefined) return spent
    const opacity = p.now < b.leftAt + NEXT_FRAME_MS ? SPENT_OPACITY : 0
    return fadeEl(spent, `spent ${b.id}`, opacity, { duration: LEAVE_FADE_MS, delay: 0 }, p)
  }
  if (b.isOut && under) return shaped.border_color(CLEAR).text_color(supportingOf(t, under)).disabled(true)
  if (b.isOut) return shaped.border_color(CLEAR).text_color(t.muted).opacity(SPENT_OPACITY).disabled(true)
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

/** The label, over hidden copies of the button's other labels, which hold the width of the widest. */
const labelEl = (b: Button): Element | string =>
  b.labels
    ? v_flex()
        .items_center()
        .child(b.label)
        .children(b.labels.filter(l => l !== b.label).map(l => div().invisible().h(0).child(l)))
    : b.label

const CLEAR = '#00000000'

/** How far a button whose press is out, or a spent Undo, fades back, so it is the quietest thing in its row. */
const SPENT_OPACITY = 0.5

/**
 * The buttons wrap by line, and a button wider than its line wraps its label. The follow-ups, which come last, share
 * one group, so they wrap to the next line together.
 */
export const buttonsEl = (
  buttons: Button[],
  p: Paint,
  indent: number,
  isInert = false,
  followsAnswers = false,
  above: number = CONTROL_GAP,
): Element => {
  const outdent = followsAnswers ? BUTTON_LABEL_X : 0
  const followUps = buttons.filter(b => b.isFollowUp)
  const others = buttons.filter(b => !b.isFollowUp)

  return h_flex()
    .flex_wrap()
    .items_center()
    .gap(CONTROL_GAP)
    .pt(above)
    .pl(indent - outdent)
    .children(others.map(b => buttonEl(b, p, isInert, true)))
    .when(followUps.length > 0, e =>
      e.child(
        h_flex()
          .flex_wrap()
          .items_center()
          .ml(outdent)
          .gap_x(CONTROL_GAP)
          .gap_y(INSIDE_GAP)
          .children(followUps.map(b => buttonEl(b, p, isInert))),
      ),
    )
}

/** A mark, at the start of the column that hangs before the text, so a tab's first marks sit on the panel's edge. */
export const markEl = (m: Mark | null, t: Theme, tint: Theme[keyof Theme] | null = null): Element =>
  m?.text === NEEDS_YOU_MARKS.task.mark || m?.text === TASK_MARK.mark
    ? h_flex()
        .w(MARK_W)
        .h(LINE_HEIGHT)
        .flex_none()
        .items_center()
        .child(
          checkboxEl(tint ?? (m.tone === null ? t.muted : colorOf(t, m.tone)), m.text === NEEDS_YOU_MARKS.task.mark),
        )
    : div()
        .w(MARK_W)
        .flex_none()
        .text_color(tint ?? (m === null || m.tone === null ? t.muted : colorOf(t, m.tone)))
        .when(m?.isRunning === true, e => e.loop('opacity', { from: 1, to: 0.3, period: RUNNING_PULSE_MS }))
        .child(m?.text ?? '')

export const lineEl = (text: string, color: Theme[keyof Theme], indent: number = MARK_W) =>
  div().pl(indent).pt(INSIDE_GAP).whitespace_normal().text_color(color).child(text)

/** `el` fading to `opacity`, eased out, as the paint's `HeldFades` holds the fade named `name`. */
export function fadeEl(
  el: Element,
  name: string,
  opacity: number,
  glide: { duration: number; delay: number },
  p: { fades: HeldFades; now: number },
): Element {
  const handed = p.fades.fade(name, opacity, glide.duration, glide.delay, p.now)

  return el.opacity(handed.opacity).transition('opacity', { duration: handed.ms, easing: 'ease-out' })
}
