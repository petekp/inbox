import { LINE_PT } from '../../core/view/layout'
import { titleSwapMs } from '../../core/view/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'

/**
 * How a row's title moves between its one-line form, cut with an ellipsis, and its wrapped form, while it moves. Both
 * forms are drawn, one over the other, and one shows at a time, since they wrap at different places. An opening
 * title's box grows to the wrapped height from the start, and the wrapped form takes the one-line form's place at
 * `swapsAt`, once that box has come to rest, so `swapsAt` is null until the wrapped height is measured. A closing title
 * takes its one-line form at once, and its box shrinks to one line unless its row's height holds. `box` is the title
 * box's spring at `boxAt`, the draw that last set its target, and `boxTo` that target, so a move that turns back
 * counts from where the box really is. At `endsAt` the title draws one form again.
 */
export type TitleGlide = {
  isWrapped: boolean
  since: number
  swapsAt: number | null
  box: SpringState
  boxAt: number
  boxTo: number
  endsAt: number
}

/**
 * How a title draws in this draw while it moves. `isWrapShown` says whether its wrapped form shows, else its one-line
 * form.
 */
export type TitleMotion = { isWrapShown: boolean }

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

  return { ...g, box, boxAt: now, boxTo: to, swapsAt, endsAt: Math.max(g.endsAt, restsAt + FRAME_MS) }
}

/**
 * A row's title glide in this draw, from its last glide, whether the row was and is open, the title's measured height,
 * which is the wrapped height while the row is open or its title moves, and whether a closing row's height holds in
 * this draw while its panel fades. A title that fits on one line has no glide. An open that turns a close back grows
 * the box from where it is, and shows the wrapped form at once if the box still rests at the wrapped height.
 */
export function stepTitle(
  last: TitleGlide | null,
  wasOpen: boolean,
  isOpen: boolean,
  now: number,
  height: number | undefined,
  isHeld = false,
): TitleGlide | null {
  const live = last !== null && now < last.endsAt ? last : null
  const to = (isOpen || isHeld) && wraps(height) ? height : LINE_PT
  if (isOpen && !wasOpen) {
    const box = live ? boxNow(live, now) : { x: LINE_PT, v: 0 }
    const endsAt = now + 2 * FRAME_MS + HEIGHT_SETTLE_MS
    const opening = {
      isWrapped: true,
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

    return aimed(
      { isWrapped: false, since: now, swapsAt: now, box, boxAt: now, boxTo: live?.boxTo ?? height, endsAt },
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

  return { isWrapShown: g.isWrapped === hasSwapped }
}

/** The times a title glide changes how it draws, so the look draws again then. */
export const titleTimes = (g: TitleGlide | null): number[] => (g === null ? [] : [g.swapsAt ?? 0, g.endsAt])
