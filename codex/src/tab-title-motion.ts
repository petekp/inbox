import { ENTER_FADE_MS, LEAVE_FADE_MS, SLIDE_PX, enterDelayMs } from '../../hooks/row-motion'
import { FRAME_MS } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'
import { fade, fadeShown, glide, glides, isRunning, springOf, stopFadeOut } from './tab-glide'
import { atEndWeight, weightEasesOf } from './weight-ease'

/**
 * A row's line. While the row opens or closes it is a block that draws the title, wrapped as the open row's is, with
 * its after-label inline, so its height can glide between the closed title's and the open one's. The line clips while
 * it glides.
 */
export const LINE = '.line'

const fullOf = (line: HTMLElement) => line.querySelector<HTMLElement>(':scope > .text:not(.short)')

/**
 * A row's title while its line moves: `full` is the title as the open row draws it, in flow, and `short` the same text
 * clamped as the closed row draws it, over the first lines of `full`. The two fade across, so the line never cuts a
 * line of the title that shows.
 */
function titleOf(line: HTMLElement): { full: HTMLElement; short: HTMLElement } | null {
  const full = fullOf(line)
  const short = line.querySelector<HTMLElement>(':scope > .text.short')

  return full && short ? { full, short } : null
}

/** The opacity a title form shows now: its fade's, or `atRest` when no fade moves it. */
const shownOf = (el: HTMLElement, atRest: number): number => fadeShown(el) ?? atRest

const heightOf = (el: HTMLElement) => atEndWeight(el, () => el.getBoundingClientRect().height)

/**
 * Starts an opening row's title move, after `delay` ms. While the line grows from the closed title's height to the
 * open title's, the title keeps its closed form, and its full form fades in once the line is nearly open. A line that
 * was held or gliding, as when the open turns a close back, grows from where it was, `held`, and a title still partly
 * shown fades back in at once if the line still holds nearly all of it. A title the closed form shows whole draws its
 * open form at once.
 */
export function openTitle(el: HTMLElement, delay: number, held: SpringState | null) {
  const line = el.querySelector<HTMLElement>(LINE)
  const title = line && titleOf(line)
  if (!line || !title) return
  glides.get(line)?.anim.cancel()
  const to = heightOf(line)
  const from: SpringState = held ?? { x: Math.min(heightOf(title.short), to), v: 0 }
  const fullShown = shownOf(title.full, 0)
  if (to - from.x < 0.5 && Math.abs(from.v) * FRAME_MS < 0.5) {
    const wasFaded = fadeShown(title.full)
    if (wasFaded !== null) fade(title.full, wasFaded, 1, ENTER_FADE_MS)
    const wasShort = fadeShown(title.short)
    if (wasShort !== null) fade(title.short, wasShort, 0, ENTER_FADE_MS, true)
    return
  }
  glide(line, 'height', from, to, false, false, delay)
  const isNearlyOpen = to - from.x <= SLIDE_PX / 2 && fullShown > 0.01
  const waits = delay + (isNearlyOpen ? 0 : enterDelayMs(to, from))
  fade(title.full, fullShown, 1, ENTER_FADE_MS, false, false, waits)
  fade(title.short, shownOf(title.short, 1), 0, ENTER_FADE_MS, true, false, waits)
}

/**
 * Starts a closing row's title move, from the line's height `from` to the closed title's height `to`, after `delay`
 * ms. The title's full form fades to its closed form first, while the line holds its height, and then the line
 * shrinks, so the line never cuts a line of the full form that shows. A title the closed form shows whole keeps its
 * full form, unless an open it turns back had hidden it.
 */
export function closeTitle(line: HTMLElement, from: SpringState, to: number, delay: number) {
  const title = titleOf(line)
  const end = title ? Math.max(to, heightOf(title.short)) : to
  if (!title || (from.x - end < 0.5 && fadeShown(title.full) === null)) {
    glide(line, 'height', from, end, true, false, delay)
    return
  }
  const fullShown = shownOf(title.full, 1)
  fade(title.full, fullShown, 0, LEAVE_FADE_MS, true)
  fade(title.short, shownOf(title.short, 0), 1, LEAVE_FADE_MS, true)
  glide(line, 'height', from, end, true, false, Math.max(delay, fullShown > 0.01 ? LEAVE_FADE_MS : 0))
}

/**
 * Lets go of a line held or gliding, once its row's state is no longer `closing`, so the row measures its natural
 * height. A row whose close has ended takes the closed form's height, with its meta, at once, since its own height
 * already holds that space, and shows the full title the close faded out. While the row opens, it returns where the
 * line was, so `openTitle` moves on from there. Null when the row holds no line, or the line was at rest.
 */
export function releaseLine(el: HTMLElement, isOpening: boolean): SpringState | null {
  const line = el.querySelector<HTMLElement>(LINE)
  const full = line && fullOf(line)
  if (full && !isOpening) showClosedTitle(full)
  const was = line && glides.get(line)
  if (!line || !was || was.anim.playState === 'idle') return null
  const held = springOf(line, line.getBoundingClientRect().height)
  was.anim.cancel()

  return isOpening ? held : null
}

/**
 * Shows the full title a close faded out. The clamped title it faded to already drew the closed weight, so a title
 * that had faded takes that weight at once: easing it from the open weight would wrap a heavy title onto a line the
 * closed row does not keep. A title that stayed shown eases.
 */
function showClosedTitle(full: HTMLElement) {
  const wasFaded = (fadeShown(full) ?? 1) < 0.5
  stopFadeOut(full)
  if (wasFaded) weightEasesOf(full).forEach(a => a.finish())
}

/** Runs `measure` with every line glide inside `el` at its end, then puts each back, so `el` measures its natural height. */
export function atEndLines<T>(el: HTMLElement, measure: () => T): T {
  const running = [...el.querySelectorAll<HTMLElement>(LINE)].flatMap(line => {
    const g = glides.get(line)

    return g && isRunning(g.anim) ? [g.anim] : []
  })
  const times = running.map(a => a.currentTime)
  running.forEach(a => (a.currentTime = a.effect?.getComputedTiming().endTime ?? 0))
  const result = measure()
  running.forEach((a, i) => (a.currentTime = times[i] ?? 0))

  return result
}
