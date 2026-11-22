import { LINE_PT } from '../../core/view/layout'
import { ENTER_FADE_MS, LEAVE_FADE_MS, titleFades, titleSwapMs } from '../../core/view/row-motion'
import type { TitleFade } from '../../core/view/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'

/**
 * How a row's title moves between its one-line form, cut with an ellipsis, and its wrapped form, while it moves. Both
 * forms are drawn, one over the other, since they wrap at different places. An opening title's box grows to the
 * wrapped height from the start, and the title fades to its wrapped form from `swapsAt`, once that box has come to
 * rest, so `swapsAt` is null until the wrapped height is measured. A closing title whose row's height holds for the
 * whole fade fades to its one-line form from the next draw, as its panel fades out, and its box shrinks to one line once
 * the hold ends. One whose height holds more briefly, or not at all, takes its one-line form at once. `isFaded` says the forms
 * fade (`titleFades`) rather than swap. `box` is the title box's spring at `boxAt`, the draw that last set its target,
 * and `boxTo` that target, so a move that turns back counts from where the box really is. At `endsAt` the title draws
 * one form again.
 */
export type TitleGlide = {
  isWrapped: boolean
  isFaded: boolean
  since: number
  swapsAt: number | null
  box: SpringState
  boxAt: number
  boxTo: number
  endsAt: number
}

/**
 * How a title draws in this draw while it moves. `isWrapShown` says whether its wrapped form shows, else its one-line
 * form, and `wrapped` and `oneLine` how each form fades when that changes.
 */
export type TitleMotion = { isWrapShown: boolean; wrapped: TitleFade; oneLine: TitleFade }

const AT_ONCE: TitleFade = { delayMs: 0, ms: 0 }

const wraps = (height: number | undefined): height is number => height !== undefined && height > LINE_PT + 0.5

const boxNow = (g: TitleGlide, now: number): SpringState => springStep(g.box, g.boxTo, now - g.boxAt)

/**
 * The glide with its box's target set to `to` in this draw, as the look sets it. An opening title swaps once the box
 * rests at the wrapped height, counted from where the box is now.
 */
function aimed(g: TitleGlide, to: number, now: number): TitleGlide {
  if (to === g.boxTo && (g.swapsAt !== null || !g.isWrapped)) return g
  const box = boxNow(g, now)
  const restsAt = now + titleSwapMs(to, box)
  const swapsAt = !g.isWrapped ? g.swapsAt : wraps(to) ? restsAt : null

  const fadesUntil = g.isWrapped ? restsAt + ENTER_FADE_MS : restsAt

  return { ...g, box, boxAt: now, boxTo: to, swapsAt, endsAt: Math.max(g.endsAt, fadesUntil + FRAME_MS) }
}

/**
 * A row's title glide in this draw, from its last glide, whether the row was and is open, the title's measured height,
 * which is the wrapped height while the row is open or its title moves, and how many more ms a closing row's height
 * holds from this draw, while its panel fades. A title that fits on one line has no glide. An open that turns a close back grows
 * the box from where it is, and fades to the wrapped form at once if the box still rests at the wrapped height. A
 * close whose height holds starts its fade in the next draw, since a form drawn first in this draw takes its opacity
 * at once.
 */
export function stepTitle(
  last: TitleGlide | null,
  wasOpen: boolean,
  isOpen: boolean,
  now: number,
  height: number | undefined,
  heldMs = 0,
): TitleGlide | null {
  const isHeld = heldMs > 0
  const live = last !== null && now < last.endsAt ? last : null
  const to = (isOpen || isHeld) && wraps(height) ? height : LINE_PT
  if (isOpen && !wasOpen) {
    const box = live ? boxNow(live, now) : { x: LINE_PT, v: 0 }
    const endsAt = now + 2 * FRAME_MS + HEIGHT_SETTLE_MS
    const opening = {
      isWrapped: true,
      isFaded: true,
      since: now,
      swapsAt: null,
      box,
      boxAt: now,
      boxTo: live?.boxTo ?? LINE_PT,
      endsAt,
    }

    return aimed(opening, to, now)
  }
  if (!isOpen && wasOpen) {
    if (!wraps(height)) return null
    const box = live ? boxNow(live, now) : { x: height, v: 0 }
    const endsAt = now + HEIGHT_SETTLE_MS + FRAME_MS
    const isFaded = heldMs >= LEAVE_FADE_MS
    const swapsAt = isFaded ? now + FRAME_MS : now

    return aimed(
      { isWrapped: false, isFaded, since: now, swapsAt, box, boxAt: now, boxTo: live?.boxTo ?? height, endsAt },
      to,
      now,
    )
  }
  if (!live) return null
  if (live.isWrapped && live.swapsAt === null && now !== live.since && !wraps(height)) return null

  return aimed(live, to, now)
}

export function titleMotion(g: TitleGlide | null, now: number): TitleMotion | null {
  if (g === null) return null
  const hasSwapped = g.swapsAt !== null && now >= g.swapsAt
  const fades = g.isFaded ? titleFades(g.isWrapped) : { taken: AT_ONCE, left: AT_ONCE }

  return {
    isWrapShown: g.isWrapped === hasSwapped,
    wrapped: g.isWrapped ? fades.taken : fades.left,
    oneLine: g.isWrapped ? fades.left : fades.taken,
  }
}

/** The times a title glide changes how it draws, so the look draws again then. */
export const titleTimes = (g: TitleGlide | null): number[] => (g === null ? [] : [g.swapsAt ?? 0, g.endsAt])
