import { ENTER_FADE_MS, LEAVE_FADE_MS, ROW_STATE_MS, enterDelayMs } from '../../hooks/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { isStatusUnder } from './held-line'

type Line = NonNullable<RowBlock['feedback']>

/**
 * The status a row draws under its buttons, such as "Sending…", as it comes and goes: the line, when it came or
 * started to leave, whether it leaves, and whether it came in a draw that followed the person's input. A line whose
 * words change in place keeps its time.
 */
export type UnderLine = { line: Line; since: number; isLeaving: boolean; isInput: boolean }

/** How the status under a row's buttons draws: its line, and its opacity with the fade toward it, or null at rest. */
export type UnderMotion = { line: Line; opacity: 0 | 1 | null; fadeMs: number; delayMs: number }

const LEAVE_ENDS_MS = NEXT_FRAME_MS + LEAVE_FADE_MS

const lineOf = (b: Block): Line | null => (b.kind === 'row' && isStatusUnder(b) ? b.feedback : null)

/**
 * The status under a block's buttons at `now`, after `last`. A line that comes stays drawn and grows the row's box
 * from the draw after it. One that goes from a row that stays open stays drawn while it fades and the box holds, until
 * its fade ends. A row that closes or settles takes it away with its panel, and a line the person's input takes away
 * goes at once, as a press shows what it did at once.
 */
export function stepUnder(last: UnderLine | null, b: Block, now: number, isInput = false): UnderLine | null {
  const line = lineOf(b)
  if (line) return last && !last.isLeaving ? { ...last, line } : { line, since: now, isLeaving: false, isInput }
  const isSameForm = b.kind === 'row' && isOpenRow(b) && !b.settled
  if (!last || !isSameForm || isInput) return null
  if (!last.isLeaving) return { ...last, since: now, isLeaving: true }

  return now < last.since + LEAVE_ENDS_MS ? last : null
}

/**
 * A line the person's press brings shows in the press's draw. Another line that comes is hidden in its first draw,
 * which sets the row's box growing, and fades in once the box is nearly open, `height` being the line's measured
 * height. A line that goes fades out from the draw after it starts.
 */
export function underMotion(u: UnderLine | null, now: number, height: number | undefined): UnderMotion | null {
  if (!u) return null
  if (u.isInput && !u.isLeaving) return { line: u.line, opacity: null, fadeMs: 0, delayMs: 0 }
  const isStart = now === u.since
  if (u.isLeaving) return { line: u.line, opacity: isStart ? 1 : 0, fadeMs: LEAVE_FADE_MS, delayMs: 0 }
  if (now >= u.since + ROW_STATE_MS.entering) return { line: u.line, opacity: null, fadeMs: 0, delayMs: 0 }

  return { line: u.line, opacity: isStart ? 0 : 1, fadeMs: ENTER_FADE_MS, delayMs: enterDelayMs(height ?? 0) }
}

/** When a status under a row's buttons next changes how it draws. */
export const underTimes = (u: UnderLine | null): number[] =>
  !u ? [] : u.isLeaving ? [u.since + NEXT_FRAME_MS, u.since + LEAVE_ENDS_MS] : [u.since + NEXT_FRAME_MS, u.since + ROW_STATE_MS.entering]

export const underId = (id: string): string => `status ${id}`
