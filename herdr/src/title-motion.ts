import { LINE_PT } from '../../core/view/layout'
import { ENTER_FADE_MS, LEAVE_FADE_MS, titleFades, titleSwapMs } from '../../core/view/row-motion'
import type { TitleFade } from '../../core/view/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import type { TitleRest } from './title-cut'

/**
 * How a row's title moves between a short form and a tall form. Between the closed row and the open one, the tall form
 * is the whole title, wrapped, and the short form the closed row's (`shortTitleOf`). Between a settled row's one line
 * and a collapsed row's cut, `tallForm` is the cut and the short form the one line. Both forms are drawn, one over the
 * other, since they wrap at different places. `isTaller` says the title moves to its tall form, and `low` is the short
 * form's height. A title that grows has its box grow to the tall height from the start, and fades to its tall form from
 * `swapsAt`, once that box has come to rest, so `swapsAt` is null until the tall height is measured. A title that
 * shrinks while its row's height holds for the whole fade fades to its short form from the next draw, as its row's
 * lines fade out, and its box shrinks once the hold ends. One whose height holds more briefly, or not at all, takes its
 * short form at once. `isFaded` says the forms fade (`titleFades`) rather than swap. `box` is the title box's spring
 * at `boxAt`, the draw that last set its target, and `boxTo` that target, so a move that turns back counts from where
 * the box really is. At `endsAt` the title draws one form again.
 */
export type TitleGlide = {
  isTaller: boolean
  tallForm: 'whole' | 'cut'
  low: number
  isFaded: boolean
  since: number
  swapsAt: number | null
  box: SpringState
  boxAt: number
  boxTo: number
  endsAt: number
}

/**
 * How a title draws in this draw while it moves: its tall form, whether its short form is one line, as at the move's
 * start, and whether the tall form shows, else the short form, with `tall` and `short` how each fades when that changes.
 */
export type TitleMotion = {
  tallForm: TitleGlide['tallForm']
  isShortOneLine: boolean
  isTallShown: boolean
  tall: TitleFade
  short: TitleFade
}

const AT_ONCE: TitleFade = { delayMs: 0, ms: 0 }

const isAbove = (height: number | undefined, low: number): height is number =>
  height !== undefined && height > low + 0.5

const boxNow = (g: TitleGlide, now: number): SpringState => springStep(g.box, g.boxTo, now - g.boxAt)

/**
 * The glide with its box's target set to `to` in this draw, as the look sets it. A growing title swaps once the box
 * rests at the tall height, counted from where the box is now.
 */
function aimed(g: TitleGlide, to: number, now: number): TitleGlide {
  if (to === g.boxTo && (g.swapsAt !== null || !g.isTaller)) return g
  const box = boxNow(g, now)
  const restsAt = now + titleSwapMs(to, box)
  const swapsAt = !g.isTaller ? g.swapsAt : isAbove(to, g.low) ? restsAt : null

  const fadesUntil = g.isTaller ? restsAt + ENTER_FADE_MS : restsAt

  return { ...g, box, boxAt: now, boxTo: to, swapsAt, endsAt: Math.max(g.endsAt, fadesUntil + FRAME_MS) }
}

type Move = { live: TitleGlide | null; tallForm: TitleGlide['tallForm']; low: number; to: number; now: number }

/** A title that grows to its tall form, its box from where it is, else from `from`. */
function growing({ live, tallForm, low, to, now }: Move, from: number): TitleGlide {
  const box = live ? boxNow(live, now) : { x: from, v: 0 }
  const endsAt = now + 2 * FRAME_MS + HEIGHT_SETTLE_MS

  return aimed(
    {
      isTaller: true,
      tallForm,
      low,
      isFaded: true,
      since: now,
      swapsAt: null,
      box,
      boxAt: now,
      boxTo: live?.boxTo ?? from,
      endsAt,
    },
    to,
    now,
  )
}

/** A title that shrinks to its short form from `height`, fading while its row's height holds `heldMs` long enough. */
function shrinking({ live, tallForm, low, to, now }: Move, height: number, heldMs: number): TitleGlide {
  const box = live ? boxNow(live, now) : { x: height, v: 0 }
  const endsAt = now + HEIGHT_SETTLE_MS + FRAME_MS
  const isFaded = heldMs >= LEAVE_FADE_MS
  const swapsAt = isFaded ? now + FRAME_MS : now

  return aimed(
    {
      isTaller: false,
      tallForm,
      low,
      isFaded,
      since: now,
      swapsAt,
      box,
      boxAt: now,
      boxTo: live?.boxTo ?? height,
      endsAt,
    },
    to,
    now,
  )
}

/**
 * A row's title glide in this draw, from its last glide, what the title glide reads of the row as last drawn, `was`,
 * and now, `is`, the title's measured height, which is its tall form's while the row is open or its title moves, and
 * how many more ms the row's height holds from this draw, while its panel or its settled lines fade. A title whose
 * forms take the same height has no glide. An open that turns a close back grows the box from where it is, and fades to
 * the whole title at once if the box still rests at its height. A shrink whose height holds starts its fade in the next
 * draw, since a form drawn first in this draw takes its opacity at once.
 */
export function stepTitle(
  last: TitleGlide | null,
  was: TitleRest | null,
  is: TitleRest | null,
  now: number,
  height: number | undefined,
  heldMs = 0,
): TitleGlide | null {
  if (is === null) return null
  const live = last !== null && now < last.endsAt ? last : null
  const rest = is.height
  const to = (is.isOpen || heldMs > 0) && isAbove(height, rest) ? height : rest
  const wasOpen = was?.isOpen ?? false
  const whole: Move = { live, tallForm: 'whole', low: rest, to, now }
  const from = was?.height ?? rest
  if (is.isOpen && !wasOpen) return growing({ ...whole, low: Math.min(from, live?.low ?? from) }, from)
  if (!is.isOpen && wasOpen) return isAbove(height, rest) ? shrinking(whole, height, heldMs) : null
  const cut: Move = { live, tallForm: 'cut', low: LINE_PT, to, now }
  const isLineChange = !is.isOpen && was !== null && was.isOneLine !== is.isOneLine
  if (isLineChange && !is.isOneLine) return isAbove(rest, LINE_PT) ? growing(cut, LINE_PT) : null
  if (isLineChange) return isAbove(height, LINE_PT) ? shrinking(cut, height, heldMs) : null
  if (!live) return null
  if (live.isTaller && live.swapsAt === null && now !== live.since && !isAbove(height, live.low)) return null

  return aimed(live, to, now)
}

export function titleMotion(g: TitleGlide | null, now: number): TitleMotion | null {
  if (g === null) return null
  const hasSwapped = g.swapsAt !== null && now >= g.swapsAt
  const fades = g.isFaded ? titleFades(g.isTaller) : { taken: AT_ONCE, left: AT_ONCE }

  return {
    tallForm: g.tallForm,
    isShortOneLine: !isAbove(g.low, LINE_PT),
    isTallShown: g.isTaller === hasSwapped,
    tall: g.isTaller ? fades.taken : fades.left,
    short: g.isTaller ? fades.left : fades.taken,
  }
}

/** The times a title glide changes how it draws, so the look draws again then. */
export const titleTimes = (g: TitleGlide | null): number[] => (g === null ? [] : [g.swapsAt ?? 0, g.endsAt])
