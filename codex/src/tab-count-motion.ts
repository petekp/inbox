import { ENTER_FADE_MS, enterDelayMs, LEAVE_FADE_MS } from '../../core/view/row-motion'
import { shownTabs } from '../../core/view/tabs'
import { drawnRows, root, tabState } from './tab-state'
import { fade, glide, glides, isRunning, opacityOf, springOf } from './tab-glide'
import type { Tab } from '../../types'

/** A row tab's count, keyed by its tab. It comes when the tab gains a count and goes when the tab loses it. */
export type CountLine = { id: Tab; badge: string }

export const countMotion = (tab: string) => `count-${tab}`

/** The box that holds a tab's count. Its width glides as the count comes and goes. */
const COUNT_BOX = '[data-count]'

/** Whether a tab's count box glides its width now, so the tab's own width follows it. */
export function isCountMoving(tab: HTMLElement): boolean {
  const box = tab.querySelector<HTMLElement>(COUNT_BOX)

  return box !== null && isRunning(glides.get(box)?.anim)
}

/** The width a count's box comes to rest at: its count's, with the space before it. */
function restWidth(box: HTMLElement): number {
  const count = box.firstElementChild
  if (!count) return 0

  return count.getBoundingClientRect().width + (parseFloat(getComputedStyle(count).marginLeft) || 0)
}

/**
 * Draws every tab's count at rest, as a new page draws: a count that went is gone, and one that came shows whole. Call
 * it before the draw that switches the page.
 */
export function restCounts() {
  for (const t of shownTabs()) drawnRows.delete(countMotion(t.id))
  for (const box of root.querySelectorAll<HTMLElement>(COUNT_BOX)) for (const a of box.getAnimations()) a.cancel()
  tabState.lastCounts = null
}

/**
 * Starts the move of each tab's count that came or went in this draw, so the tabs after it glide instead of moving in
 * one draw. A count that comes springs its box open from no width, then fades in once the box stays within half of
 * `SLIDE_PX` of open (`enterDelayMs`). A count that goes fades out over `LEAVE_FADE_MS` while its box holds its width,
 * then the box springs shut. A count that comes back while it goes springs open from where its box is and fades back
 * in from the opacity it shows. A count that goes before it showed springs its box shut without holding it. A count
 * whose digits change while it comes springs on to its new width.
 */
export function moveCounts(changed: ReadonlySet<string>) {
  for (const el of root.querySelectorAll<HTMLElement>(COUNT_BOX)) {
    const key = el.dataset.count ?? ''
    const state = drawnRows.get(key)?.track.state
    const g = glides.get(el)
    if (!changed.has(key)) {
      const to = restWidth(el)
      if (state === 'entering' && g && isRunning(g.anim) && Math.abs(g.to - to) >= 0.5)
        glide(el, 'width', springOf(el, el.getBoundingClientRect().width), to)
      continue
    }
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
    const to = restWidth(el)
    glide(el, 'width', from, to)
    fade(el, opacity, 1, ENTER_FADE_MS, false, false, isShown ? 0 : enterDelayMs(to, from))
  }
}
