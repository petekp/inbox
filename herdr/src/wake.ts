import { NEXT_FRAME_MS } from './block-glide'
import type { moveRows } from './motion'
import { timeLeftNextAt } from './time-left'

/**
 * When the look next redraws for its own drawing: the next frame of a move, the next step of an Undo's fill, or the
 * start of a held fade or a held line's next step (`heldAt`). The shared controller's wake covers the rest, such as a
 * fold, a title tint's step and an Undo ending.
 */
export function nextDrawAt(now: number, moved: ReturnType<typeof moveRows>, heldAt: (number | null)[]): number | null {
  const isStarting = [...moved.motion.values()].some(m => m.isStart)
  const wakeAt = [
    isStarting ? now + NEXT_FRAME_MS : null,
    moved.nextAt,
    timeLeftNextAt(moved.blocks, now),
    ...heldAt,
  ].filter(at => at !== null)

  return wakeAt.length === 0 ? null : Math.min(...wakeAt)
}
