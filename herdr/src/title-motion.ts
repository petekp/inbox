import { LINE_PT } from '../../hooks/layout'
import { ENTER_FADE_MS, LEAVE_FADE_MS, enterDelayMs } from '../../hooks/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../hooks/springs'

/**
 * How a row's title moves between its one-line form, cut with an ellipsis, and its wrapped form, while it moves. Both
 * forms are drawn, one over the other, and fade across from `fadesAt`. An opening title's box grows to the wrapped
 * height from the start, and the wrapped form fades in once that box is nearly open, so `fadesAt` is null until the
 * wrapped height is measured. A closing title's wrapped form fades out first, while its box keeps the wrapped height
 * until `boxHeldUntil`, then the box shrinks to one line. `shrunkForMs` is how long the box of an opening that turned a
 * close back had been shrinking, null when it opens from one line at rest. `wrapGoneAt` is when the wrapped form has
 * faded out, unless the glide fades it in again. At `endsAt` the title draws one form again.
 */
export type TitleGlide = {
  isWrapped: boolean
  since: number
  fadesAt: number | null
  boxHeldUntil: number
  shrunkForMs: number | null
  wrapGoneAt: number
  endsAt: number
}

/**
 * How a title draws in this draw while it moves. `isWrapShown` says whether its forms fade to the wrapped form, else to
 * the one-line form, over `fadeMs`. `isBoxWrapped` says whether its box moves to the wrapped height, else to one line.
 */
export type TitleMotion = { isWrapShown: boolean; isBoxWrapped: boolean; fadeMs: number }

const wraps = (height: number | undefined): height is number => height !== undefined && height > LINE_PT + 0.5

/** Whether a title's wrapped form draws at all at `now`, at rest or partway through a fade. */
const isWrapDrawn = (g: TitleGlide, now: number): boolean =>
  (g.isWrapped && g.fadesAt !== null && now >= g.fadesAt) || now < g.wrapGoneAt

/**
 * A row's title glide in this draw, from its last glide, whether the row was and is open, and the title's measured
 * height, which is the wrapped height while the row is open or its title moves. A title that fits on one line has no
 * glide. A move that turns back starts from where the last one is: a close that turns an opening back holds the box
 * only while the wrapped form still draws, and an open that turns a close back fades in at once if the box still holds
 * the wrapped height.
 */
export function stepTitle(
  last: TitleGlide | null,
  wasOpen: boolean,
  isOpen: boolean,
  now: number,
  height: number | undefined,
): TitleGlide | null {
  const live = last !== null && now < last.endsAt ? last : null
  if (isOpen && !wasOpen) {
    const shrunkForMs = live && !live.isWrapped ? Math.max(0, now - live.boxHeldUntil) : null
    const wrapGoneAt = live && isWrapDrawn(live, now) ? now + ENTER_FADE_MS : now
    const glide = { isWrapped: true, since: now, fadesAt: null, boxHeldUntil: now, shrunkForMs, wrapGoneAt }

    return { ...glide, endsAt: now + 2 * FRAME_MS + HEIGHT_SETTLE_MS }
  }
  if (!isOpen && wasOpen) {
    if (!wraps(height)) return null
    const wasShown = live === null || isWrapDrawn(live, now)
    const fadesAt = live ? now : now + FRAME_MS
    const boxHeldUntil = wasShown ? fadesAt + LEAVE_FADE_MS : now
    const glide = { isWrapped: false, since: now, fadesAt, boxHeldUntil, shrunkForMs: null, wrapGoneAt: boxHeldUntil }

    return { ...glide, endsAt: boxHeldUntil + HEIGHT_SETTLE_MS + FRAME_MS }
  }
  if (!live || !live.isWrapped || live.fadesAt !== null || now === live.since) return live
  if (!wraps(height)) return null
  const from =
    live.shrunkForMs === null ? { x: LINE_PT, v: 0 } : springStep({ x: height, v: 0 }, LINE_PT, live.shrunkForMs)
  const fadesAt = now + enterDelayMs(height, from)

  return { ...live, fadesAt, endsAt: Math.max(live.endsAt, fadesAt + ENTER_FADE_MS + FRAME_MS) }
}

export function titleMotion(g: TitleGlide | null, now: number): TitleMotion | null {
  if (g === null) return null
  const hasFaded = g.fadesAt !== null && now >= g.fadesAt

  return {
    isWrapShown: g.isWrapped === hasFaded,
    isBoxWrapped: g.isWrapped || now < g.boxHeldUntil,
    fadeMs: g.isWrapped ? ENTER_FADE_MS : LEAVE_FADE_MS,
  }
}

/** The times a title glide changes how it draws, so the look draws again then. */
export const titleTimes = (g: TitleGlide | null): number[] =>
  g === null ? [] : [g.fadesAt ?? 0, g.boxHeldUntil, g.endsAt]
