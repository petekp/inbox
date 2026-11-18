import { earliestOf } from '../../hooks/timing'
import type { LookUi } from './draw'
import { NEXT_FRAME_MS } from './block-glide'
import type { moveRows } from './motion'
import { titleTintNextAt } from './paint-title-tint'
import type { screenOf } from './screen'
import { timeLeftNextAt } from './time-left'

type InboxScreen = Extract<ReturnType<typeof screenOf>, { is: 'inbox' }>

/** When the look next redraws on its own: the next frame of a move, a fold or an Undo ending, or a fading bar. */
export function nextDrawAt(
  now: number,
  ui: LookUi,
  screen: Pick<InboxScreen, 'foldAt' | 'undoPlaceEndsAt' | 'timedChangeAt'>,
  moved: ReturnType<typeof moveRows>,
): number | null {
  const isStarting = [...moved.motion.values()].some(m => m.isStart)
  const timed = earliestOf([
    timeLeftNextAt(moved.blocks, now),
    titleTintNextAt(ui.newRows, moved.blocks, ui.closedSeen, now),
  ])
  const wakeAt = [
    isStarting ? now + NEXT_FRAME_MS : null,
    moved.nextAt,
    screen.foldAt,
    screen.undoPlaceEndsAt,
    screen.timedChangeAt,
    timed,
  ].filter(at => at !== null)

  return wakeAt.length === 0 ? null : Math.min(...wakeAt)
}
