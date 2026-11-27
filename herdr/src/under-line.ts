import { FAINT_OPACITY, ENTER_FADE_MS, LEAVE_FADE_MS, ROW_STATE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { isStatusUnder, statusKindOf } from './held-line'
import { isGrowingFrom } from './panel-steps'
import type { PanelSpace } from './panel-steps'

type Line = NonNullable<RowBlock['feedback']>

/**
 * The status a row draws under its buttons, such as "Sending…", as it comes and goes: the line, when it came or
 * started to leave, whether it leaves, whether it came in a draw that followed the person's input, and whether it came
 * back while it was leaving. A line whose words change in place keeps its time. `waitMs` is how long a line waits from
 * `since` before it fades in: one the row's growing box pushed down (`pushUnder`), or one that came in the space of a
 * line that faded out. `next` is the line that takes a leaving line's place once it has faded out.
 */
export type UnderLine<L = Line> = {
  line: L
  since: number
  isLeaving: boolean
  isInput: boolean
  isBack?: true
  waitMs?: number
  next?: L
}

/**
 * How the status under a row's buttons draws: its line, and its opacity with the fade toward it, or null at rest.
 * `isNew` marks the first draw of a line that comes, which holds no space yet.
 */
export type UnderMotion<L = Line> = { line: L; opacity: number | null; fadeMs: number; delayMs: number; isNew: boolean }

const LEAVE_ENDS_MS = NEXT_FRAME_MS + LEAVE_FADE_MS

/** How long after it came a line that comes draws at rest. */
const restsAfter = (u: UnderLine<unknown>): number =>
  u.waitMs === undefined ? ROW_STATE_MS.entering : u.waitMs + ENTER_FADE_MS

const lineOf = (b: Block): Line | null => (b.kind === 'row' && isStatusUnder(b) ? b.feedback : null)

/**
 * The status under a block's buttons at `now`, after `last`. A line that comes stays drawn and grows the row's box
 * from the draw after it. One that goes from a row that stays open stays drawn while it fades and the box holds, until
 * its fade ends. A row that closes or settles takes it away with its panel, and a line the person's input takes away
 * goes at once, as a press shows what it did at once.
 */
export const stepUnder = (
  last: UnderLine | null,
  b: Block,
  now: number,
  isInput = false,
  height?: number,
): UnderLine | null =>
  stepLine(
    last,
    lineOf(b),
    b.kind === 'row' && isOpenRow(b) && !b.settled,
    now,
    isInput,
    (x, y) => statusKindOf(x) === statusKindOf(y),
    height,
  )

/**
 * A line that comes and goes in a block, at `now`, after `last`, as `stepUnder` says. `isSameForm` says the block
 * keeps the form it drew the line in, so a line that goes stays drawn while it fades. A line that `isSameLine` reads as
 * another, such as "Explaining…" turning into "Queued: Explain", or "Refreshing PR #31…" into "Could not refresh PR
 * #31", takes the old line's place once it has faded out, as `replaced` says. A line that was still coming in, which its
 * growing box may cut, or one the person's press brings, comes again from this draw, since its box grows again to its
 * new height. `height` is the line's measured height, which says when its fade in ends.
 */
export function stepLine<L>(
  last: UnderLine<L> | null,
  line: L | null,
  isSameForm: boolean,
  now: number,
  isInput: boolean,
  isSameLine: (a: L, b: L) => boolean = () => true,
  height?: number,
): UnderLine<L> | null {
  const isReplaced = last !== null && line !== null && !isSameLine(last.line, line) && isSameForm && !isInput
  if (last?.next !== undefined || (isReplaced && (last.isLeaving || isShown(last, now, height))))
    return replaced(last, line, isSameForm, now, isInput, isSameLine)
  if (line && last?.isLeaving) return cameBack(line, now, isInput)
  if (!line) return leaving(last, isSameForm, now, isInput)
  if (!last) return { line, since: now, isLeaving: false, isInput }
  if (isSameLine(last.line, line)) return { ...last, line }
  const waitMs = last.waitMs === undefined ? 0 : last.since + last.waitMs - now
  const isEntering = now < last.since + restsAfter(last)

  return {
    line,
    since: now,
    isLeaving: false,
    isInput: isInput || (isEntering && last.isInput),
    ...(isEntering && waitMs > 0 ? { waitMs } : {}),
  }
}

/**
 * Whether a line shows whole at `now`, past the start a growing box may cut: one that came back, one whose fade in has
 * ended, as `underMotion` draws it for its measured `height`, or one at rest.
 */
function isShown(u: UnderLine<unknown>, now: number, height: number | undefined): boolean {
  const fadedInAt =
    u.waitMs === undefined && height !== undefined
      ? u.since + NEXT_FRAME_MS + enterDelayMs(height) + ENTER_FADE_MS
      : u.since + restsAfter(u)

  return u.isBack === true || now >= Math.min(fadedInAt, u.since + restsAfter(u))
}

/**
 * A line that `line`, of another kind, takes the place of: it fades out while its space holds, then `line` comes in
 * that space, hidden for a draw while its height is measured, then fading in. A row's box that grows to a taller line
 * holds it hidden until the box is nearly open (`pushUnder`). The old line coming back fades back in. A line the
 * person's press brings shows at once, and a line that goes leaves as `stepLine` says.
 */
function replaced<L>(
  last: UnderLine<L>,
  line: L | null,
  isSameForm: boolean,
  now: number,
  isInput: boolean,
  isSameLine: (a: L, b: L) => boolean,
): UnderLine<L> | null {
  const { next: _, ...old } = last
  if (!line) return leaving(old, isSameForm, now, isInput)
  if (isSameLine(old.line, line)) return old.isLeaving ? cameBack(line, now, isInput) : { ...old, line }
  if (isInput || !isSameForm) return { line, since: now, isLeaving: false, isInput }
  if (!old.isLeaving) return { ...old, since: now, isLeaving: true, next: line }
  if (now < old.since + LEAVE_ENDS_MS) return { ...old, next: line }

  return { line, since: now, isLeaving: false, isInput: false, waitMs: NEXT_FRAME_MS }
}

/**
 * A line that comes back while the line before it leaves, in the space that line holds: it fades back in from the
 * opacity the leaving line shows, or, when the person's input brings it, starts faint, as a line their press brings does.
 */
const cameBack = <L>(line: L, now: number, isInput: boolean): UnderLine<L> =>
  isInput
    ? { line, since: now, isLeaving: false, isInput, waitMs: NEXT_FRAME_MS }
    : { line, since: now, isLeaving: false, isInput, isBack: true }

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
 * may cut it, and others start hidden. A line that comes back while it leaves keeps its space, as `cameBack` says. A line that goes fades out from the draw after it starts.
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
  if (now >= u.since + restsAfter(u)) return at(null, 0, 0)
  if (u.isBack) return at(1, ENTER_FADE_MS, 0)

  if (isStart) return at(u.isInput ? FAINT_OPACITY : 0, 0, 0, u.waitMs === undefined)
  const delayMs = u.waitMs === undefined ? enterDelayMs(height ?? 0) : Math.max(0, u.since + u.waitMs - now)

  return at(1, ENTER_FADE_MS, delayMs)
}

/**
 * How long the status under a row's buttons waits, from this draw, when the row's box starts to grow above it, or null
 * when it does not: until the box's spring toward its new height is nearly open, or, in the draw a press opens the
 * reply field, whose height the next draw measures, as long as any box takes to be nearly open.
 */
export function underPushMs(
  last: { block: Block; restSpace: PanelSpace | null } | undefined,
  b: Block,
  space: PanelSpace,
): number | null {
  if (!last || b.kind !== 'row' || last.block.kind !== 'row') return null
  if (isGrowingFrom(last.restSpace, space)) return enterDelayMs(space.to, space.box)

  return b.field !== null && last.block.field === null ? HEIGHT_SETTLE_MS - ENTER_FADE_MS : null
}

/**
 * The status under a row's buttons once the row's box starts to grow above it, as when the reply field opens over
 * "Explaining…". The box holds its height for a draw, then glides, so the line slides under its edge. A line that shows
 * steps to `FAINT_OPACITY` and one still hidden stays hidden. Either fades in once the box is nearly open, `waitMs`
 * from this draw, so the edge cuts it only while it is that faint.
 */
export function pushUnder(u: UnderLine | null, waitMs: number | null, now: number): UnderLine | null {
  if (!u || u.isLeaving || waitMs === null) return u
  const isHidden = now < u.since + restsAfter(u) && !u.isInput && !u.isBack

  return { line: u.line, since: now, isLeaving: false, isInput: !isHidden, waitMs }
}

/** When a status under a row's buttons next changes how it draws. */
export const underTimes = (u: UnderLine<unknown> | null): number[] =>
  !u
    ? []
    : u.isLeaving
      ? [u.since + NEXT_FRAME_MS, u.since + LEAVE_ENDS_MS]
      : [u.since + NEXT_FRAME_MS, u.since + restsAfter(u)]

export const underId = (id: string): string => `status ${id}`
