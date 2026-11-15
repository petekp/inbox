import { RUNNING_PULSE_MS } from '../../hooks/timing'
import { BANNER_GAP_PT, BANNER_PAD_Y_PT, SECTION_GAP_PT, STATUS_ROW_PAD_PT, ROW_PAD_PT } from '../../hooks/layout'
import { ENTER_FADE_MS, FADE_MS, isMoving, ROW_STATE_MS } from '../../hooks/row-motion'
import type { RowState } from '../../hooks/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springFrames, springStep } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'
import { tabState, entering, closingFolds, drawnRows, root, animations } from './tab-state'
import { later, cancelTimer } from './tab-host'

const FADE_EASING = 'ease-out'
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/** An element's height before a draw, and the top of the part it draws open, a row's panel or a PR block's body. */
type Drawn = { el: HTMLElement; height: number; openTop: number | null }
type TabWidth = { el: HTMLElement; width: number; isShown: boolean }
type Drawing = { heights: Map<string, Drawn>; tabWidths: Map<string, TabWidth> }

/** The part an entry draws open: a row's panel, or a PR block's body. */
const OPEN_PART = '.panel, .pr-body'

const isShownTab = (el: HTMLElement) => el.classList.contains('shown')

const topIn = (el: HTMLElement, part: Element) => part.getBoundingClientRect().top - el.getBoundingClientRect().top

export function measure(): Drawing {
  const heights = new Map<string, Drawn>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]')) {
    const part = drawnRows.has(el.dataset.motion!) ? el.querySelector(OPEN_PART) : null
    heights.set(el.dataset.motion!, {
      el,
      height: el.getBoundingClientRect().height,
      openTop: part ? topIn(el, part) : null,
    })
  }
  const tabWidths = new Map<string, TabWidth>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-tab]'))
    tabWidths.set(el.dataset.tab!, { el, width: el.getBoundingClientRect().width, isShown: isShownTab(el) })

  return { heights, tabWidths }
}

type Size = 'height' | 'width'

/** A size move under way: where its spring started, where it goes, and the animation that plays it. */
type Glide = { size: Size; from: SpringState; to: number; anim: Animation }
const glides = new WeakMap<HTMLElement, Glide>()

function play(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions): Animation {
  el.style.overflow = 'hidden'
  const a = el.animate(frames, timing)
  animations.add(a)
  const done = () => {
    animations.delete(a)
    if (tabState.isDisposed) return
    if (el.getAnimations().length === 0) el.style.overflow = ''
  }
  a.onfinish = done
  a.oncancel = done

  return a
}

const isRunning = (a: Animation | undefined) => a?.playState === 'running'

/** Where an element's size is and how fast it moves, from its glide, or `size` at rest without one. */
function springOf(el: HTMLElement, size: number): SpringState {
  const g = glides.get(el)
  if (!g || !isRunning(g.anim)) return { x: size, v: 0 }

  return springStep(g.from, g.to, Number(g.anim.currentTime ?? 0))
}

/** Moves an element's size on the spring from `from` to `to`. `hold` keeps it at `to` once there, until released. */
function glide(el: HTMLElement, size: Size, from: SpringState, to: number, hold = false) {
  glides.get(el)?.anim.cancel()
  const frames = springFrames(from, to)
  if (frames.length < 2) frames.push(to)
  const anim = play(
    el,
    frames.map(x => ({ [size]: `${x}px` })),
    { duration: (frames.length - 1) * FRAME_MS, easing: 'linear', fill: hold ? 'forwards' : 'none' },
  )
  glides.set(el, { size, from, to, anim })
}

/** The height an element takes with no glide: its own glide stops, so the next one starts from `springOf`. */
function naturalHeight(el: HTMLElement): number {
  glides.get(el)?.anim.cancel()

  return el.getBoundingClientRect().height
}

/** An element's opacity: full unless an animation fades it. */
function opacityOf(el: HTMLElement): number {
  const opacity = parseFloat(getComputedStyle(el).opacity)

  return el.getAnimations().length > 0 && !Number.isNaN(opacity) ? opacity : 1
}

/** A fade under way, and the opacity it goes to. */
const fades = new WeakMap<HTMLElement, { to: number; anim: Animation }>()

function fade(el: HTMLElement, from: number, to: number, ms: number, hold = false) {
  fades.get(el)?.anim.cancel()
  const anim = play(el, [{ opacity: from }, { opacity: to }], {
    duration: ms,
    easing: FADE_EASING,
    fill: hold ? 'forwards' : 'none',
  })
  fades.set(el, { to, anim })
}

const isFadingIn = (el: HTMLElement) => {
  const f = fades.get(el)

  return f !== undefined && f.to === 1 && isRunning(f.anim)
}

function growIn(el: HTMLElement, from: SpringState, opacity: number) {
  glide(el, 'height', from, naturalHeight(el))
  fade(el, opacity, 1, ENTER_FADE_MS)
}

/**
 * Starts each element's move after a draw. Children go first: an element with a gliding element inside it follows
 * that glide at its own height, unless it moves itself, so the two never pull against each other.
 */
export function animateDraw(before: Drawing, changed: ReadonlySet<string>) {
  if (reducedMotion.matches) {
    entering.clear()
    return
  }
  const carried = new Set<Element>()
  const els = [...root.querySelectorAll<HTMLElement>('[data-motion]')].reverse()
  for (const el of els) {
    if (!el.dataset.closing) moveOne(el, before.heights.get(el.dataset.motion!), changed, carried)
    if (isRunning(glides.get(el)?.anim)) {
      for (let up = el.parentElement?.closest('[data-motion]'); up; up = up.parentElement?.closest('[data-motion]'))
        carried.add(up)
    }
  }
  glideTabs(before.tabWidths)
  entering.clear()
}

function moveOne(el: HTMLElement, was: Drawn | undefined, changed: ReadonlySet<string>, carried: Set<Element>) {
  const key = el.dataset.motion!
  const state = drawnRows.get(key)?.track.state
  const isFresh = !was || was.el !== el
  const from = springOf(el, isFresh ? el.getBoundingClientRect().height : was.height)
  if (state && changed.has(key) && startState(el, state, from, isFresh, was?.openTop ?? null)) return
  if (state === 'closing' || state === 'settling' || state === 'leaving') return
  if (isFresh) {
    if (!state && entering.delete(key)) growIn(el, { x: 0, v: 0 }, 0)
    return
  }
  if (carried.has(el) && !(state && isMoving(state))) {
    glides.get(el)?.anim.cancel()
    return
  }
  const opacity = opacityOf(el)
  const target = naturalHeight(el)
  for (const a of el.getAnimations()) if (a.playState === 'finished') a.cancel()
  if (Math.abs(from.x - target) >= 0.5 || Math.abs(from.v) * FRAME_MS >= 0.5) glide(el, 'height', from, target)
  if (opacity < 0.99 && !isFadingIn(el)) fade(el, opacity, 1, FADE_MS)
}

/** Starts a row's or a PR block's move into `state`. False leaves the element to glide to its new height. */
function startState(el: HTMLElement, state: RowState, from: SpringState, isFresh: boolean, openTop: number | null) {
  switch (state) {
    case 'entering': {
      const isTurn = !isFresh && el.getAnimations().length > 0
      growIn(el, isTurn ? from : { x: 0, v: 0 }, isTurn ? opacityOf(el) : 0)
      return true
    }
    case 'closing':
    case 'settling':
      collapse(el, from, state === 'settling' ? openTop : null)
      return true
    case 'leaving':
      glide(el, 'height', from, 0, true)
      fade(el, opacityOf(el), 0, FADE_MS, true)
      return true
    default:
      return false
  }
}

/**
 * Shrinks an entry to the height it comes to rest at, over what it drew open and still draws, inert: a row's panel or
 * a PR block's body. A settling entry's settled line replaces the line above that part, so the part keeps the top it
 * had at `openTop` while the height shrinks over it.
 */
function collapse(el: HTMLElement, from: SpringState, openTop: number | null) {
  const part = el.querySelector<HTMLElement>('.closing[inert]')
  // A closing row keeps its open line until the panel goes, so its end height is measured as it will draw then.
  const row = el.querySelector<HTMLElement>('.row.closing')
  row?.classList.remove('closing')
  if (part) part.style.display = 'none'
  const target = naturalHeight(el)
  if (part) part.style.display = ''
  row?.classList.add('closing')
  if (part && openTop !== null) keepTop(el, part, openTop)
  const opacity = opacityOf(el)
  glide(el, 'height', from, target, true)
  if (opacity < 0.99) fade(el, opacity, 1, FADE_MS)
}

function keepTop(el: HTMLElement, part: HTMLElement, top: number) {
  const margin = parseFloat(getComputedStyle(part).marginTop) || 0
  part.style.marginTop = `${margin + top - topIn(el, part)}px`
}

/**
 * Glides each tab whose width changed, as when its count gains a digit, so the tabs after it slide over. A tab that
 * was shown or stops being shown takes its width at once, since a tab switch draws at once.
 */
function glideTabs(widths: Drawing['tabWidths']) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-tab]')) {
    const was = widths.get(el.dataset.tab!)
    if (!was || was.el !== el || was.isShown !== isShownTab(el)) continue
    const from = springOf(el, was.width)
    glides.get(el)?.anim.cancel()
    const to = el.getBoundingClientRect().width
    if (Math.abs(from.x - to) >= 0.5) glide(el, 'width', from, to)
  }
}

/**
 * Unfolds or folds `id` in `shown`, and grows or shrinks the list drawn under `data-motion="closed-<motion>"`: an Asks
 * group's closed rows, or a Status done fold's finished rows.
 */
export function toggleFold(id: string, shown: Set<string>, motion = id) {
  const el = root.querySelector<HTMLElement>(`[data-motion="closed-${motion}"]`)
  if (!shown.has(id)) {
    shown.add(id)
    if (closingFolds.delete(motion) && el) delete el.dataset.closing
    else entering.add(`closed-${motion}`)
    tabState.draw()
    return
  }
  shown.delete(id)
  if (!el || reducedMotion.matches) {
    tabState.draw()
    return
  }
  closingFolds.add(motion)
  tabState.draw()
  el.dataset.closing = '1'
  glide(el, 'height', springOf(el, el.getBoundingClientRect().height), 0, true)
  fade(el, opacityOf(el), 0, FADE_MS, true)
  later(() => {
    if (shown.has(id) || !closingFolds.delete(motion)) return
    tabState.draw()
  }, HEIGHT_SETTLE_MS)
}

/** Scrolls the open row into view, and again once its height has come to rest. */
export function revealSelected() {
  if (tabState.isDisposed) return
  const behavior: ScrollBehavior = reducedMotion.matches ? 'auto' : 'smooth'
  const reveal = () => root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest', behavior })
  reveal()
  if (!reducedMotion.matches) later(reveal, HEIGHT_SETTLE_MS)
}

export function applyPageVariables() {
  document.documentElement.style.setProperty('--row-pad', `${ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--status-row-pad', `${STATUS_ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--section-gap', `${SECTION_GAP_PT}px`)
  document.documentElement.style.setProperty('--banner-pad-y', `${BANNER_PAD_Y_PT}px`)
  document.documentElement.style.setProperty('--banner-gap', `${BANNER_GAP_PT}px`)
  document.documentElement.style.setProperty('--pulse', `${RUNNING_PULSE_MS}ms`)
  document.documentElement.style.setProperty('--fade', `${FADE_MS}ms ${FADE_EASING}`)
  document.documentElement.style.setProperty('--enter-fade', `${ENTER_FADE_MS}ms ${FADE_EASING}`)
}

const TIMER_SLACK_MS = 50

export function drawIn(ms: number) {
  later(tabState.draw, ms + TIMER_SLACK_MS)
}

let moveWake: { at: number; timer: ReturnType<typeof later> } | null = null

export function wakeForMoves() {
  const now = Date.now()
  const ends = [...drawnRows.values()].flatMap(({ track: t }) =>
    isMoving(t.state) ? [t.since + ROW_STATE_MS[t.state]] : [],
  )
  if (ends.length === 0) return
  const at = Math.min(...ends) + TIMER_SLACK_MS
  if (moveWake && moveWake.at <= at) return
  if (moveWake) cancelTimer(moveWake.timer)
  moveWake = {
    at,
    timer: later(() => {
      moveWake = null
      tabState.draw()
    }, at - now),
  }
}
