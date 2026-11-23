import { ENTER_FADE_MS, enterDelayMs, LEAVE_FADE_MS, titleFades } from '../../core/view/row-motion'
import { fade, fadeShown, glides, isRunning } from './tab-glide'

/** The form a row leaves as it settles or as Undo brings it back, drawn over the form it takes. */
const LEFT = ':scope > .form-left'

/** A row's title in each form: its line's title, or its settled line's. */
const TITLE = '.title-part, .what'

/** An opening row's Holds up line in its closed form, which shows while its row opens from the closed form. */
const CLOSED_HOLDS_UP = '.content > .holds-up'

/** A row's panel: its body and buttons. */
const PANEL = '.panel'

/** The parts the opening path fades on its own: an opening row's panel, and its Holds up line. */
const OWN_FADES = `${PANEL}, ${CLOSED_HOLDS_UP}`

/** Whether an entry draws the form its row leaves over the form it takes. */
export const swapsForm = (el: HTMLElement): boolean => el.querySelector(LEFT) !== null

/** The parts of a row's form beside its title: each outermost element that holds no title, less those `skip` names. */
function partsOf(row: Element, skip: string | null): HTMLElement[] {
  const titles = [...row.querySelectorAll(TITLE)]
  const parts: HTMLElement[] = []
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (!(child instanceof HTMLElement) || titles.includes(child) || (skip && child.matches(skip))) continue
      if (titles.some(t => child.contains(t))) walk(child)
      else parts.push(child)
    }
  }
  walk(row)

  return parts
}

/**
 * Fades a row's change of form, once its height move has started: the form it leaves fades out while the height holds,
 * its title over the second half of `LEAVE_FADE_MS` and its other parts over the whole. The title of the form it takes
 * fades in over `LEAVE_FADE_MS`, so the words both titles share never dim, and its other parts fade in over
 * `ENTER_FADE_MS` once the height starts to move. A part below the height the row holds waits until its space is
 * nearly open, so the moving edge never cuts it. A row Undo opens from its settled form never drew its Holds up line
 * in the closed form, so that form stays hidden and the line comes with the panel. The panel of the form it leaves
 * fades out from `panelShown`, the opacity the row's panel showed before this draw, as when the row was still opening.
 * A change already fading, as when a row Undo brought back opens or closes while its settled form fades, keeps the fades of
 * the form it leaves, and the form it takes fades in from what it shows.
 */
export function fadeForms(el: HTMLElement, panelShown: number) {
  const left = el.querySelector<HTMLElement>(LEFT)
  const taken = el.firstElementChild
  if (!left || !taken) return
  const { taken: titleIn, left: titleOut } = titleFades(false)
  const isGoingOn = partsOf(left, null).some(part => fadeShown(part) !== null)
  for (const part of isGoingOn ? [] : partsOf(left, null))
    fade(part, part.matches(PANEL) ? panelShown : 1, 0, LEAVE_FADE_MS, true)
  for (const title of isGoingOn ? [] : left.querySelectorAll<HTMLElement>(TITLE))
    fade(title, 1, 0, titleOut.ms, true, false, titleOut.delayMs)
  const shownOf = (part: HTMLElement) => (isGoingOn ? (fadeShown(part) ?? 0) : 0)
  const g = glides.get(el)
  const isGliding = g !== undefined && isRunning(g.anim)
  const top = el.getBoundingClientRect().top
  const held = isGliding ? g.from.x : el.getBoundingClientRect().height
  const movesAt = isGliding ? g.delay : LEAVE_FADE_MS
  const opensAt = isGliding ? g.delay + enterDelayMs(g.to, g.from) : LEAVE_FADE_MS
  const showsAt = (part: HTMLElement, at: number) =>
    part.getBoundingClientRect().bottom - top > held + 0.5 ? Math.max(at, opensAt) : at
  for (const title of taken.querySelectorAll<HTMLElement>(TITLE))
    fade(title, shownOf(title), 1, titleIn.ms, false, false, showsAt(title, titleIn.delayMs))
  for (const part of partsOf(taken, OWN_FADES))
    fade(part, shownOf(part), 1, ENTER_FADE_MS, false, false, showsAt(part, movesAt))
  for (const closed of taken.querySelectorAll<HTMLElement>(CLOSED_HOLDS_UP)) fade(closed, 0, 0, 0, true)
}
