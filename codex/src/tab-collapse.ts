import { FADE_MS, LEAVE_FADE_MS } from '../../core/view/row-motion'
import type { SpringState } from '../../core/view/springs'
import { atEndGlides, closeTitle, LINE } from './tab-title-motion'
import { fade, glide, glides, isOpeningShort, isRunning, opacityOf, springOf } from './tab-glide'
import type { Glide } from './tab-glide'
import { closeHoldsUp, fadeFaintPanel, fadingParts, shownPanel, trunkBeside } from './tab-panel-fade'

/** How far a part sits below the top of its entry `el`, in px. */
export const topIn = (el: HTMLElement, part: Element) =>
  part.getBoundingClientRect().top - el.getBoundingClientRect().top

/** The height an element takes with no glide: its own glide stops, so the next one starts from `springOf`. */
export function naturalHeight(el: HTMLElement): number {
  glides.get(el)?.anim.cancel()

  return atEndGlides(el, () => el.getBoundingClientRect().height)
}

/** How long a glide still waits before it moves, in ms. */
const waitLeft = (g: Glide): number => (isRunning(g.anim) ? Math.max(0, g.delay - Number(g.anim.currentTime ?? 0)) : 0)

/**
 * The height a closing row comes to rest at, measured as it will draw once its panel goes, and its line's, with where
 * the line is now. A closing row keeps its open line until the panel goes, so it draws closed for a moment to measure.
 * The row's glide and its line's stop.
 */
function closedForm(el: HTMLElement) {
  const part = el.querySelector<HTMLElement>('.closing[inert]')
  const row = el.querySelector<HTMLElement>('.row.closing')
  const line = row?.querySelector<HTMLElement>(LINE) ?? null
  const lineFrom = line ? springOf(line, line.getBoundingClientRect().height) : null
  if (line) glides.get(line)?.anim.cancel()
  row?.classList.remove('closing')
  if (part) part.style.display = 'none'
  const height = naturalHeight(el)
  const title = line?.querySelector<HTMLElement>(':scope > .text:not(.short)')
  const lineTo = title ? title.getBoundingClientRect().height : null
  if (part) part.style.display = ''
  row?.classList.add('closing')

  return { part, line, lineFrom, lineTo, height }
}

/**
 * Shrinks an entry to the height it comes to rest at, over what it drew open and still draws, inert: a closing row's
 * panel or a PR block's body. A closing row's panel fades out first, while the entry holds its height, so the shrinking
 * height never cuts a line of it that shows. A panel that shows nothing yet, as one still waiting to fade in, hides at
 * once and holds nothing. A turned-back panel that shows faint while its space is still short of open holds nothing
 * either, and fades out in the steps of `faintCloseFades` while the height shrinks. A settling PR
 * block's dismissed head replaces the line above its body, so the body keeps the top it had at `openTop` while the
 * height shrinks over it. A settling row draws its settled line, under the form it leaves while that form fades
 * (`fadeForms`).
 */
export function collapse(
  el: HTMLElement,
  from: SpringState,
  state: 'closing' | 'settling',
  openTop: number | null,
  delay: number,
) {
  const isShort = state === 'closing' && isOpeningShort(el, from)
  const { part, line, lineFrom, lineTo, height: target } = closedForm(el)
  if (part && state === 'settling' && openTop !== null) keepTop(el, part, openTop)
  const shown = state === 'closing' ? shownPanel(el) : null
  if (shown && isShort) fadeFaintPanel(shown)
  else if (shown)
    for (const p of [...fadingParts(shown), ...trunkBeside(shown, true)]) fade(p, opacityOf(p), 0, LEAVE_FADE_MS, true)
  else if (part && state === 'closing') for (const p of [part, ...trunkBeside(part, true)]) fade(p, 0, 0, 0, true)
  if (part && state === 'closing') closeHoldsUp(part, shown !== null)
  const opacity = opacityOf(el)
  const shrinksAfter = Math.max(delay, shown && !isShort ? LEAVE_FADE_MS : 0)
  glide(el, 'height', from, target, true, false, shrinksAfter)
  if (line && lineFrom && lineTo !== null) closeTitle(line, lineFrom, lineTo, shrinksAfter)
  if (opacity < 0.99) fade(el, opacity, 1, FADE_MS)
}

/**
 * Moves a closing row's height to where its closed form rests now, after a draw during the close changed that form, as
 * a press's status joining its line does. Its height then holds the closed form's space when the close ends, so the
 * form's lines never show over a space still opening to them. Each glide keeps what is left of its wait.
 */
export function retargetClose(el: HTMLElement) {
  const g = glides.get(el)
  if (!g || g.size !== 'height') return
  const from = springOf(el, el.getBoundingClientRect().height)
  const line = el.querySelector<HTMLElement>('.row.closing')?.querySelector<HTMLElement>(LINE) ?? null
  const lineGlide = line ? glides.get(line) : undefined
  const lineWait = lineGlide ? waitLeft(lineGlide) : 0
  const wait = waitLeft(g)
  const closed = closedForm(el)
  glide(el, 'height', from, closed.height, true, false, wait)
  if (line && lineGlide && closed.lineFrom) glide(line, 'height', closed.lineFrom, lineGlide.to, true, false, lineWait)
}

function keepTop(el: HTMLElement, part: HTMLElement, top: number) {
  const margin = parseFloat(getComputedStyle(part).marginTop) || 0
  part.style.marginTop = `${margin + top - topIn(el, part)}px`
}
