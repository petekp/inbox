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

/**
 * How a timed button draws its time left. It empties while its time runs, and `isStarted` says an earlier draw
 * already showed it. While its own press is out it pauses at the share it had when the press went out, as the Codex
 * tab pauses its Undo's fill.
 */
export type TimeLeft = { is: 'emptying'; isStarted: boolean } | { is: 'paused'; share: number }

function timeLeftOf(b: Button, drawn: ReadonlyMap<string, TimeLeft>, now: number): TimeLeft | null {
  if (b.runsOutAt === undefined || b.isHidden) return null
  const was = drawn.get(b.id)
  if (b.isOut) return { is: 'paused', share: was?.is === 'paused' ? was.share : timeLeftShare(b.runsOutAt, now) }
  return b.runsOutAt > now ? { is: 'emptying', isStarted: was?.is === 'emptying' } : null
}

/** The time left of each drawn timed button that shows one, from what the last draw showed. */
export function timeLeftDraws(
  blocks: Block[],
  drawn: ReadonlyMap<string, TimeLeft>,
  now: number,
): ReadonlyMap<string, TimeLeft> {
  const buttons = blocks.flatMap(b => (b.kind === 'row' ? b.buttons : []))
  return new Map(
    buttons.flatMap(b => {
      const left = timeLeftOf(b, drawn, now)
      return left ? [[b.id, left] as const] : []
    }),
  )
}

/**
 * The fill behind a timed button's label. While its time runs it empties, as the Codex tab's Undo does: GPUI animates
 * a later change to `width`, so the draw that starts a fill sets the share left, and each later draw sets 0 over the
 * time left. A paused fill holds its share with no animation.
 */
export function timeLeftEl(left: TimeLeft, runsOutAt: number, now: number, t: Theme): Element {
  const fill = div()
    .absolute()
    .top(0)
    .left(0)
    .h(BUTTON_H)
    .rounded(BUTTON_H / 2)
    .bg(t.hover)
  if (left.is === 'paused') return fill.w(left.share * TIMED_W)
  return fill
    .w(left.isStarted ? 0 : timeLeftShare(runsOutAt, now) * TIMED_W)
    .transition('width', { duration: Math.max(0, runsOutAt - now), easing: 'linear' })
}
