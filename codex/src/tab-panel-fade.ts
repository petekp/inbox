import { faintCloseFades, titleFades } from '../../core/view/row-motion'
import type { FadeStep } from '../../core/view/row-motion'
import { fade, fadeShown, opacityOf, stopFadeOut } from './tab-glide'

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

/** A panel's Holds up line, the first branch of its tree, which the closed line draws in the same place. */
const HOLDS_UP = '.branch.holds-up'

/** A row's Holds up line in its closed form, which the row draws under its line while it draws its panel. */
const CLOSED_HOLDS_UP = ':scope > .content > .holds-up'

/** A panel's Holds up line, or none. */
const holdsUpOf = (part: HTMLElement): HTMLElement[] => [...part.querySelectorAll<HTMLElement>(HOLDS_UP)]

/**
 * The trunk the row's mark draws beside its title, over the row's panel `part`. It fades with the panel, so the tree
 * comes and goes whole with the lines it joins. A closing row's Holds up line fades out on its own, in `closeHoldsUp`,
 * and takes the trunk it hangs from with it.
 */
export function trunkBeside(part: HTMLElement, isClosing = false): HTMLElement[] {
  const trunk = part.parentElement?.querySelector<HTMLElement>(':scope > .mark > .trunk')
  if (!trunk || (isClosing && part.querySelector(HOLDS_UP))) return []

  return [trunk]
}

/** The parts of a closing row's panel that fade out with it: all of it but its Holds up line, which `closeHoldsUp` fades. */
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
  for (const trunk of trunkBeside(part, true))
    fadeThrough(trunk, opacityOf(trunk), faintCloseFades(opacityOf(trunk)), 0)
  for (const p of fadingParts(part)) {
    const own = p === part ? 1 : opacityOf(p)
    const scale = p === part ? 1 : held
    const steps = faintCloseFades(held * own).map(step => ({ ...step, to: scale > 0 ? step.to / scale : 0 }))
    fadeThrough(p, p === part ? held : own, steps, 0)
  }
}

/**
 * Fades a closing row's Holds up line from its open form, the first branch of the panel `part`'s tree, to its closed
 * form, cut to one line, as `titleFades` times a title's. The closed form fades in over the whole fade, and the open
 * form and the trunk it hangs from fade out over its second half, so the words the two forms share never dim. With
 * `isFaded` false, as for a panel that showed nothing yet, the closed form shows at once.
 */
export function closeHoldsUp(part: HTMLElement, isFaded: boolean) {
  const row = part.parentElement
  const closed = row?.querySelector<HTMLElement>(CLOSED_HOLDS_UP)
  if (!row || !closed) return
  const { taken, left } = titleFades(false)
  fade(closed, fadeShown(closed) ?? 0, 1, isFaded ? taken.ms : 0, true)
  const trunk = row.querySelector<HTMLElement>(':scope > .mark > .trunk')
  for (const el of [...holdsUpOf(part), ...(trunk ? [trunk] : [])])
    fade(el, opacityOf(el), 0, isFaded ? left.ms : 0, true, false, isFaded ? left.delayMs : 0)
}

/**
 * Fades an opening row's Holds up line from its closed form, which shows at once in the place the closed row drew it,
 * to its open form, as `titleFades` times a title's, once the panel `part` fades to full after `delay` ms. The open form
 * fades in with the panel, or, when a close it turns back had faded it out, holds until then and fades in over the
 * whole fade, while the closed form fades out over its second half. A fade out that has not yet dimmed it stops.
 */
export function openHoldsUp(part: HTMLElement, delay: number) {
  const closed = part.parentElement?.querySelector<HTMLElement>(CLOSED_HOLDS_UP)
  if (!closed) return
  const { taken, left } = titleFades(true)
  fade(closed, fadeShown(closed) ?? 1, 0, left.ms, true, false, delay + left.delayMs)
  for (const el of holdsUpOf(part)) {
    const opacity = opacityOf(el)
    if (opacity < 0.99) fade(el, opacity, 1, taken.ms, false, false, delay + taken.delayMs)
    else stopFadeOut(el)
  }
}
