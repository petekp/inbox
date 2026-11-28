import { FRAME_MS, HEIGHT_SPRING, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'

/**
 * A scroll under way. The list's scroll position, `at`, follows a point, `lead`, on the spring the row glides use,
 * and `lead` follows the target on the same spring. So the scroll eases in from rest, and a new target keeps the
 * speed the scroll has and the pull it builds up, with no step in speed.
 */
type Scroll = {
  box: Element
  el: Element
  lead: SpringState
  at: SpringState
  target: number
  frameAt: number
  setTop: number
}

let scroll: Scroll | null = null

/**
 * When the person last scrolled the page themselves, as `watchScrollInput` hears it, or the page went back to where
 * they left a tab, on `performance.now()`'s clock.
 */
let scrolledAt = -Infinity

/** Whether the person has scrolled the page themselves since `at`, on `performance.now()`'s clock. */
export const hasScrolledSince = (at: number) => scrolledAt >= at

/** The page went back to where the person left a tab: a scroll under way stops, and a reveal that waits does not run. */
export function notePlaceRestored() {
  scrolledAt = performance.now()
  scroll = null
}

/** The keys the browser scrolls the page with. The tab takes the arrows and j and k itself, to move between rows. */
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End'])

const isTyping = (e: Event) =>
  e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]') !== null

const isScrollKey = (e: KeyboardEvent) => SCROLL_KEYS.has(e.key) && !isTyping(e)

/** A press inside an element's box but right of its content, which is on its scroll bar. */
const isScrollBarPress = (e: PointerEvent) =>
  e.target instanceof Element && e.target.clientWidth > 0 && e.offsetX >= e.target.clientWidth

const watchedWindows = new WeakSet<Window>()

/** Notes each time the person scrolls the page: a wheel, a touch, a press on a scroll bar or a scroll key. Each one stops a scroll under way where it is. */
function watchScrollInput(win: Window | null) {
  if (!win || watchedWindows.has(win)) return
  watchedWindows.add(win)
  const onInput = () => {
    scrolledAt = performance.now()
    scroll = null
  }
  const options = { passive: true, capture: true }
  win.addEventListener('wheel', onInput, options)
  win.addEventListener('touchstart', onInput, options)
  win.addEventListener('pointerdown', e => isScrollBarPress(e) && onInput(), options)
  win.addEventListener('keydown', e => isScrollKey(e) && onInput(), options)
}

/** The longest step one animation frame takes, so a frame that comes late does not jump the list. */
const MAX_FRAME_MS = 4 * FRAME_MS

const isAtRest = (s: SpringState, target: number) =>
  Math.abs(s.x - target) < HEIGHT_SPRING.epsilon && Math.abs(s.v) * FRAME_MS < HEIGHT_SPRING.epsilon

function scrollBoxOf(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }

  return el.ownerDocument.scrollingElement ?? el.ownerDocument.documentElement
}

/**
 * The scroll position that shows `el` in `box` with the least move from `from`, as `block: 'nearest'` places it:
 * its top at the view's top when it sits above the view or is taller than it, its bottom at the view's bottom when it
 * sits below, and `from` when it shows whole.
 */
function nearestTop(box: Element, el: Element, from: number): number {
  const isPage = box === el.ownerDocument.scrollingElement
  const viewTop = isPage ? 0 : box.getBoundingClientRect().top + box.clientTop
  const rect = el.getBoundingClientRect()
  const top = box.scrollTop + rect.top - viewTop
  const bottom = top + rect.height
  const height = box.clientHeight
  const most = Math.max(0, box.scrollHeight - height)
  const to = top < from || rect.height > height ? top : bottom > from + height ? bottom - height : from

  return Math.min(most, Math.max(0, to))
}

function frame(now: number) {
  const s = scroll
  if (!s) return
  if (!s.box.isConnected || !s.el.isConnected) {
    scroll = null
    return
  }
  const shift = s.box.scrollTop - s.setTop
  s.lead = { ...s.lead, x: s.lead.x + shift }
  s.at = { ...s.at, x: s.at.x + shift }
  s.target = nearestTop(s.box, s.el, s.target + shift)
  const ms = Math.min(MAX_FRAME_MS, Math.round(now - s.frameAt))
  for (let t = 0; t < ms; t++) {
    s.lead = springStep(s.lead, s.target, 1)
    s.at = springStep(s.at, s.lead.x, 1)
  }
  s.frameAt = now
  const isDone = isAtRest(s.lead, s.target) && isAtRest(s.at, s.target)
  s.setTop = isDone ? s.target : s.at.x
  s.box.scrollTop = s.setTop
  s.setTop = s.box.scrollTop
  if (isDone) scroll = null
  else requestAnimationFrame(frame)
}

/**
 * Scrolls `el` into view with the least move, as `scrollIntoView({ block: 'nearest' })` does. `isMoved` moves the
 * list on the springs `Scroll` describes, and otherwise it jumps. A scroll under way turns toward the new target from
 * where it is, at its speed, and the target is judged from where that scroll was going. Each frame judges the target
 * again from where `el` is then, since rows glide while the list scrolls. A move the browser makes to the scroll
 * position, as when scroll anchoring keeps the view still while rows above it change height, carries the scroll with
 * it. A wheel, a touch, a press on a scroll bar or a scroll key stops it where it is.
 */
export function scrollToNearest(el: Element, isMoved: boolean) {
  const box = scrollBoxOf(el)
  watchScrollInput(box.ownerDocument.defaultView)
  const running = scroll?.box === box ? scroll : null
  const target = nearestTop(box, el, running ? running.target : box.scrollTop)
  if (!isMoved) {
    scroll = null
    box.scrollTop = target
    return
  }
  if (running) {
    running.el = el
    running.target = target
    return
  }
  if (Math.abs(target - box.scrollTop) < HEIGHT_SPRING.epsilon) return
  const at = { x: box.scrollTop, v: 0 }
  const frameAt = performance.now()
  scroll = { box, el, lead: at, at, target, frameAt, setTop: box.scrollTop }
  requestAnimationFrame(frame)
}
