import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import type { Block } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'

/** A group heading's count that went: the count it last drew, and the draw it went in. */
export type CountLeft = { count: number; leftAt: number }

const endsAt = (c: CountLeft): number => c.leftAt + NEXT_FRAME_MS + LEAVE_FADE_MS

/**
 * The count a group's heading drew last, `was`, that its new form `b` drops, as when the group's last question
 * closes, or that still fades out. A count that comes back ends it.
 */
export function stepCountLeft(last: CountLeft | null, was: Block | undefined, b: Block, now: number): CountLeft | null {
  if (b.kind !== 'heading' || b.count !== null) return null
  if (was?.kind === 'heading' && was.count !== null) return { count: was.count, leftAt: now }

  return last !== null && now < endsAt(last) ? last : null
}

export const countLeftTimes = (c: CountLeft | null): number[] =>
  c === null ? [] : [c.leftAt + NEXT_FRAME_MS, endsAt(c)]
