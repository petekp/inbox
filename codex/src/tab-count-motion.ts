import { ENTER_FADE_MS, enterDelayMs, LEAVE_FADE_MS } from '../../core/view/row-motion'
import { drawnRows, root } from './tab-state'
import { fade, glide, glides, isRunning, opacityOf, springOf } from './tab-glide'

/** The box that holds a tab's count. Its width glides as the count comes and goes. */
const COUNT_BOX = '[data-count]'

/** Whether a tab's count box glides its width now, so the tab's own width follows it. */
export function isCountMoving(tab: HTMLElement): boolean {
  const box = tab.querySelector<HTMLElement>(COUNT_BOX)

  return box !== null && isRunning(glides.get(box)?.anim)
}

/**
 * Starts the move of each tab's count that came or went in this draw, so the tabs after it glide instead of moving in
 * one draw. A count that comes springs its box open from no width, then fades in once the box stays within half of
 * `SLIDE_PX` of open (`enterDelayMs`). A count that goes fades out over `LEAVE_FADE_MS` while its box holds its width,
 * then the box springs shut. A count that comes back while it goes springs open from where its box is and fades back
 * in from the opacity it shows. A count that goes before it showed shuts its box at once.
 */
export function moveCounts(changed: ReadonlySet<string>) {
  for (const el of root.querySelectorAll<HTMLElement>(COUNT_BOX)) {
    const key = el.dataset.count ?? ''
    const state = changed.has(key) ? drawnRows.get(key)?.track.state : undefined
    if (state !== 'entering' && state !== 'leaving') continue
    const isDrawn = state === 'leaving' || el.getAnimations().length > 0
    const opacity = isDrawn ? opacityOf(el) : 0
    const from = isDrawn ? springOf(el, el.getBoundingClientRect().width) : { x: 0, v: 0 }
    const isShown = opacity > 0.01
    if (state === 'leaving') {
      const holdMs = isShown ? LEAVE_FADE_MS : 0
      fade(el, opacity, 0, holdMs, true)
      glide(el, 'width', from, 0, true, false, holdMs)
      continue
    }
    glides.get(el)?.anim.cancel()
    const to = el.getBoundingClientRect().width
    glide(el, 'width', from, to)
    fade(el, opacity, 1, ENTER_FADE_MS, false, false, isShown ? 0 : enterDelayMs(to, from))
  }
}
