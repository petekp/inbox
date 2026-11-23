import { ENTER_FADE_MS, enterDelayMs, slideOffset } from '../../core/view/row-motion'
import { FRAME_MS, springFrames, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import { tabState, animations } from './tab-state'

export const FADE_EASING = 'ease-out'

type Size = 'height' | 'width'

/**
 * A size move under way: where its spring started, where it goes, how long it waits to start, when that wait ends as a
 * `Date.now()` time, and the animation that plays it. An element that comes or goes also scales its vertical padding
 * and top margin with its height, so it truly grows from and shrinks to no height.
 */
type Glide = {
  size: Size
  from: SpringState
  to: number
  delay: number
  startsAt: number
  anim: Animation
  scalesEdges: boolean
}

export const glides = new WeakMap<HTMLElement, Glide>()

/** Size moves under way. Each clips its element while it plays, so the moving edge cuts its content cleanly. */
const sizeMoves = new WeakSet<Animation>()

/**
 * Plays an animation on `el`. A size move clips the element while it plays. A fade does not, so strokes drawn past
 * the element's box, such as a tree's lines left of a row's panel, fade with it rather than vanish.
 */
function play(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions, isSize = false): Animation {
  if (isSize) el.style.overflow = 'clip'
  const a = el.animate(frames, timing)
  animations.add(a)
  if (isSize) sizeMoves.add(a)
  const done = () => {
    animations.delete(a)
    if (tabState.isDisposed) return
    if (!el.getAnimations().some(b => sizeMoves.has(b))) el.style.overflow = ''
  }
  a.onfinish = done
  a.oncancel = done

  return a
}

export const isRunning = (a: Animation | undefined) => a?.playState === 'running'

/** Whether an element's glide is moving now, past any wait it started with. */
export function isUnderWay(el: HTMLElement): boolean {
  const g = glides.get(el)

  return g !== undefined && isRunning(g.anim) && Number(g.anim.currentTime ?? 0) >= g.delay
}

/** How long an element's glide still waits to start, in ms: 0 for an element with no glide, or one under way. */
export function waitLeftMs(el: HTMLElement): number {
  const g = glides.get(el)

  return g !== undefined && isRunning(g.anim) ? Math.max(0, g.startsAt - Date.now()) : 0
}

/**
 * Whether an element's height, at `from`, glides toward a height it is still short of by more than an entering block
 * waits for before its content fades in (`enterDelayMs`).
 */
export function isOpeningShort(el: HTMLElement, from: SpringState): boolean {
  const g = glides.get(el)

  return g !== undefined && g.size === 'height' && isRunning(g.anim) && enterDelayMs(g.to, from) > 0
}

/** Whether an element's running glide scales its padding and top margin with its height, as one that comes or goes. */
export function isScalingEdges(el: HTMLElement): boolean {
  const g = glides.get(el)

  return g !== undefined && isRunning(g.anim) && g.scalesEdges
}

/** Where an element's size is and how fast it moves, from its glide, or `size` at rest without one. */
export function springOf(el: HTMLElement, size: number): SpringState {
  const g = glides.get(el)
  if (!g || !isRunning(g.anim)) return { x: size, v: 0 }
  const ms = Number(g.anim.currentTime ?? 0) - g.delay

  return ms < 0 ? { x: g.from.x, v: 0 } : springStep(g.from, g.to, ms)
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
 * Moves an element's size on the spring from `from` to `to`, after `delay` ms. `hold` keeps it at `to` once there,
 * until released. `comesOrGoes` marks an element growing in from nothing or shrinking away, or one that was when this
 * move restarts it.
 */
export function glide(
  el: HTMLElement,
  size: Size,
  from: SpringState,
  to: number,
  hold = false,
  comesOrGoes = false,
  delay = 0,
) {
  const was = glides.get(el)
  const scalesEdges = size === 'height' && (comesOrGoes || isScalingEdges(el))
  was?.anim.cancel()
  const style = scalesEdges ? getComputedStyle(el) : null
  const edges = style ? EDGES.map(edge => parseFloat(style[edge]) || 0) : null
  const xs = springFrames(from, to)
  if (xs.length < 2) xs.push(to)
  const anim = play(
    el,
    sizeFrames(size, xs, edges, Math.max(from.x, to)),
    {
      duration: (xs.length - 1) * FRAME_MS,
      delay,
      easing: 'linear',
      fill: fillOf(hold, delay),
    },
    true,
  )
  glides.set(el, { size, from, to, delay, startsAt: Date.now() + delay, anim, scalesEdges })
}

/** An element's opacity: full unless an animation fades it. */
export function opacityOf(el: HTMLElement): number {
  const opacity = parseFloat(getComputedStyle(el).opacity)

  return el.getAnimations().length > 0 && !Number.isNaN(opacity) ? opacity : 1
}

/** A fade under way, and the opacity it goes to. */
const fades = new WeakMap<HTMLElement, { from: number; to: number; anim: Animation }>()

/** Elements that enter, leave or fold: their fades also slide them, so a fade that restores one slides it back. */
const slides = new WeakSet<HTMLElement>()

const frameOf = (opacity: number, slides: boolean): Keyframe =>
  slides ? { opacity, transform: `translateY(${slideOffset(opacity)}px)` } : { opacity }

/** A move that waits draws its first frame while it waits, and one that holds keeps its last. */
const fillOf = (hold: boolean, delay: number): FillMode =>
  hold && delay > 0 ? 'both' : hold ? 'forwards' : delay > 0 ? 'backwards' : 'none'

export function fade(
  el: HTMLElement,
  from: number,
  to: number,
  ms: number,
  hold = false,
  slide = false,
  delay = 0,
): Animation {
  fades.get(el)?.anim.cancel()
  if (slide) slides.add(el)
  const isSliding = slides.has(el)
  if (isSliding) el.style.pointerEvents = to === 0 ? 'none' : ''
  const anim = play(el, [frameOf(from, isSliding), frameOf(to, isSliding)], {
    duration: ms,
    delay,
    easing: FADE_EASING,
    fill: fillOf(hold, delay),
  })
  fades.set(el, { from, to, anim })
  return anim
}

/** The opacity an element's fade draws now, or null when no fade has drawn it since its last cancel. */
export function fadeShown(el: HTMLElement): number | null {
  const f = fades.get(el)
  const opacity = parseFloat(getComputedStyle(el).opacity)

  return f && f.anim.playState !== 'idle' && !Number.isNaN(opacity) ? opacity : null
}

/** Ends a fade out that holds, so the element shows as its style draws it. */
export function stopFadeOut(el: HTMLElement) {
  const f = fades.get(el)
  if (f?.to === 0) f.anim.cancel()
}

/**
 * Fades `el`'s `pseudo` in on `row`'s fade in, from the opacity that fade starts at and at the point it has reached,
 * so a connector drawn as a pseudo-element shows as the row it joins does. With no row fading in, it fades in over
 * `ENTER_FADE_MS` from now.
 */
export function fadePseudoWith(el: HTMLElement, pseudo: string, row: HTMLElement | undefined): Animation {
  const f = row ? fades.get(row) : undefined
  const anim = f?.anim
  const timing = anim?.effect?.getTiming()
  const delay = Number(timing?.delay ?? 0)
  const a = play(el, [{ opacity: f?.from ?? 0 }, { opacity: 1 }], {
    pseudoElement: pseudo,
    duration: Number(timing?.duration ?? ENTER_FADE_MS),
    delay,
    easing: FADE_EASING,
    fill: fillOf(false, delay),
  })
  const reached = anim?.currentTime
  if (reached !== null && reached !== undefined) a.currentTime = reached

  return a
}

export const isFadingIn = (el: HTMLElement) => {
  const f = fades.get(el)

  return f !== undefined && f.to === 1 && isRunning(f.anim)
}
