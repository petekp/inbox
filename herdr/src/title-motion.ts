import { LINE_PT } from '../../hooks/layout'
import { titleSwapMs } from '../../hooks/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../hooks/springs'

/**
 * How a row's title moves between its one-line form, cut with an ellipsis, and its wrapped form, while it moves. Both
 * forms are drawn, one over the other, and one shows at a time, since they wrap at different places. An opening
 * title's box grows to the wrapped height from the start, and the wrapped form takes the one-line form's place at
 * `swapsAt`, once that box has come to rest, so `swapsAt` is null until the wrapped height is measured. A closing title
 * takes its one-line form at once, and its box shrinks to one line unless its row's height holds. `shrunkForMs` is how
 * long the box of an opening that turned a close back had been shrinking, null when it opens from one line at rest. At
 * `endsAt` the title draws one form again.
 */
export type TitleGlide = {
  isWrapped: boolean
  since: number
  swapsAt: number | null
  shrunkForMs: number | null
  endsAt: number
}

/**
 * How a title draws in this draw while it moves. `isWrapShown` says whether its wrapped form shows, else its one-line
 * form. `isBoxWrapped` says whether its box moves to the wrapped height, else to one line.
 */
export type TitleMotion = { isWrapShown: boolean; isBoxWrapped: boolean }

const wraps = (height: number | undefined): height is number => height !== undefined && height > LINE_PT + 0.5

/**
 * A row's title glide in this draw, from its last glide, whether the row was and is open, the title's measured height,
 * which is the wrapped height while the row is open or its title moves, and `heldUntil`, when the row's height stopped
 * holding while its last close's panel faded. A title that fits on one line has no glide. An open that turns a close
 * back grows the box from where it is, and shows the wrapped form at once if the box still holds the wrapped height.
 */
export function stepTitle(
  last: TitleGlide | null,
  wasOpen: boolean,
  isOpen: boolean,
  now: number,
  height: number | undefined,
  heldUntil = 0,
): TitleGlide | null {
  const live = last !== null && now < last.endsAt ? last : null
  if (isOpen && !wasOpen) {
    const shrunkForMs = live && !live.isWrapped ? Math.max(0, now - Math.max(live.since, heldUntil)) : null

    return { isWrapped: true, since: now, swapsAt: null, shrunkForMs, endsAt: now + 2 * FRAME_MS + HEIGHT_SETTLE_MS }
  }
  if (!isOpen && wasOpen) {
    if (!wraps(height)) return null

    return { isWrapped: false, since: now, swapsAt: now, shrunkForMs: null, endsAt: now + HEIGHT_SETTLE_MS + FRAME_MS }
  }
  if (!live || !live.isWrapped || live.swapsAt !== null || now === live.since) return live
  if (!wraps(height)) return null
  const from =
    live.shrunkForMs === null ? { x: LINE_PT, v: 0 } : springStep({ x: height, v: 0 }, LINE_PT, live.shrunkForMs)
  const swapsAt = now + titleSwapMs(height, from)

  return { ...live, swapsAt, endsAt: Math.max(live.endsAt, swapsAt + FRAME_MS) }
}

export function titleMotion(g: TitleGlide | null, now: number): TitleMotion | null {
  if (g === null) return null
  const hasSwapped = g.swapsAt !== null && now >= g.swapsAt

  return { isWrapShown: g.isWrapped === hasSwapped, isBoxWrapped: g.isWrapped }
}

/** The times a title glide changes how it draws, so the look draws again then. */
export const titleTimes = (g: TitleGlide | null): number[] => (g === null ? [] : [g.swapsAt ?? 0, g.endsAt])
