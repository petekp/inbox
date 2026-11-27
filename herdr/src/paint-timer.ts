import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { BUTTON_H, timeLeftFillOf } from './paint-theme'
import type { Theme } from './paint-theme'
import { TIME_LEFT_STEP_MS, timeLeftShare } from './time-left'
import type { TimeLeft } from './time-left'

/** A timed button's width, fixed so the button keeps its size and place while its time runs and once it is spent. */
export const TIMED_W = 64

/** The width of the border a timed pill draws, as every pill does. Its fill sits inside it. */
const BORDER_PT = 1
export const FILL_W = TIMED_W - 2 * BORDER_PT
const FILL_H = BUTTON_H - 2 * BORDER_PT

/**
 * The fill behind a timed button's label. While its time runs it empties, as the Codex tab's Undo does. Every draw sets
 * the width its clock leaves a step on, and GPUI glides a later change to `width` over that step, while the look draws
 * each step. So a fill whose element is new, with no earlier width to glide from, still shows its share. A paused fill
 * holds its share with no animation.
 *
 * The fill is a pill of the shape inside the button's border, cut by a rectangle as wide as the share left, so it never
 * draws over the border or outside the button. It relies only on a rectangular clip: GPUI's `overflow_hidden` is not known to clip to rounded corners.
 */
export function timeLeftEl(id: string, left: TimeLeft, runsOutAt: number, now: number, t: Theme): Element {
  const cut = div()
    .id(`time left ${id}`)
    .absolute()
    .top(0)
    .left(0)
    .h(FILL_H)
    .overflow_hidden()
    .child(
      div()
        .w(FILL_W)
        .h(FILL_H)
        .rounded(FILL_H / 2)
        .bg(timeLeftFillOf(t)),
    )
  if (left.is === 'paused') return cut.w(left.share * FILL_W)
  const step = Math.min(TIME_LEFT_STEP_MS, Math.max(0, runsOutAt - now))

  return cut.w(timeLeftShare(runsOutAt, now + step) * FILL_W).transition('width', { duration: step, easing: 'linear' })
}
