import { turnBackFades } from '../../hooks/row-motion'
import type { FadeStep } from '../../hooks/row-motion'
import { shutTo } from './block-glide'

/** One step of a turned-back panel's fade, with when it starts. */
export type PanelStep = FadeStep & { at: number }

/** The fade steps of a panel turned back `shutForMs` after its `height` px space began to shut, each with its start. */
export function stepsFrom(now: number, shutForMs: number, height: number): PanelStep[] {
  let at = now

  return turnBackFades(height, shutTo(height, shutForMs)).map(step => {
    const started = { ...step, at }
    at += step.ms
    return started
  })
}
