import { ENTER_FADE_MS, LEAVE_FADE_MS } from '../../core/view/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { NEXT_FRAME_MS } from './block-glide'

/**
 * A row's change between its settled form and another, as it settles or as Undo brings it back. `from` is the form it
 * leaves, as last drawn. Its lines under the title, and its mark when `isMarkSwapped` says the two forms' marks differ,
 * fade out from the draw after `since`, while the row's height holds, until `showsAt`. `isSettled` is the form the row
 * goes to. `inAt` is the first draw of that form's lines, which show no opacity there and fade in from the next draw.
 * It is null until the row draws that form, which a row the selection opens does only once the panel it waits for has
 * faded.
 */
export type FormSwap = {
  from: RowBlock
  isSettled: boolean
  isMarkSwapped: boolean
  since: number
  showsAt: number
  inAt: number | null
}

/**
 * How a row's lines under its title, and its mark when the forms' marks differ, draw while it changes form: `from`'s
 * in place of its own while they fade out, and the opacity of what it draws, with the length of its fade.
 */
export type SwapMotion = { from: RowBlock | null; isMarkSwapped: boolean; opacity: number; fadeMs: number }

const isSettledRow = (b: Block | undefined): boolean => b?.kind === 'row' && b.settled !== null

const endsAt = (s: FormSwap): number => (s.inAt === null ? Infinity : s.inAt + NEXT_FRAME_MS + ENTER_FADE_MS)

/**
 * A row's form change in this draw, from its last one, the block it last drew, `was`, and the block the view gives it,
 * `b`. A change that turns back while its lines still fade out fades the row's own lines back in at once.
 */
export function stepSwap(last: FormSwap | null, was: Block | undefined, b: Block, now: number): FormSwap | null {
  if (b.kind !== 'row' || was?.kind !== 'row') return null
  const live = last !== null && now < endsAt(last) ? last : null
  const isSettled = isSettledRow(b)
  if (isSettled === (live ? live.isSettled : isSettledRow(was))) return live
  if (live?.inAt === null) {
    const isBack = isSettledRow(live.from) === isSettled && isOpenRow(live.from) === isOpenRow(b)
    if (isBack) return { ...live, isSettled, showsAt: now, inAt: now - NEXT_FRAME_MS }
    return { ...live, isSettled, isMarkSwapped: live.isMarkSwapped || live.from.mark?.text !== b.mark?.text }
  }
  const isMarkSwapped = was.mark?.text !== b.mark?.text

  return { from: was, isSettled, isMarkSwapped, since: now, showsAt: now + NEXT_FRAME_MS + LEAVE_FADE_MS, inAt: null }
}

/** The change with its new form's first draw set, once the row draws that form, `drawn`, and its old lines have faded. */
export function takeSwap(s: FormSwap | null, drawn: Block, now: number): FormSwap | null {
  const isTaken = s !== null && s.inAt === null && now >= s.showsAt && isSettledRow(drawn) === s.isSettled

  return isTaken ? { ...s, inAt: now } : s
}

/** Until when a row that changes form holds its height: through its old lines' fade and its new form's first draw. */
export const swapHoldsUntil = (s: FormSwap | null, now: number): number =>
  s === null ? 0 : (s.inAt ?? Math.max(s.showsAt, now)) + NEXT_FRAME_MS

/** Until when the row the selection opens waits for a row's old lines to fade, or 0 once they have. */
export const swapWaitsUntil = (s: FormSwap | null): number => (s?.inAt === null ? s.showsAt + NEXT_FRAME_MS : 0)

export function swapMotion(s: FormSwap | null, now: number): SwapMotion | null {
  if (s === null) return null
  if (s.inAt === null)
    return { from: s.from, isMarkSwapped: s.isMarkSwapped, opacity: now === s.since ? 1 : 0, fadeMs: LEAVE_FADE_MS }

  return {
    from: null,
    isMarkSwapped: s.isMarkSwapped,
    opacity: now < s.inAt + NEXT_FRAME_MS ? 0 : 1,
    fadeMs: ENTER_FADE_MS,
  }
}

/** The times a form change changes how it draws, so the look draws again then. */
export const swapTimes = (s: FormSwap | null): number[] =>
  s === null
    ? []
    : [s.since + NEXT_FRAME_MS, s.showsAt, ...(s.inAt === null ? [] : [s.inAt + NEXT_FRAME_MS, endsAt(s)])]
