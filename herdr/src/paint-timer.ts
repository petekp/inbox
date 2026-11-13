import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { SETTLED_MS } from '../../hooks/timing'
import type { Block, Button } from './blocks'
import { BUTTON_H } from './paint-theme'
import type { Theme } from './paint-theme'

/** A timed button's width, fixed so the button keeps its size and place while its time runs and once it is spent. */
export const TIMED_W = 64

/** The share of a button's time left at `now`: 1 as its time starts, 0 once it has run out. */
export function timeLeftShare(runsOutAt: number, now: number): number {
  return Math.min(1, Math.max(0, (runsOutAt - now) / SETTLED_MS))
}

/** Whether a button draws its time left: it has time left, and its press is not out. */
export const isTimeShown = (b: Button, now: number): boolean =>
  b.runsOutAt !== undefined && !b.isOut && b.runsOutAt > now

/** The ids of the drawn buttons that show their time left. */
export const timedIds = (blocks: Block[], now: number): string[] =>
  blocks.flatMap(b => (b.kind === 'row' ? b.buttons : [])).flatMap(b => (isTimeShown(b, now) ? [b.id] : []))

/**
 * The fill behind a timed button's label, which empties as its time runs, as the Codex tab's Undo does. GPUI animates
 * a later change to `width`, so the draw that starts a fill sets the share left, and each later draw sets 0 over the
 * time left.
 */
export function timeLeftEl(runsOutAt: number, isStarted: boolean, now: number, t: Theme): Element {
  return div()
    .absolute()
    .top(0)
    .left(0)
    .h(BUTTON_H)
    .rounded(BUTTON_H / 2)
    .bg(t.hover)
    .w(isStarted ? 0 : timeLeftShare(runsOutAt, now) * TIMED_W)
    .transition('width', { duration: Math.max(0, runsOutAt - now), easing: 'linear' })
}
