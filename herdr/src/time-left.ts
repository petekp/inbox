import { SETTLED_MS } from '../../hooks/timing'
import type { Block, Button } from './blocks'

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
