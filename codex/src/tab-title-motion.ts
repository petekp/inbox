import {
  ENTER_FADE_MS,
  enterDelayMs,
  LEAVE_FADE_MS,
  SLIDE_PX,
  titleFades,
  titleSwapMs,
} from '../../core/view/row-motion'
import { FRAME_MS } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import { fade, fadeShown, glide, glides, isFadingOut, isRunning, springOf, stopFadeOut, waitLeftMs } from './tab-glide'

/**
 * A row's line. While the row opens or closes it is a block that draws the title, wrapped as the open row's is, with
 * its after-label inline, so its height can glide between the closed title's and the open one's. The line clips while
 * it glides.
 */
export const LINE = '.line'

const fullOf = (line: HTMLElement) => line.querySelector<HTMLElement>(':scope > .text:not(.short)')

/**
 * A row's title while its line moves: `full` is the title as the open row draws it, in flow, and `short` the same text
 * cut to the closed row's lines, over the first lines of `full`. Both show only while one fades to the other.
 */
function titleOf(line: HTMLElement): { full: HTMLElement; short: HTMLElement } | null {
  const full = fullOf(line)
  const short = line.querySelector<HTMLElement>(':scope > .text.short')

  return full && short ? { full, short } : null
}

/**
 * Fades a title from its closed form to its open form, or back, after `delay` ms, as `titleFades` times it, or in one
 * frame when not `isFaded`. Each form fades from the opacity it shows now, so a fade that turns back never blinks.
 */
function swapTitle(
  { full, short }: { full: HTMLElement; short: HTMLElement },
  isOpen: boolean,
  delay: number,
  isFaded = true,
) {
  const { taken, left } = titleFades(isOpen)
  const [toFull, toShort] = isOpen ? [taken, left] : [left, taken]
  const ms = (f: typeof taken) => (isFaded ? f.ms : 0)
  const after = (f: typeof taken) => delay + (isFaded ? f.delayMs : 0)
  fade(full, fadeShown(full) ?? (isOpen ? 0 : 1), isOpen ? 1 : 0, ms(toFull), !isOpen, false, after(toFull))
  fade(short, fadeShown(short) ?? (isOpen ? 1 : 0), isOpen ? 0 : 1, ms(toShort), true, false, after(toShort))
}

/**
 * Starts an opening row's title move, after `delay` ms. The line grows from the closed title's height to the open
 * title's, with the title in its closed form, and the title fades to its open form once the line comes to rest
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
  const isAtOpen = to - from.x < 0.5 && Math.abs(from.v) * FRAME_MS < 0.5
  const shows = isAtOpen ? 0 : delay + titleSwapMs(to, from)
  for (const part of aftersOf(line))
    if (fadeShown(part) !== null) fade(part, fadeShown(part) ?? 0, 1, ENTER_FADE_MS, false, false, shows)
  if (isAtOpen) {
    if (fadeShown(title.full) !== null) swapTitle(title, true, 0)
    return
  }
  glide(line, 'height', from, to, false, false, delay)
  swapTitle(title, true, shows)
}

/** The statuses a closing row's line draws only while it draws its open form, in both forms of its title. */
const openAftersOf = (line: HTMLElement) => [...line.querySelectorAll<HTMLElement>(':scope > .text > .open-only')]

/** The status parts of a row's line, in both forms of its title. */
const aftersOf = (line: HTMLElement) => [
  ...line.querySelectorAll<HTMLElement>(':scope > .text > .part:not(.title-part)'),
]

/** Whether a closing row's line draws a status only its open form has, which the closed line `to` px tall lacks room for. */
function dropsOpenAfter(line: HTMLElement, to: number): boolean {
  const short = line.querySelector<HTMLElement>(':scope > .text.short')
  const needs = short ? short.getBoundingClientRect().height : 0

  return openAftersOf(line).length > 0 && needs - to >= 0.5
}

/** The height a closing row's line comes to rest at, given its closed title's height `to`. */
export function closedLineHeight(line: HTMLElement, to: number): number {
  const title = titleOf(line)

  return title && !dropsOpenAfter(line, to) ? Math.max(to, title.short.getBoundingClientRect().height) : to
}

/**
 * Starts a closing row's title move, from the line's height `from` to the closed title's height `to`. The title fades to
 * its closed form while the line holds its height, as the row's panel fades out, and the line shrinks after `delay` ms,
 * with its row. A line that holds too briefly for the fade takes the closed form at once. A title the closed form shows
 * whole keeps its full form, unless an open it turns back had hidden it. A status only the open form draws, which the
 * closed line has no room for, fades out with the title, or goes at once with it, so the shrinking line never cuts it.
 * Returns the height the line comes to rest at.
 */
export function closeTitle(line: HTMLElement, from: SpringState, to: number, delay: number): number {
  const title = titleOf(line)
  const isFaded = delay >= LEAVE_FADE_MS
  const isAfterDropped = dropsOpenAfter(line, to)
  if (isAfterDropped)
    for (const part of openAftersOf(line)) fade(part, fadeShown(part) ?? 1, 0, isFaded ? LEAVE_FADE_MS : 0, true)
  const end = closedLineHeight(line, to)
  if (title && (from.x - end >= 0.5 || fadeShown(title.full) !== null)) swapTitle(title, false, 0, isFaded)
  glide(line, 'height', from, end, true, false, delay)

  return end
}

/** A box that grows from `from` to `to` after `delay` ms, such as a closing row or its line. */
type Growth = { box: HTMLElement; from: SpringState; to: number; delay: number }

/**
 * Fades in each status of a closing row's line that a box grows to hold, as a press's status that joins it on a line
 * of its own, once every such box has passed the status's text, so no growing edge cuts it. A status every box already
 * holds stays as it shows, and so does one fading out.
 */
export function showGrownAfters(line: HTMLElement, growths: Growth[]) {
  for (const part of aftersOf(line)) {
    if (part.getClientRects().length === 0 || isFadingOut(part)) continue
    const waits = growths.flatMap(({ box, from, to, delay }) => {
      const bottom = part.getBoundingClientRect().bottom - box.getBoundingClientRect().top
      if (to - from.x < 0.5 || bottom - from.x < 0.5) return []

      return [delay + enterDelayMs(to, from, Math.min(SLIDE_PX / 2, Math.max(0, to - bottom)))]
    })
    if (waits.length > 0) fade(part, fadeShown(part) ?? 0, 1, ENTER_FADE_MS, false, false, Math.max(...waits))
  }
}

/**
 * Lets go of a line held or gliding, once its row's state is no longer `closing`, so the row measures its natural
 * height. A row whose close has ended takes the closed form's height, with its meta, at once, since its own height
 * already holds that space, and shows the full title. `showClosedLine` fades in what the close hid. While the row
 * opens, it returns where the line was, so `openTitle` moves on from there. Null when the row holds no line, or the line was at rest.
 */
export function releaseLine(el: HTMLElement, isOpening: boolean): SpringState | null {
  const line = el.querySelector<HTMLElement>(LINE)
  const full = line && fullOf(line)
  if (full && !isOpening) for (const el of [full, ...aftersOf(line)]) stopFadeOut(el)
  const was = line && glides.get(line)
  if (!line || !was || was.anim.playState === 'idle') return null
  const held = springOf(line, line.getBoundingClientRect().height)
  was.anim.cancel()

  return isOpening ? held : null
}

/** A row's own line, and not the lines of the rows inside it, as in a PR block. */
const OWN_LINE = ':scope > .row > .content > .line'

/**
 * The status a row's line shows after its title: of those it draws for its open and closed forms, the one shown, and
 * not one a close fades out.
 */
const afterOf = (line: HTMLElement) =>
  [...line.querySelectorAll<HTMLElement>(':scope > .text:not(.short) .after')].find(
    a => a.getClientRects().length > 0 && !isFadingOut(a.closest<HTMLElement>('.part') ?? a),
  ) ?? null

/** A row's line before a draw: where its height is, the status it showed after its title, and whether it closed. */
export type DrawnLine = { el: HTMLElement; from: SpringState; after: string | null; isClosing: boolean }

export function drawnLine(el: HTMLElement): DrawnLine | null {
  const line = el.querySelector<HTMLElement>(OWN_LINE)
  if (!line) return null

  return {
    el: line,
    from: springOf(line, line.getBoundingClientRect().height),
    after: afterOf(line)?.textContent ?? null,
    isClosing: line.closest('.row')?.classList.contains('closing') === true,
  }
}

/**
 * Fades in what a row's line shows once its close has ended and the close hid: its meta line, such as a review
 * thread's place, and a status after its title it did not show before. Each waits until the row has nearly grown to
 * hold it, when the row still grows.
 */
export function showClosedLine(el: HTMLElement, was: DrawnLine) {
  const line = el.querySelector<HTMLElement>(OWN_LINE)
  if (!line || line !== was.el) return
  const g = glides.get(el)
  const isGrowing = g !== undefined && g.size === 'height' && isRunning(g.anim) && g.to > g.from.x
  const delay = isGrowing ? waitLeftMs(el) + enterDelayMs(g.to, springOf(el, el.getBoundingClientRect().height)) : 0
  const after = afterOf(line)
  const isAfterNew = after !== null && after.textContent !== was.after
  const parts = [
    line.querySelector<HTMLElement>(':scope > .meta'),
    isAfterNew ? after.closest<HTMLElement>('.part') : null,
  ]
  for (const part of parts) if (part) fade(part, 0, 1, ENTER_FADE_MS, false, false, delay)
}

/**
 * Glides a resting row's line to its new height, as when a status after its title wraps to a line of its own, so the
 * lines under it move with the row's edge as the row glides `rowMove` px to its new height. A status the line did not
 * draw before fades in once the line has nearly grown to hold it. A line whose move the row's does not take in, as when
 * a closed row's Holds up line moves into it from under it, takes its height at once.
 */
export function glideLine(el: HTMLElement, was: DrawnLine | null, rowMove: number) {
  const line = el.querySelector<HTMLElement>(OWN_LINE)
  if (!line || !was || was.el !== line) return
  glides.get(line)?.anim.cancel()
  const to = line.getBoundingClientRect().height
  const { from } = was
  const move = to - from.x
  const isTakenIn = move * rowMove > 0 && Math.abs(rowMove) + 0.5 >= Math.abs(move)
  if (!isTakenIn && Math.abs(from.v) * FRAME_MS < 0.5) return
  glide(line, 'height', from, to)
  const after = afterOf(line)
  const part = after?.closest<HTMLElement>('.part')
  if (part && to > from.x && after?.textContent !== was.after)
    fade(part, 0, 1, ENTER_FADE_MS, false, false, enterDelayMs(to, from))
}

/**
 * Runs `measure` with every glide inside `el` at its end, a line's or a block's, such as a press line growing in, then
 * puts each back, so `el` measures the height it comes to rest at.
 */
export function atEndGlides<T>(el: HTMLElement, measure: () => T): T {
  const running = [...el.querySelectorAll<HTMLElement>(`${LINE}, [data-motion]`)].flatMap(inner => {
    const g = glides.get(inner)

    return g && isRunning(g.anim) ? [g.anim] : []
  })
  const times = running.map(a => a.currentTime)
  running.forEach(a => (a.currentTime = a.effect?.getComputedTiming().endTime ?? 0))
  const result = measure()
  running.forEach((a, i) => (a.currentTime = times[i] ?? 0))

  return result
}
