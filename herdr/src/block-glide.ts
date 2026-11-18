import { ENTER_FADE_MS, LEAVE_FADE_MS, enterDelayMs } from '../../hooks/row-motion'
import type { RowTrack } from '../../hooks/row-motion'
import { HEIGHT_SETTLE_MS, HEIGHT_SPRING, springStep } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'

/** The draw after a move's first frame, which starts its transition or spring. */
export const NEXT_FRAME_MS = 16

/** How long a block that starts to leave holds its space: its first draw, then its fade. */
export const HOLD_MS = NEXT_FRAME_MS + LEAVE_FADE_MS

/** When a glide that starts or changes its target `now` has come to rest, its height a frame behind its fade. */
const restAt = (now: number, fadeMs: number): number => now + Math.max(fadeMs, HEIGHT_SETTLE_MS) + NEXT_FRAME_MS

/**
 * Where a block's box glides to as it enters or leaves, whether its content shows, how long the content fades, whether
 * that fade waits for the box to open, and for a box that turns back as it springs shut, how long it had been shutting
 * (`shutForMs`), so the fade waits only for the rest of the way. Then when an entering box opens if it waits for a leaving
 * block (`opensAt`), when a leaving box starts to close (`shutAt`), and when both its fade and its height spring have
 * come to rest.
 */
export type Glide = {
  box: 'open' | 'shut'
  isShown: boolean
  fadeMs: number
  waitsForSpace: boolean
  shutForMs: number | null
  opensAt: number | null
  shutAt: number | null
  endsAt: number
}

/**
 * The glide of a block's box as it enters or leaves. gpui-kit animates only a later change of a target, so a move's
 * first draw sets the height and opacity it moves from, and the next draw sets the ones it moves to. A block that
 * leaves fades its content out while its box holds its height, and its box springs shut at `shutAt`, once the fade
 * has ended. A block that enters springs its box open, at `opensAt` when a leaving block holds its space, and its
 * content fades in once the box is nearly open. A block that turns back mid-glide was already in its box, so it moves
 * to its new end from where it is, at once: one that turns back to enter fades in from where its fade is, and if its box
 * had begun to shut or had not yet opened, once the box is nearly open. A field enters as soon as its press, so it never
 * waits for a leaving block, and shows as soon as its box opens. A field that leaves while its box is still short of
 * open, measured by `height`, turns back as it came: it hides at once and its box springs shut from where it is, in the
 * same draw, holding no space. Once its box is nearly open, it leaves as any block does. A block the
 * field replaces (`isReplaced`) hides at once
 * and its box shuts from the next draw, or in the same draw if it was still gliding, so it starts to shut in the draw
 * the field starts to open. A block that leaves stays drawn until its glide comes to rest. A row selected as it
 * enters keeps its box: the box springs on to the row's new height, which arrives in the draw after the open starts,
 * and lets go once that comes to rest.
 */
export function glideOf(
  track: RowTrack,
  isStart: boolean,
  last: Glide | null,
  now: number,
  holdsUntil: number,
  isPressed: boolean,
  isReplaced: boolean,
  height: number | undefined,
): Glide | null {
  const { state } = track
  const isLive = last !== null && now < last.endsAt
  if (state === 'leaving') {
    if (!isStart && last !== null) {
      const box = last.shutAt !== null && now >= last.shutAt ? 'shut' : last.box
      return { ...last, box, isShown: false }
    }
    const isTurned = isShownAtOnce(last, now, height)
    const fadeMs = isReplaced || isTurned ? 0 : LEAVE_FADE_MS
    const shutAt = now + (isLive ? 0 : NEXT_FRAME_MS) + fadeMs
    const from = isTurned
      ? { box: 'shut' as const, isShown: false }
      : isLive || isReplaced
        ? { box: shutAt <= now ? ('shut' as const) : (last?.box ?? 'open'), isShown: false }
        : { box: 'open' as const, isShown: true }

    const glide = { ...from, fadeMs, waitsForSpace: false, shutForMs: null, opensAt: null, shutAt }

    return { ...glide, endsAt: restAt(shutAt, 0) }
  }
  if (state === 'entering') {
    if (!isStart && last !== null) return openedAt(last, now)
    if (isLive) {
      const isShutting = last.shutAt !== null && now > last.shutAt
      const waitsForSpace = isShutting || last.box !== 'open'
      const opensAt = waitsForSpace && !isPressed && holdsUntil > now ? holdsUntil : null
      const startsAt = opensAt ?? now
      const shutForMs = isShutting && last.shutAt !== null ? startsAt - last.shutAt : null
      const isOpen = opensAt === null
      const box: Glide['box'] = isOpen ? 'open' : 'shut'
      const glide = { box, isShown: isOpen, fadeMs: ENTER_FADE_MS, waitsForSpace, shutForMs }

      return { ...glide, opensAt, shutAt: null, endsAt: restAt(startsAt, ENTER_FADE_MS) }
    }
    const opensAt = !isPressed && holdsUntil > now ? holdsUntil : now + NEXT_FRAME_MS
    const glide = { box: 'shut' as const, isShown: isPressed, fadeMs: isPressed ? 0 : ENTER_FADE_MS }

    return {
      ...glide,
      waitsForSpace: !isPressed,
      shutForMs: null,
      opensAt,
      shutAt: null,
      endsAt: restAt(opensAt, glide.fadeMs),
    }
  }
  if (!isLive || (last.box !== 'open' && last.opensAt === null)) return null
  const glide = openedAt(last, now)

  return isStart ? { ...glide, endsAt: Math.max(glide.endsAt, restAt(now, glide.fadeMs)) } : glide
}

/**
 * Whether `g` is the glide of a field whose content showed as soon as its box began to open, while that box, `height`
 * tall once open, is still short of open by more than an entering block waits for before its content fades in.
 */
export const isShownAtOnce = (g: Glide | null, now: number, height: number | undefined): boolean =>
  g !== null &&
  g.box === 'open' &&
  g.shutAt === null &&
  g.fadeMs === 0 &&
  g.opensAt !== null &&
  (height === undefined || now < g.opensAt + enterDelayMs(height))

/** An entering glide in a draw after its first: open and shown from `opensAt`, shut and hidden before it unless it shows at once. */
function openedAt(g: Glide, now: number): Glide {
  const isOpen = g.opensAt === null || now >= g.opensAt

  return { ...g, box: isOpen ? 'open' : 'shut', isShown: isOpen || g.fadeMs === 0 }
}

/** Where a box `height` tall has sprung to after shutting for `ms`, and how fast, or no height at rest when it opens from shut. */
export const shutTo = (height: number, ms: number | null): SpringState =>
  ms === null ? { x: 0, v: 0 } : springStep({ x: height, v: 0 }, 0, ms, HEIGHT_SPRING)
