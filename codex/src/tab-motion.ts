import { RUNNING_PULSE_MS } from '../../hooks/timing'
import { BANNER_GAP_PT, BANNER_PAD_Y_PT, LOOK_GAP_PT, STATUS_ROW_PAD_PT, ROW_PAD_PT } from '../../hooks/layout'
import type { FoldGroup } from './arrivals'
import { ENTER_MS, EXIT_MS, isMoving, MOVE_MS, ROW_STATE_MS } from '../../hooks/row-motion'
import type { RowState } from '../../hooks/row-motion'
import { tabState, unfolded, sending, entering, closingFolds, drawnRows, root, animations } from './tab-state'
import { later, cancelTimer } from './tab-host'

// The Codex app's own curves, from its bundled styles: --cubic-enter, --cubic-move and --cubic-exit.
const ENTER: KeyframeAnimationOptions = { duration: ENTER_MS, easing: 'cubic-bezier(.19, 1, .22, 1)' }
const MOVE: KeyframeAnimationOptions = { duration: MOVE_MS, easing: 'cubic-bezier(.65, 0, .35, 1)' }
const EXIT: KeyframeAnimationOptions = { duration: EXIT_MS, easing: 'cubic-bezier(.8, 0, .4, 1)', fill: 'forwards' }
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

type Heights = Map<string, { el: HTMLElement; height: number }>

export function measure(): Heights {
  const heights: Heights = new Map()
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]'))
    heights.set(el.dataset.motion!, { el, height: el.getBoundingClientRect().height })

  return heights
}

function run(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions, to: number) {
  el.style.overflow = 'hidden'
  el.dataset.to = String(to)
  const a = el.animate(frames, timing)
  animations.add(a)
  const done = () => {
    animations.delete(a)
    if (tabState.isDisposed) return
    if (el.getAnimations().length === 0) unclip(el)
  }
  a.onfinish = done
  a.oncancel = done
}

function release(el: HTMLElement) {
  for (const a of el.getAnimations()) a.cancel()
  unclip(el)
}

function unclip(el: HTMLElement) {
  el.style.overflow = ''
  delete el.dataset.to
}

/**
 * A row entry's or a group end's content height, which an animation of its own height does not change, as its scroll
 * height does while the animation holds it taller or shorter than its content. Its children stack with no gaps or
 * padding.
 */
function contentHeight(el: HTMLElement): number {
  return [...el.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
}

type Frame = { height: number; opacity: number }

function tween(el: HTMLElement, from: Frame, to: Frame, timing: KeyframeAnimationOptions) {
  const keyframe = (f: Frame) => ({ height: `${f.height}px`, opacity: f.opacity })
  run(el, [keyframe(from), keyframe(to)], timing, to.height)
}

function growIn(el: HTMLElement, height: number) {
  tween(el, { height: 0, opacity: 0 }, { height, opacity: 1 }, ENTER)
}

export function animateDraw(before: Heights, changed: ReadonlySet<string>) {
  if (reducedMotion.matches) {
    entering.clear()
    return
  }
  const started = new Set([...changed].map(key => drawnRows.get(key)?.track.state))
  const besideRow: KeyframeAnimationOptions = started.has('leaving')
    ? { ...EXIT, fill: 'none' }
    : started.has('entering')
      ? ENTER
      : MOVE
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]')) {
    const key = el.dataset.motion!
    const was = before.get(key)
    if (el.dataset.closing) continue
    const state = drawnRows.get(key)?.track.state
    const isFresh = !was || was.el !== el
    const from = () => (el.getAnimations().length > 0 || isFresh ? el.getBoundingClientRect().height : was.height)
    if (state && changed.has(key) && startState(el, state, from)) continue
    if (state === 'closing' || state === 'settling' || state === 'leaving') continue
    if (state && !isMoving(state) && !sending.has(key)) {
      release(el)
      continue
    }
    const target = state || el.classList.contains('group-end') ? contentHeight(el) : el.scrollHeight
    if (isFresh) {
      if (!state && entering.delete(key)) growIn(el, target)
      continue
    }
    const anims = el.getAnimations()
    if (anims.length > 0 && Math.abs(Number(el.dataset.to) - target) < 1) continue
    const height = from()
    const opacity = anims.length > 0 ? Number(getComputedStyle(el).opacity) : 1
    for (const a of anims) a.cancel()
    if (Math.abs(height - target) < 1 && opacity > 0.99) continue
    tween(el, { height, opacity }, { height: target, opacity: 1 }, state ? MOVE : besideRow)
  }
  entering.clear()
}

function startState(el: HTMLElement, state: RowState, from: () => number): boolean {
  switch (state) {
    case 'opening':
      return false
    case 'entering':
      release(el)
      growIn(el, contentHeight(el))
      return true
    case 'closing':
    case 'settling':
      collapse(el, drawnFrame(el, from))
      return true
    case 'leaving': {
      const frame = drawnFrame(el, from)
      for (const a of el.getAnimations()) a.cancel()
      tween(el, frame, { height: 0, opacity: 0 }, EXIT)
      return true
    }
    default:
      release(el)
      return true
  }
}

function drawnFrame(el: HTMLElement, height: () => number): Frame {
  return { height: height(), opacity: Number(getComputedStyle(el).opacity) }
}

function collapse(el: HTMLElement, from: Frame) {
  const panel = el.querySelector<HTMLElement>('.panel.closing')
  // A closing row keeps its open line until the panel goes, so its end height is measured as it will draw then.
  const row = el.querySelector<HTMLElement>('.row.closing')
  row?.classList.remove('closing')
  if (panel) panel.style.display = 'none'
  const target = contentHeight(el)
  if (panel) panel.style.display = ''
  row?.classList.add('closing')
  for (const a of el.getAnimations()) a.cancel()
  tween(el, from, { height: target, opacity: 1 }, { ...MOVE, fill: 'forwards' })
}

export function toggleFold(group: FoldGroup) {
  const el = root.querySelector<HTMLElement>(`[data-motion="closed-${group}"]`)
  if (!unfolded.has(group)) {
    unfolded.add(group)
    if (closingFolds.delete(group) && el) delete el.dataset.closing
    else entering.add(`closed-${group}`)
    tabState.draw()
    return
  }
  unfolded.delete(group)
  if (!el || reducedMotion.matches) {
    tabState.draw()
    return
  }
  closingFolds.add(group)
  tabState.draw()
  el.dataset.closing = '1'
  const height = el.getBoundingClientRect().height
  for (const a of el.getAnimations()) a.cancel()
  tween(el, { height, opacity: 1 }, { height: 0, opacity: 0 }, EXIT)
  later(() => {
    if (unfolded.has(group) || !closingFolds.delete(group)) return
    tabState.draw()
  }, EXIT_MS)
}

export function revealSelected() {
  if (tabState.isDisposed) return
  root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' })
  if (!reducedMotion.matches)
    later(() => root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' }), MOVE_MS + 20)
}

export function applyPageVariables() {
  document.documentElement.style.setProperty('--row-pad', `${ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--status-row-pad', `${STATUS_ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--look-gap', `${LOOK_GAP_PT}px`)
  document.documentElement.style.setProperty('--banner-pad-y', `${BANNER_PAD_Y_PT}px`)
  document.documentElement.style.setProperty('--banner-gap', `${BANNER_GAP_PT}px`)
  document.documentElement.style.setProperty('--pulse', `${RUNNING_PULSE_MS}ms`)
  document.documentElement.style.setProperty('--move', `${MOVE_MS}ms ${MOVE.easing}`)
  document.documentElement.style.setProperty('--enter', `${ENTER_MS}ms ${ENTER.easing}`)
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
