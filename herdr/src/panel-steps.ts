import { faintCloseFades, turnBackFades } from '../../core/view/row-motion'
import type { FadeStep, RowState, RowTrack } from '../../core/view/row-motion'
import { springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import { NEXT_FRAME_MS } from './block-glide'
import { isOpenRow } from './blocks'
import type { RowBlock } from './blocks'
import type { FormSwap } from './form-swap'

/**
 * One step of a turned-back or faintly closing panel's fade, with when it starts and the opacity it starts from. A step
 * of no length still lasts a frame, so the look draws it before the next step starts.
 */
export type PanelStep = FadeStep & { at: number; from: number }

/**
 * A row's panel space, the part of its box that holds the panel, as the look springs it: `box` is its spring at `at`,
 * the draw that last set its target, and `to` that target, so a move that turns back counts from where it really is.
 */
export type PanelSpace = { box: SpringState; at: number; to: number }

/** Where the panel space is at `now`, and how fast it moves. */
export const spaceNow = (s: PanelSpace, now: number): SpringState => springStep(s.box, s.to, now - s.at)

/** The panel space with its target set to `to` px in this draw, from where it is, or at rest there if it is new. */
export function aimSpace(last: PanelSpace | null, to: number, now: number): PanelSpace {
  if (last === null) return { box: { x: to, v: 0 }, at: now, to }

  return to === last.to ? last : { box: spaceNow(last, now), at: now, to }
}

function timed(now: number, from: number, fades: FadeStep[]): PanelStep[] {
  let at = now
  let opacity = from

  return fades.map(step => {
    const started = { ...step, at, from: opacity }
    at += Math.max(step.ms, NEXT_FRAME_MS)
    opacity = step.to
    return started
  })
}

/**
 * The fade steps of a panel `height` px tall turned back in this draw at `opacity`, from where its space was, each with
 * its start.
 */
export function stepsFrom(now: number, space: PanelSpace | null, height: number, opacity: number): PanelStep[] {
  return timed(now, opacity, turnBackFades(height, space ? spaceNow(space, now) : { x: height, v: 0 }))
}

/** The fade steps of a faint turned-back panel whose row closes in this draw, from the opacity its `steps` draw now. */
export const faintCloseSteps = (now: number, steps: PanelStep[]): PanelStep[] => {
  const opacity = opacityAt(steps, now)

  return timed(now, opacity, faintCloseFades(opacity))
}

/** The progress of an `ease-out` fade, cubic-bezier(0, 0, .58, 1), after the share `x` of its time. */
export function easeOut(x: number): number {
  const at = (t: number, control: number) => 3 * (1 - t) * t * t * control + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (at(mid, 0.58) < x) lo = mid
    else hi = mid
  }

  return at((lo + hi) / 2, 1)
}

/** The opacity a panel's fade `steps` draw at `now`. */
export function opacityAt(steps: PanelStep[], now: number): number {
  const step = steps.findLast(s => s.at <= now) ?? steps[0]
  if (!step) return 0
  const share = step.ms > 0 ? Math.min(1, Math.max(0, (now - step.at) / step.ms)) : 1

  return step.from + (step.to - step.from) * easeOut(share)
}

/** What a row last drew that its panel's fade starts from: its track, its open form and its form swap. */
type PanelWas = { track: RowTrack; opened: RowBlock | null; swap: FormSwap | null }

/** A row's panel fades in as it opens and out as it closes, from where it is when the move turns back. */
export function panelOf(state: RowState, isStart: boolean, last: PanelWas | undefined, closing: RowBlock | null) {
  const isLeftPanelShown = last?.swap?.inAt === null && isOpenRow(last.swap.from)
  const wasPanelFolding =
    last?.track.state === 'opening' || (last?.track.state === 'closing' && last.opened !== null) || isLeftPanelShown
  const isFrom = isStart && !wasPanelFolding
  if (state === 'opening') return isFrom ? 0 : 1
  if (state === 'closing' && closing) return isFrom ? 1 : 0

  return null
}
