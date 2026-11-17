import { atEndWeight } from './weight-ease'
import { RUNNING_PULSE_MS } from '../../hooks/timing'
import * as layout from '../../hooks/layout'
import {
  FADE_MS,
  isMoving,
  LINE_RETURN_FADE_MS,
  ROW_STATE_MS,
  SPACE_FADE_MS,
  slideOffset,
  spaceOpacity,
} from '../../hooks/row-motion'
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

/**
 * A size move under way: where its spring started, where it goes, and the animation that plays it. An element that
 * comes or goes also scales its vertical padding and top margin with its height, so it truly grows from and shrinks
 * to no height.
 */
type Glide = { size: Size; from: SpringState; to: number; anim: Animation; scalesEdges: boolean; xs: number[] }
const glides = new WeakMap<HTMLElement, Glide>()

function play(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions): Animation {
  el.style.overflow = 'clip'
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

const EDGES = ['paddingTop', 'paddingBottom', 'marginTop'] as const

/** One keyframe per spring frame. Edges, when given, scale with the height's share of `full`. */
function sizeFrames(size: Size, xs: number[], edges: number[] | null, full: number): Keyframe[] {
  return xs.map(x => {
    const frame: Keyframe = { [size]: `${x}px` }
    if (edges) {
      const share = full > 0 ? Math.min(1, Math.max(0, x / full)) : 0
      EDGES.forEach((edge, i) => (frame[edge] = `${(edges[i] ?? 0) * share}px`))
    }

    return frame
  })
}

/**
 * Moves an element's size on the spring from `from` to `to`. `hold` keeps it at `to` once there, until released.
 * `comesOrGoes` marks an element growing in from nothing or shrinking away.
 */
function glide(el: HTMLElement, size: Size, from: SpringState, to: number, hold = false, comesOrGoes = false) {
  const was = glides.get(el)
  const scalesEdges = size === 'height' && (comesOrGoes || (isRunning(was?.anim) && was!.scalesEdges))
  was?.anim.cancel()
  const style = scalesEdges ? getComputedStyle(el) : null
  const edges = style ? EDGES.map(edge => parseFloat(style[edge]) || 0) : null
  const xs = springFrames(from, to)
  if (xs.length < 2) xs.push(to)
  const anim = play(el, sizeFrames(size, xs, edges, Math.max(from.x, to)), {
    duration: (xs.length - 1) * FRAME_MS,
    easing: 'linear',
    fill: hold ? 'forwards' : 'none',
  })
  glides.set(el, { size, from, to, anim, scalesEdges, xs })
}

/** The height an element takes with no glide: its own glide stops, so the next one starts from `springOf`. Measured at the end weights. */
function naturalHeight(el: HTMLElement): number {
  glides.get(el)?.anim.cancel()

  return atEndWeight(el, () => atEndLines(el, () => el.getBoundingClientRect().height))
}

/** An element's opacity: full unless an animation fades it. */
function opacityOf(el: HTMLElement): number {
  const opacity = parseFloat(getComputedStyle(el).opacity)

  return el.getAnimations().length > 0 && !Number.isNaN(opacity) ? opacity : 1
}

/** A fade under way, and the opacity it goes to. */
const fades = new WeakMap<HTMLElement, { to: number; anim: Animation }>()

/** Elements that enter, leave or fold: their fades also slide them, so a fade that restores one slides it back. */
const slides = new WeakSet<HTMLElement>()

const frameOf = (opacity: number, slides: boolean): Keyframe =>
  slides ? { opacity, transform: `translateY(${slideOffset(opacity)}px)` } : { opacity }

function fade(el: HTMLElement, from: number, to: number, ms: number, hold = false, slide = false) {
  fades.get(el)?.anim.cancel()
  if (slide) slides.add(el)
  const isSliding = slides.has(el)
  if (isSliding) el.style.pointerEvents = to === 0 ? 'none' : ''
  const anim = play(el, [frameOf(from, isSliding), frameOf(to, isSliding)], {
    duration: ms,
    easing: FADE_EASING,
    fill: hold ? 'forwards' : 'none',
  })
  fades.set(el, { to, anim })
}

/**
 * Fades an element that enters or leaves along its own height glide, so its content shows for as long as its space
 * does: each frame's opacity is `spaceOpacity` of that frame's height. A fade that starts part way, as a move turned
 * back does, never jumps: leaving stays at or under the opacity it had, entering at or over it.
 */
function fadeWithSpace(el: HTMLElement, from: number, to: 0 | 1) {
  const g = glides.get(el)
  if (!g) return fade(el, from, to, SPACE_FADE_MS, to === 0, true)
  fades.get(el)?.anim.cancel()
  slides.add(el)
  el.style.pointerEvents = to === 0 ? 'none' : ''
  const full = Math.max(g.from.x, g.to)
  const opacities = g.xs.map(x => {
    const share = spaceOpacity(x, full)

    return to === 0 ? Math.min(from, share) : Math.max(from, share)
  })
  const anim = play(
    el,
    opacities.map(o => frameOf(o, true)),
    { duration: (g.xs.length - 1) * FRAME_MS, easing: 'linear', fill: to === 0 ? 'forwards' : 'none' },
  )
  fades.set(el, { to, anim })
}

const isFadingIn = (el: HTMLElement) => {
  const f = fades.get(el)

  return f !== undefined && f.to === 1 && isRunning(f.anim)
}

function growIn(el: HTMLElement, from: SpringState, opacity: number) {
  glide(el, 'height', from, naturalHeight(el), false, true)
  fadeWithSpace(el, opacity, 1)
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
  const resumeLine = state === 'closing' ? null : releaseLine(el, state === 'opening')
  moveRow(el, was, changed, carried)
  resumeLine?.()
}

function moveRow(el: HTMLElement, was: Drawn | undefined, changed: ReadonlySet<string>, carried: Set<Element>) {
  const key = el.dataset.motion!
  const state = drawnRows.get(key)?.track.state
  const isFresh = !was || was.el !== el
  const part = drawnRows.has(key) ? el.querySelector<HTMLElement>(OPEN_PART) : null
  if (part && !part.classList.contains('closing')) part.style.marginTop = ''
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
      glide(el, 'height', from, 0, true, true)
      if (isInsideLeaving(el)) fade(el, opacityOf(el), 0, SPACE_FADE_MS, true)
      else fadeWithSpace(el, opacityOf(el), 0)
      return true
    default:
      return false
  }
}

/** Whether an element that leaves sits in one that leaves too, as a PR group's last row does: the outer one slides. */
function isInsideLeaving(el: HTMLElement): boolean {
  const outer = el.parentElement?.closest<HTMLElement>('[data-motion]')

  return outer !== null && outer !== undefined && drawnRows.get(outer.dataset.motion!)?.track.state === 'leaving'
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
  const line = row?.querySelector<HTMLElement>(LINE) ?? null
  const lineFrom = line ? springOf(line, line.getBoundingClientRect().height) : null
  if (line) glides.get(line)?.anim.cancel()
  row?.classList.remove('closing')
  if (part) part.style.display = 'none'
  const target = naturalHeight(el)
  const title = line?.querySelector<HTMLElement>('.text')
  const lineTo = title ? atEndWeight(title, () => title.getBoundingClientRect().height) : null
  if (part) part.style.display = ''
  row?.classList.add('closing')
  if (part && openTop !== null) keepTop(el, part, openTop)
  const opacity = opacityOf(el)
  glide(el, 'height', from, target, true)
  if (line && lineFrom && lineTo !== null) glide(line, 'height', lineFrom, lineTo, true)
  if (opacity < 0.99) fade(el, opacity, 1, FADE_MS)
}

/**
 * A row's line. While the row closes it is a block that draws the title, wrapped as the open row's is, with its
 * after-label inline, so its height can glide to the closed title's.
 */
const LINE = '.line'

/**
 * Lets go of a line held at the closed title's height, once its row's state is no longer `closing`, so the row
 * measures its natural height. When the row turns back to `opening`, the function it returns glides the line from the
 * height it was drawn at to the open form's. A row whose close has ended takes the closed form's, with its meta, at
 * once, since its own height already holds that space. Null when the row holds no line, or needs no glide.
 */
function releaseLine(el: HTMLElement, isOpening: boolean): (() => void) | null {
  const line = el.querySelector<HTMLElement>(LINE)
  const was = line && glides.get(line)
  if (!line || !was || was.anim.playState === 'idle') return null
  const from = springOf(line, line.getBoundingClientRect().height)
  was.anim.cancel()
  if (!isOpening) return null

  return () => {
    const to = atEndWeight(line, () => line.getBoundingClientRect().height)
    if (Math.abs(from.x - to) >= 0.5 || Math.abs(from.v) * FRAME_MS >= 0.5) glide(line, 'height', from, to)
  }
}

/** Runs `measure` with every line glide inside `el` at its end, then puts each back, so `el` measures its natural height. */
function atEndLines<T>(el: HTMLElement, measure: () => T): T {
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
    if (!was || was.el !== el) continue
    if (was.isShown !== isShownTab(el)) {
      glides.get(el)?.anim.cancel()
      continue
    }
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
  glide(el, 'height', springOf(el, el.getBoundingClientRect().height), 0, true, true)
  fadeWithSpace(el, opacityOf(el), 0)
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

/** The shared spacing scale, as the CSS variables the tab's styles read. */
const SPACING_VARIABLES: [string, number][] = [
  ['--unit', layout.SPACE_UNIT],
  ['--line', layout.LINE_PT],
  ['--inside-gap', layout.INSIDE_GAP_PT],
  ['--list-gap', layout.LIST_GAP_PT],
  ['--child-gap', layout.CHILD_GAP_PT],
  ['--item-gap', layout.ITEM_GAP_PT],
  ['--head-gap', layout.HEAD_GAP_PT],
  ['--control-gap', layout.CONTROL_GAP_PT],
  ['--section-gap', layout.SECTION_GAP_PT],
  ['--edge', layout.EDGE_PT],
  ['--empty-max-width', layout.EMPTY_STATE_MAX_WIDTH_PT],
  ['--mark', layout.MARK_PT],
  ['--row-pad', layout.ROW_PAD_PT],
  ['--banner-pad-y', layout.BANNER_PAD_Y_PT],
  ['--banner-gap', layout.BANNER_GAP_PT],
]

export function applyPageVariables() {
  for (const [name, pt] of SPACING_VARIABLES) document.documentElement.style.setProperty(name, `${pt}px`)
  document.documentElement.style.setProperty('--pulse', `${RUNNING_PULSE_MS}ms`)
  document.documentElement.style.setProperty('--fade', `${FADE_MS}ms ${FADE_EASING}`)
  document.documentElement.style.setProperty('--settle', `${HEIGHT_SETTLE_MS}ms ease-out`)
  document.documentElement.style.setProperty('--space-fade', `${SPACE_FADE_MS}ms ${FADE_EASING}`)
  document.documentElement.style.setProperty('--line-return-fade', `${LINE_RETURN_FADE_MS}ms ${FADE_EASING}`)
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
