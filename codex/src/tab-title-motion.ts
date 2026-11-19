import { titleSwapMs } from '../../hooks/row-motion'
import { FRAME_MS } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'
import { fade, fadeShown, glide, glides, isRunning, springOf, stopFadeOut } from './tab-glide'

/**
 * A row's line. While the row opens or closes it is a block that draws the title, wrapped as the open row's is, with
 * its after-label inline, so its height can glide between the closed title's and the open one's. The line clips while
 * it glides.
 */
export const LINE = '.line'

const fullOf = (line: HTMLElement) => line.querySelector<HTMLElement>(':scope > .text:not(.short)')

/**
 * A row's title while its line moves: `full` is the title as the open row draws it, in flow, and `short` the same text
 * clamped as the closed row draws it, over the first lines of `full`. One of the two shows at a time, since they wrap at
 * different places.
 */
function titleOf(line: HTMLElement): { full: HTMLElement; short: HTMLElement } | null {
  const full = fullOf(line)
  const short = line.querySelector<HTMLElement>(':scope > .text.short')

  return full && short ? { full, short } : null
}

/** Shows a title's open form, or its closed form, in place of the other in one frame, after `delay` ms. */
function swapTitle({ full, short }: { full: HTMLElement; short: HTMLElement }, isOpen: boolean, delay: number) {
  fade(full, isOpen ? 0 : 1, isOpen ? 1 : 0, 0, !isOpen, false, delay)
  fade(short, isOpen ? 1 : 0, isOpen ? 0 : 1, 0, true, false, delay)
}

/**
 * Starts an opening row's title move, after `delay` ms. The line grows from the closed title's height to the open
 * title's, with the title in its closed form, and the open form takes its place once the line comes to rest
 * (`titleSwapMs`). A line that was held or gliding, as when the open turns a close back, grows from where it was,
 * `held`. A line already at the open title's height shows the open form at once.
 */
export function openTitle(el: HTMLElement, delay: number, held: SpringState | null) {
  const line = el.querySelector<HTMLElement>(LINE)
  const title = line && titleOf(line)
  if (!line || !title) return
  glides.get(line)?.anim.cancel()
  const to = line.getBoundingClientRect().height
  const from: SpringState = held ?? { x: Math.min(title.short.getBoundingClientRect().height, to), v: 0 }
  if (to - from.x < 0.5 && Math.abs(from.v) * FRAME_MS < 0.5) {
    if (fadeShown(title.full) !== null) swapTitle(title, true, 0)
    return
  }
  glide(line, 'height', from, to, false, false, delay)
  swapTitle(title, true, delay + titleSwapMs(to, from))
}

/**
 * Starts a closing row's title move, from the line's height `from` to the closed title's height `to`. The title takes
 * its closed form at once, while the line holds its height, and the line shrinks after `delay` ms, with its row. A
 * title the closed form shows whole keeps its full form, unless an open it turns back had hidden it.
 */
export function closeTitle(line: HTMLElement, from: SpringState, to: number, delay: number) {
  const title = titleOf(line)
  const end = title ? Math.max(to, title.short.getBoundingClientRect().height) : to
  if (title && (from.x - end >= 0.5 || fadeShown(title.full) !== null)) swapTitle(title, false, 0)
  glide(line, 'height', from, end, true, false, delay)
}

/**
 * Lets go of a line held or gliding, once its row's state is no longer `closing`, so the row measures its natural
 * height. A row whose close has ended takes the closed form's height, with its meta, at once, since its own height
 * already holds that space, and shows the full title the close hid. While the row opens, it returns where the
 * line was, so `openTitle` moves on from there. Null when the row holds no line, or the line was at rest.
 */
export function releaseLine(el: HTMLElement, isOpening: boolean): SpringState | null {
  const line = el.querySelector<HTMLElement>(LINE)
  const full = line && fullOf(line)
  if (full && !isOpening) stopFadeOut(full)
  const was = line && glides.get(line)
  if (!line || !was || was.anim.playState === 'idle') return null
  const held = springOf(line, line.getBoundingClientRect().height)
  was.anim.cancel()

  return isOpening ? held : null
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
