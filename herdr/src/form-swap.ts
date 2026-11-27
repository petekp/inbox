import { ENTER_FADE_MS, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import type { RowTrack } from '../../core/view/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'
import { easeOut, opacityAt, spaceNow } from './panel-steps'
import type { PanelSpace, PanelStep } from './panel-steps'

/**
 * A row's change between its settled form and another, as it settles or as Undo brings it back. `from` is the form it
 * leaves, as last drawn, and `fromShown` the opacity its lines under the title showed then: less than 1 when a change
 * before this one had not yet shown them whole. Those lines, its mark when `isMarkSwapped` says the two forms' marks
 * differ, and its age when `isAgeSwapped` says their ages differ, fade out from the draw after `since`, while the row's height holds, until `showsAt`. `isSettled` is the form
 * the row goes to. `inAt` is the first draw of that form's lines, which show nothing until their wait ends. It is null
 * until the row draws that form, which a row the selection opens does only once the panel it waits for has faded.
 * `panelShown` is the opacity `from`'s panel showed as the change started, less than 1 while that panel still waited
 * or faded in as its row opened. `restIn` is the height the part of the row's box under its title measured in that
 * draw, which is still the old form's. `inWait` is the draw that set how long the new form's lines wait, `from`, and
 * that wait, `ms`: until the row's box is nearly at the new form's height, so the edge of a box still growing never
 * cuts them. It is null until a draw after `inAt` has the new form's measured height, or `MEASURE_WAIT_MS` has passed.
 */
export type FormSwap = {
  from: RowBlock
  isSettled: boolean
  isMarkSwapped: boolean
  isAgeSwapped: boolean
  since: number
  showsAt: number
  inAt: number | null
  fromShown: number
  panelShown: number
  restIn: number | undefined
  inWait: { from: number; ms: number } | null
}

/**
 * How a row's lines under its title, and its mark and age when the forms' differ, draw while it changes form: `from`'s
 * in place of its own while they fade out, and the opacity of what it draws, with the length of its fade. `panel` is
 * the opacity `from`'s panel keeps while it fades out with them, when it showed less than whole, and null otherwise.
 */
export type SwapMotion = {
  from: RowBlock | null
  isMarkSwapped: boolean
  isAgeSwapped: boolean
  opacity: number
  fadeMs: number
  panel: number | null
}

const isSettledRow = (b: Block | undefined): boolean => b?.kind === 'row' && b.settled !== null

/** The opacity the lines of the form a change takes show at `now`: none until their wait ends, then fading in. */
const linesShownOf = (s: FormSwap, now: number): number =>
  s.inWait === null ? 0 : easeOut(Math.min(1, Math.max(0, (now - s.inWait.from - s.inWait.ms) / ENTER_FADE_MS)))

const endsAt = (s: FormSwap): number => (s.inWait === null ? Infinity : s.inWait.from + s.inWait.ms + ENTER_FADE_MS)

/**
 * How long a row's new form waits for its measured height after the draw after its first one. gpui-kit reports a size
 * after the frame that lays it out, and only when it changed, so a form as tall as the one it replaced never reports.
 */
const MEASURE_WAIT_MS = 100

/**
 * The opacity a row's panel shows at `now` on its `track`: whole, unless the row opens, when the panel shows nothing
 * while it waits for its space, `height` px, to be nearly open, then fades in, or follows the `steps` of a panel turned
 * back.
 */
export function panelShownOf(track: RowTrack, steps: PanelStep[] | null, height: number, now: number): number {
  if (track.state !== 'opening') return 1
  if (steps) return opacityAt(steps, now)
  const fadesAt = track.since + NEXT_FRAME_MS + enterDelayMs(height)

  return easeOut(Math.min(1, Math.max(0, (now - fadesAt) / ENTER_FADE_MS)))
}

/**
 * A row's form change in this draw, from its last one, the block it last drew, `was`, and the block the view gives it,
 * `b`, with the opacity the panel of `was` shows, `panelShown`. A change that turns back while its lines still fade
 * out fades the row's own lines back in at once.
 */
export function stepSwap(
  last: FormSwap | null,
  was: Block | undefined,
  b: Block,
  now: number,
  panelShown = 1,
): FormSwap | null {
  if (b.kind !== 'row' || was?.kind !== 'row') return null
  const live = last !== null && now < endsAt(last) ? last : null
  const isSettled = isSettledRow(b)
  if (isSettled === (live ? live.isSettled : isSettledRow(was))) return live
  if (live?.inAt === null) {
    const isBack = isSettledRow(live.from) === isSettled && isOpenRow(live.from) === isOpenRow(b)
    if (isBack) return { ...live, isSettled, showsAt: now, inAt: now - NEXT_FRAME_MS, inWait: { from: now, ms: 0 } }
    return {
      ...live,
      isSettled,
      isMarkSwapped: live.isMarkSwapped || live.from.mark?.text !== b.mark?.text,
      isAgeSwapped: live.isAgeSwapped || live.from.age !== b.age,
    }
  }
  const isMarkSwapped = was.mark?.text !== b.mark?.text
  const isAgeSwapped = was.age !== b.age
  const fromShown = live === null ? 1 : linesShownOf(live, now)
  const showsAt = now + NEXT_FRAME_MS + (fromShown > 0 ? LEAVE_FADE_MS : 0)
  const swap = {
    from: was,
    isSettled,
    isMarkSwapped,
    isAgeSwapped,
    since: now,
    showsAt,
    inAt: null,
    fromShown,
    panelShown,
  }

  return { ...swap, restIn: undefined, inWait: null }
}

/**
 * The change with its new form's first draw set, once the row draws that form, `drawn`, and its old lines have faded,
 * with the height the part of the row's box under its title measured then, `rest`.
 */
export function takeSwap(s: FormSwap | null, drawn: Block, now: number, rest: number | undefined): FormSwap | null {
  const isTaken = s !== null && s.inAt === null && now >= s.showsAt && isSettledRow(drawn) === s.isSettled

  return isTaken ? { ...s, inAt: now, restIn: rest } : s
}

/**
 * The change with the wait of its new form's lines set, in the first draw after the one after `inAt` where the part of
 * the row's box under its title has measured the new form, `rest`, so the box has that height as its target: until
 * `space`, that part as the look springs it, is nearly at that height. A form that reports no new height within
 * `MEASURE_WAIT_MS` is taken as the old form's height.
 */
export function waitSwap(
  s: FormSwap | null,
  space: PanelSpace,
  rest: number | undefined,
  now: number,
): FormSwap | null {
  if (s?.inAt === null || s?.inAt === undefined || s.inWait !== null || now < s.inAt + NEXT_FRAME_MS) return s
  const isMeasured = rest !== s.restIn || now >= s.inAt + NEXT_FRAME_MS + MEASURE_WAIT_MS
  if (!isMeasured) return s

  return { ...s, inWait: { from: now, ms: enterDelayMs(space.to, spaceNow(space, now)) } }
}

/** Until when a row that changes form holds its height: through its old lines' fade and its new form's first draw. */
export const swapHoldsUntil = (s: FormSwap | null, now: number): number =>
  s === null ? 0 : (s.inAt ?? Math.max(s.showsAt, now)) + NEXT_FRAME_MS

/** Until when the row the selection opens waits for a row's old lines to fade, or 0 once they have. */
export const swapWaitsUntil = (s: FormSwap | null): number => (s?.inAt === null ? s.showsAt + NEXT_FRAME_MS : 0)

export function swapMotion(s: FormSwap | null, now: number): SwapMotion | null {
  if (s === null) return null
  const { from, isMarkSwapped, isAgeSwapped } = s
  if (s.inAt === null) {
    const panel = s.panelShown < 1 ? s.panelShown : null

    return {
      from,
      isMarkSwapped,
      isAgeSwapped,
      opacity: now === s.since ? s.fromShown : 0,
      fadeMs: LEAVE_FADE_MS,
      panel,
    }
  }
  const opacity = s.inWait !== null && now >= s.inWait.from + s.inWait.ms ? 1 : 0

  return { from: null, isMarkSwapped, isAgeSwapped, opacity, fadeMs: ENTER_FADE_MS, panel: null }
}

/** The times a form change changes how it draws, so the look draws again then. */
export const swapTimes = (s: FormSwap | null): number[] =>
  s === null
    ? []
    : [
        s.since + NEXT_FRAME_MS,
        s.showsAt,
        ...(s.inAt === null ? [] : [s.inAt + NEXT_FRAME_MS, s.inAt + NEXT_FRAME_MS + MEASURE_WAIT_MS]),
        ...(s.inWait === null ? [] : [s.inWait.from + s.inWait.ms, endsAt(s)]),
      ]
