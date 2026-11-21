import { faintCloseFades } from '../../core/view/row-motion'
import type { FadeStep } from '../../core/view/row-motion'
import { fade, opacityOf } from './tab-glide'

/**
 * Fades an element from `from` through `steps` after `delay` ms, each step once the one before it ends. A step before
 * the last that the element has already passed on its way to the last step's opacity is skipped. A fade that replaces
 * a step cancels it, which ends the steps after it. A step that ends short of full holds there.
 */
export function fadeThrough(el: HTMLElement, from: number, steps: FadeStep[], delay: number) {
  const [step, ...rest] = steps
  if (!step) return
  const end = steps.at(-1)!.to
  const isPassed = (step.to - from) * (end - from) <= 0
  if (isPassed && rest.length > 0) return fadeThrough(el, from, rest, delay)
  const anim = fade(el, from, step.to, step.ms, rest.length > 0 || step.to < 1, false, delay)
  if (rest.length > 0)
    anim.finished.then(
      () => fadeThrough(el, step.to, rest, 0),
      () => {},
    )
}

/** A panel's Holds up line, which the closed line draws in the same place once the row's close ends. */
const HOLDS_UP = '.branch.holds-up'

/** The parts of a closing row's panel that fade out: all of it but its Holds up line, which stays shown. */
export function fadingParts(el: HTMLElement): HTMLElement[] {
  if (!el.querySelector(HOLDS_UP)) return [el]

  return [...el.children].flatMap(c => (c.matches(HOLDS_UP) ? [] : fadingParts(c as HTMLElement)))
}

/** A closing row's panel while any of the parts that fade shows. */
export function shownPanel(el: HTMLElement): HTMLElement | null {
  const part = el.querySelector<HTMLElement>('.closing[inert]')
  const isShown = part !== null && fadingParts(part).some(p => opacityOf(p) > 0.01)

  return isShown ? part : null
}

/**
 * Fades a faint turned-back panel out in the steps of `faintCloseFades`. The panel and its fading parts each carry the
 * turned-back fade, so the panel holds the opacity it shows and each part steps so that the two together follow the
 * steps.
 */
export function fadeFaintPanel(part: HTMLElement) {
  const held = opacityOf(part)
  fade(part, held, held, 0, true)
  for (const p of fadingParts(part)) {
    const own = p === part ? 1 : opacityOf(p)
    const scale = p === part ? 1 : held
    const steps = faintCloseFades(held * own).map(step => ({ ...step, to: scale > 0 ? step.to / scale : 0 }))
    fadeThrough(p, p === part ? held : own, steps, 0)
  }
}
