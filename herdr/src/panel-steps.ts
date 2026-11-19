import { turnBackFades } from '../../hooks/row-motion'
import type { FadeStep } from '../../hooks/row-motion'
import { springStep } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'

/** One step of a turned-back panel's fade, with when it starts. */
export type PanelStep = FadeStep & { at: number }

/**
 * A row's panel space, the part of its box that holds the panel, as the look springs it: `box` is its spring at `at`,
 * the draw that last set its target, and `to` that target, so a move that turns back counts from where it really is.
 */
export type PanelSpace = { box: SpringState; at: number; to: number }

const spaceNow = (s: PanelSpace, now: number): SpringState => springStep(s.box, s.to, now - s.at)

/** The panel space with its target set to `to` px in this draw, from where it is, or at rest there if it is new. */
export function aimSpace(last: PanelSpace | null, to: number, now: number): PanelSpace {
  if (last === null) return { box: { x: to, v: 0 }, at: now, to }

  return to === last.to ? last : { box: spaceNow(last, now), at: now, to }
}

/** The fade steps of a panel `height` px tall turned back in this draw, from where its space was, each with its start. */
export function stepsFrom(now: number, space: PanelSpace | null, height: number): PanelStep[] {
  let at = now

  return turnBackFades(height, space ? spaceNow(space, now) : { x: height, v: 0 }).map(step => {
    const started = { ...step, at }
    at += step.ms
    return started
  })
}
