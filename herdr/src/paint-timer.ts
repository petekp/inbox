import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { BUTTON_H } from './paint-theme'
import type { Theme } from './paint-theme'
import { timeLeftShare } from './time-left'
import type { TimeLeft } from './time-left'

/** A timed button's width, fixed so the button keeps its size and place while its time runs and once it is spent. */
export const TIMED_W = 64

/**
 * The fill behind a timed button's label. While its time runs it empties, as the Codex tab's Undo does: GPUI animates
 * a later change to `width`, so the draw that starts a fill sets the share left, and each later draw sets 0 over the
 * time left. A paused fill holds its share with no animation.
 *
 * The fill is a pill of the button's shape, cut by a rectangle as wide as the share left, so it never draws outside
 * the button. It relies only on a rectangular clip: GPUI's `overflow_hidden` is not known to clip to rounded corners.
 */
export function timeLeftEl(left: TimeLeft, runsOutAt: number, now: number, t: Theme): Element {
  const cut = div()
    .absolute()
    .top(0)
    .left(0)
    .h(BUTTON_H)
    .overflow_hidden()
    .child(
      div()
        .w(TIMED_W)
        .h(BUTTON_H)
        .rounded(BUTTON_H / 2)
        .bg(t.hover),
    )
  if (left.is === 'paused') return cut.w(left.share * TIMED_W)
  return cut
    .w(left.isStarted ? 0 : timeLeftShare(runsOutAt, now) * TIMED_W)
    .transition('width', { duration: Math.max(0, runsOutAt - now), easing: 'linear' })
}
