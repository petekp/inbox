import { FAINT_OPACITY, ENTER_FADE_MS, LEAVE_FADE_MS, ROW_STATE_MS, enterDelayMs } from '../../core/view/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { isStatusUnder } from './held-line'

type Line = NonNullable<RowBlock['feedback']>

/**
 * The status a row draws under its buttons, such as "Sending…", as it comes and goes: the line, when it came or
 * started to leave, whether it leaves, whether it came in a draw that followed the person's input, and whether it came
 * back while it was leaving. A line whose words change in place keeps its time.
 */
export type UnderLine<L = Line> = { line: L; since: number; isLeaving: boolean; isInput: boolean; isBack?: true }

/**
 * How the status under a row's buttons draws: its line, and its opacity with the fade toward it, or null at rest.
 * `isNew` marks the first draw of a line that comes, which holds no space yet.
 */
export type UnderMotion<L = Line> = { line: L; opacity: number | null; fadeMs: number; delayMs: number; isNew: boolean }

const LEAVE_ENDS_MS = NEXT_FRAME_MS + LEAVE_FADE_MS

const lineOf = (b: Block): Line | null => (b.kind === 'row' && isStatusUnder(b) ? b.feedback : null)

/**
 * The status under a block's buttons at `now`, after `last`. A line that comes stays drawn and grows the row's box
 * from the draw after it. One that goes from a row that stays open stays drawn while it fades and the box holds, until
 * its fade ends. A row that closes or settles takes it away with its panel, and a line the person's input takes away
 * goes at once, as a press shows what it did at once.
 */
export const stepUnder = (last: UnderLine | null, b: Block, now: number, isInput = false): UnderLine | null =>
  stepLine(
    last,
    lineOf(b),
    b.kind === 'row' && isOpenRow(b) && !b.settled,
    now,
    isInput,
    (x, y) => x.source?.is === y.source?.is,
  )

/**
 * A line that comes and goes in a block, at `now`, after `last`, as `stepUnder` says. `isSameForm` says the block
 * keeps the form it drew the line in, so a line that goes stays drawn while it fades. A line that `isSameLine` reads as
 * another while it still comes, such as "Sending…" turning into a longer "Not sent", comes again from this draw, since
 * its box grows again to its new height.
 */
export function stepLine<L>(
  last: UnderLine<L> | null,
  line: L | null,
  isSameForm: boolean,
  now: number,
  isInput: boolean,
  isSameLine: (a: L, b: L) => boolean = () => true,
): UnderLine<L> | null {
  if (line && last?.isLeaving) return { line, since: now, isLeaving: false, isInput, isBack: true }
  if (!line) return leaving(last, isSameForm, now, isInput)
  if (!last) return { line, since: now, isLeaving: false, isInput }
  const isEntering = now < last.since + ROW_STATE_MS.entering

  return isEntering && !isSameLine(last.line, line)
    ? { line, since: now, isLeaving: false, isInput: last.isInput }
    : { ...last, line }
}

function leaving<L>(
  last: UnderLine<L> | null,
  isSameForm: boolean,
  now: number,
  isInput: boolean,
): UnderLine<L> | null {
  if (!last || !isSameForm || isInput) return null
  if (!last.isLeaving) return { ...last, since: now, isLeaving: true }

  return now < last.since + LEAVE_ENDS_MS ? last : null
}

/**
 * A line that comes is drawn in its first draw, which sets the row's box growing, and fades in once the box is nearly
 * open, `height` being the line's measured height, so the growing box never cuts it while it shows. A line the
 * person's press brings starts at `FAINT_OPACITY`, so the press shows in its own draw, faint enough that the growing box
 * may cut it, and others start hidden. A line that comes back while it leaves keeps its space and fades back in from
 * the opacity it shows. A line that goes fades out from the draw after it starts.
 */
export function underMotion<L>(u: UnderLine<L> | null, now: number, height: number | undefined): UnderMotion<L> | null {
  if (!u) return null
  const isStart = now === u.since
  const at = (opacity: number | null, fadeMs: number, delayMs: number, isNew = false) => ({
    line: u.line,
    opacity,
    fadeMs,
    delayMs,
    isNew,
  })
  if (u.isLeaving) return at(isStart ? 1 : 0, LEAVE_FADE_MS, 0)
  if (now >= u.since + ROW_STATE_MS.entering) return at(null, 0, 0)
  if (u.isBack) return at(1, ENTER_FADE_MS, 0)

  if (isStart) return at(u.isInput ? FAINT_OPACITY : 0, 0, 0, true)

  return at(1, ENTER_FADE_MS, enterDelayMs(height ?? 0))
}

/** When a status under a row's buttons next changes how it draws. */
export const underTimes = (u: UnderLine<unknown> | null): number[] =>
  !u
    ? []
    : u.isLeaving
      ? [u.since + NEXT_FRAME_MS, u.since + LEAVE_ENDS_MS]
      : [u.since + NEXT_FRAME_MS, u.since + ROW_STATE_MS.entering]

export const underId = (id: string): string => `status ${id}`
