import { SETTLED_MS } from '../../core/view/timing'
import type { Block, Button } from './blocks'

/** The share of a button's time left at `now`: 1 as its time starts, 0 once it has run out. */
export function timeLeftShare(runsOutAt: number, now: number): number {
  return Math.min(1, Math.max(0, (runsOutAt - now) / SETTLED_MS))
}

/**
 * How far ahead of its clock each draw sets an emptying fill, and how often the look draws while one empties. A fill
 * drawn on an element with no earlier width shows its share at most this far ahead, which is 3 px of a timed button.
 */
export const TIME_LEFT_STEP_MS = 250

/**
 * How a timed button draws its time left. It empties while its time runs. While its own press is out it pauses at the
 * share it had when the press went out, as the Codex tab pauses its Undo's fill.
 */
export type TimeLeft = { is: 'emptying' } | { is: 'paused'; share: number }

function timeLeftOf(b: Button, drawn: ReadonlyMap<string, TimeLeft>, now: number): TimeLeft | null {
  if (b.runsOutAt === undefined || b.isHidden) return null
  const was = drawn.get(b.id)
  if (b.isOut) return { is: 'paused', share: was?.is === 'paused' ? was.share : timeLeftShare(b.runsOutAt, now) }
  return b.runsOutAt > now ? { is: 'emptying' } : null
}

const timedButtons = (blocks: Block[]): Button[] =>
  blocks.flatMap(b => (b.kind === 'row' ? b.buttons : [])).filter(b => b.runsOutAt !== undefined && !b.isHidden)

/** The time left of each drawn timed button that shows one, from what the last draw showed. */
export function timeLeftDraws(
  blocks: Block[],
  drawn: ReadonlyMap<string, TimeLeft>,
  now: number,
): ReadonlyMap<string, TimeLeft> {
  return new Map(
    timedButtons(blocks).flatMap(b => {
      const left = timeLeftOf(b, drawn, now)
      return left ? [[b.id, left] as const] : []
    }),
  )
}

/**
 * When the look draws next for its timed buttons: a step on while a fill empties, and when a button's time runs out,
 * so a spent button does not stay drawn until something else redraws. Null when no button's time runs.
 */
export function timeLeftNextAt(blocks: Block[], now: number): number | null {
  const ends = timedButtons(blocks)
    .filter(b => !b.isOut && (b.runsOutAt ?? 0) > now)
    .map(b => Math.min(b.runsOutAt ?? 0, now + TIME_LEFT_STEP_MS))

  return ends.length > 0 ? Math.min(...ends) : null
}
