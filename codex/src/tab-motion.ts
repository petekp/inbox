import {
  ENTER_FADE_MS,
  enterDelayMs,
  FADE_MS,
  FAINT_OPACITY,
  isMoving,
  LEAVE_FADE_MS,
  SLIDE_PX,
  turnBackFades,
} from '../../core/view/row-motion'
import type { RowTrack } from '../../core/view/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import { tabState, entering, closingFolds, drawnRows, root } from './tab-state'
import { later } from './tab-host'
import { fadeForms, swapsForm } from './tab-form-swap'
import { atEndGlides, drawnLine, glideLine, openTitle, releaseLine, showClosedLine } from './tab-title-motion'
import type { DrawnLine } from './tab-title-motion'
import {
  fade,
  glide,
  glides,
  isFadingIn,
  isOpeningShort,
  isRunning,
  isScalingEdges,
  isUnderWay,
  opacityOf,
  spaceUnder,
  springOf,
  stopFadeOut,
  waitLeftMs,
} from './tab-glide'
import { fadeThrough, fadingParts, openHoldsUp, shownPanel, trunkBeside } from './tab-panel-fade'
import { collapse, naturalHeight, retargetClose, topIn } from './tab-collapse'
import { showConnectors } from './tab-connectors'
import { drawnKeys, showNewKeys } from './tab-new-keys'

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/**
 * An element's height before a draw, its line's, and the top of the part it draws open, a row's panel or a PR block's
 * body.
 */
type Drawn = {
  el: HTMLElement
  height: number
  line: DrawnLine | null
  openTop: number | null
  openPart: Element | null
  openShown: number
  opacity: number
}
type TabWidth = { el: HTMLElement; width: number; isShown: boolean }
type Drawing = { heights: Map<string, Drawn>; tabWidths: Map<string, TabWidth>; keys: Set<Element> }

/** The part an entry draws open: a row's panel, or a PR block's body. */
const OPEN_PART = '.panel, .pr-body'

const isShownTab = (el: HTMLElement) => el.classList.contains('shown')

export function measure(): Drawing {
  const heights = new Map<string, Drawn>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]')) {
    const part = drawnRows.has(el.dataset.motion!) ? el.querySelector(OPEN_PART) : null
    heights.set(el.dataset.motion!, {
      el,
      height: el.getBoundingClientRect().height,
      line: drawnLine(el),
      openTop: part ? topIn(el, part) : null,
      openPart: part,
      openShown: part instanceof HTMLElement ? opacityOf(part) : 1,
      opacity: opacityOf(el),
    })
  }
  const tabWidths = new Map<string, TabWidth>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-tab]'))
    tabWidths.set(el.dataset.tab!, { el, width: el.getBoundingClientRect().width, isShown: isShownTab(el) })

  return { heights, tabWidths, keys: drawnKeys() }
}

/**
 * How long a height move that starts in this draw waits, in ms: while a block that leaves holds its space as its
 * content fades, nothing a read brings in grows before that space starts to close: a block that enters, a row a read
 * selects and the row it closes, and a group's end growing to hold its empty note. In a draw that is not a read, the
 * selection's rows do not wait for a leave. A leave turned back waits only once it no longer holds its space, as a block that
 * enters does. A block that a later draw restarts while it still waits keeps what is left of its wait. A glide under
 * way and a block's own change of height never wait.
 */
let heightWaitMs = 0

/**
 * When the panel of each row that closed while its panel showed has faded out, by row, so that row's height starts to
 * shrink. A row that opens again drops its own, since its panel no longer fades, and still waits for the others.
 * `closeWaitMs` is how long a row or block that starts to open or enter in this draw waits for the last of them, the
 * person's own moves included, so a row the selection opens grows as the row it closes shrinks. Its selection shows
 * at once.
 */
const closeHolds = new Map<string, number>()
let closeWaitMs = 0

/**
 * When this draw stepped its rows, on the clock of their tracks' `since`. A row whose form it leaves still fades
 * from an earlier draw counts its wait on that clock, so a fresh fade waits exactly `LEAVE_FADE_MS`, however long
 * the draw took.
 */
let drawnAt = 0

/** Whether a leaving element no longer holds its space: its space has begun to shrink, or it left before its space opened. */
function isSpaceShort(el: HTMLElement): boolean {
  const g = glides.get(el)
  if (!g || g.size !== 'height' || g.to !== 0 || !isRunning(g.anim)) return false
  const hasShrunk = Number(g.anim.currentTime ?? 0) >= g.delay

  return hasShrunk || g.from.x < 0.5
}

/**
 * Grows an element in from `from` after `delay` ms, holding it there until then, then fades its content in once its
 * space is nearly open. Its fade slides the element with its content, so the space must first pass the content's last
 * line. Content still partly shown, as in a leave turned back, fades back in at once. Content that `isFaint` shows at
 * `FAINT_OPACITY` from the start and fades to full through `turnBackFades`.
 */
function growIn(el: HTMLElement, from: SpringState, opacity: number, delay: number, isFaint = false) {
  const to = naturalHeight(el)
  const slack = Math.min(
    SLIDE_PX / 2,
    atEndGlides(el, () => spaceUnder(el)),
  )
  const start = delay > 0 ? { x: from.x, v: 0 } : from
  glide(el, 'height', start, to, false, true, delay)
  if (isFaint) return fadeThrough(el, FAINT_OPACITY, turnBackFades(to, start), delay)
  const waits = opacity > 0.01 ? 0 : enterDelayMs(to, start, slack)
  fade(el, opacity, 1, ENTER_FADE_MS, false, true, delay + waits)
}

/** The height an element that comes or goes starts and ends at: its `data-rest` px, else 0. */
const restOf = (el: HTMLElement) => Number(el.dataset.rest) || 0

/** Fades an element's content out while its space holds, then shrinks the space to `to`. */
function fadeAway(el: HTMLElement, from: SpringState, slide: boolean, to = 0) {
  fade(el, opacityOf(el), 0, LEAVE_FADE_MS, true, slide)
  glide(el, 'height', from, to, true, true, LEAVE_FADE_MS)
}

/**
 * Starts each element's move after a draw. Children go first: an element with a gliding element inside it follows
 * that glide at its own height, unless it moves itself or its own content changed height, so the two never pull against
 * each other.
 */
export function animateDraw(before: Drawing, changed: ReadonlySet<string>, stepAt: number) {
  drawnAt = stepAt
  if (reducedMotion.matches) {
    entering.clear()
    return
  }
  const carried = new Set<Element>()
  const els = [...root.querySelectorAll<HTMLElement>('[data-motion]')].reverse()
  heightWaitMs = startsLeave(els, changed) ? LEAVE_FADE_MS : 0
  closeWaitMs = closeWaitOf(els, changed)
  for (const el of els) {
    if (!el.dataset.closing) moveOne(el, before.heights.get(el.dataset.motion!), changed, carried)
    if (isRunning(glides.get(el)?.anim)) {
      for (let up = el.parentElement?.closest('[data-motion]'); up; up = up.parentElement?.closest('[data-motion]'))
        carried.add(up)
    }
  }
  glideTabs(before.tabWidths)
  showNotes(before)
  showNewKeys(before.keys, before.heights)
  showConnectors()
  entering.clear()
  heightWaitMs = 0
  closeWaitMs = 0
}

/**
 * How long a row that starts to open in this draw waits for the panels of closing rows to fade out, in ms. A faint
 * turned-back panel shuts with its space and holds no other row.
 */
function closeWaitOf(els: HTMLElement[], changed: ReadonlySet<string>): number {
  const now = Date.now()
  for (const el of els) {
    const key = el.dataset.motion!
    const track = changed.has(key) ? drawnRows.get(key)?.track : undefined
    const state = track?.state
    if (state === 'opening') closeHolds.delete(key)
    const isFaint = state === 'closing' && isOpeningShort(el, springOf(el, el.getBoundingClientRect().height))
    if (state === 'closing' && !isFaint && shownPanel(el)) closeHolds.set(key, now + LEAVE_FADE_MS)
    if (track && swapsForm(el)) closeHolds.set(key, now + track.since + LEAVE_FADE_MS - drawnAt)
  }
  for (const [key, until] of closeHolds) if (until <= now) closeHolds.delete(key)

  return Math.max(0, ...[...closeHolds.values()].map(until => until - now))
}

/** A group's empty note this draw brings in. */
const NEW_NOTE = '.group-empty:not(.leaving):not([data-shown])'

/** A group's empty note that this draw brings in waits until its group's end has nearly grown to hold it, then fades in. */
function showNotes(before: Drawing) {
  for (const note of root.querySelectorAll<HTMLElement>(NEW_NOTE)) {
    note.dataset.shown = '1'
    const end = note.closest<HTMLElement>('[data-motion]')
    const g = end && before.heights.has(end.dataset.motion!) ? glides.get(end) : undefined
    if (!g || !isRunning(g.anim) || g.to <= g.from.x) continue
    fade(note, 0, 1, ENTER_FADE_MS, false, true, g.delay + enterDelayMs(g.to, g.from))
  }
}

/**
 * Whether a block starts to leave in this draw: an entry whose state turned to `leaving`, or a group's empty note that
 * starts to leave as its first rows arrive. The note's tab draws again once its fade ends, so it goes then.
 */
function startsLeave(els: HTMLElement[], changed: ReadonlySet<string>): boolean {
  const note = root.querySelector<HTMLElement>('.group-empty.leaving:not([data-fading])')
  if (note) {
    note.dataset.fading = '1'
    later(tabState.draw, LEAVE_FADE_MS)
  }

  return (
    note !== null ||
    els.some(el => changed.has(el.dataset.motion!) && drawnRows.get(el.dataset.motion!)?.track.state === 'leaving')
  )
}

function moveOne(el: HTMLElement, was: Drawn | undefined, changed: ReadonlySet<string>, carried: Set<Element>) {
  const key = el.dataset.motion!
  const state = drawnRows.get(key)?.track.state
  const isRowMoving = isUnderWay(el)
  const closeWait = state === 'opening' && changed.has(key) ? closeWaitMs : 0
  const held = state === 'closing' ? null : releaseLine(el, state === 'opening')
  moveRow(el, was, changed, carried, closeWait)
  if (state === 'closed' && was?.line?.isClosing) showClosedLine(el, was.line)
  const wait = Math.max(tabState.isReadDraw && !isRowMoving ? heightWaitMs : 0, closeWait)
  if (state === 'opening' && (held || changed.has(key))) openTitle(el, wait, held)
  if (changed.has(key) && swapsForm(el)) fadeForms(el, was?.openShown ?? 1)
}

function moveRow(
  el: HTMLElement,
  was: Drawn | undefined,
  changed: ReadonlySet<string>,
  carried: Set<Element>,
  closeWait: number,
) {
  const key = el.dataset.motion!
  const track = drawnRows.get(key)?.track
  const state = track?.state
  const isFresh = !was || was.el !== el
  if (isInClosingPanel(el) && state !== 'leaving') {
    if (isFresh) fade(el, 0, 0, 0, true)
    return
  }
  const part = drawnRows.has(key) ? el.querySelector<HTMLElement>(OPEN_PART) : null
  if (part && !part.classList.contains('closing')) part.style.marginTop = ''
  const from = springOf(el, isFresh ? el.getBoundingClientRect().height : was.height)
  const isOwnMove = (state === 'opening' && !tabState.isReadDraw) || isUnderWay(el)
  const waitLeft = waitLeftMs(el)
  const scalesEdges = isScalingEdges(el)
  const waitsForLeave = state === 'opening' || waitLeft > 0 || el.querySelector(NEW_NOTE) !== null
  const delay = Math.max(isOwnMove ? 0 : Math.max(waitsForLeave ? heightWaitMs : 0, waitLeft), closeWait)
  if (track && changed.has(key) && startState(el, track, from, isFresh, was?.openTop ?? null, was?.line ?? null)) return
  if (state === 'closing' && !isFresh) retargetClose(el)
  if (state === 'leaving' && track && was && isFresh) return goOnLeaving(el, was, track)
  if (state === 'closing' || state === 'settling' || state === 'leaving') return
  if (isFresh) {
    if (!state && entering.delete(key)) growIn(el, { x: 0, v: 0 }, 0, Math.max(heightWaitMs, closeWaitMs))
    else if (state === 'entering' && was) {
      const hasStarted = was.height >= 0.5 || was.opacity > 0
      growIn(el, { x: was.height, v: 0 }, was.opacity, hasStarted ? 0 : Math.max(heightWaitMs, closeWaitMs))
    }
    return
  }
  if (state && !isMoving(state) && !changed.has(key)) glideLine(el, was.line, naturalHeight(el) - from.x)
  if (carried.has(el) && !(state && isMoving(state))) {
    glides.get(el)?.anim.cancel()
    const isOwnChange = Math.abs(el.getBoundingClientRect().height - from.x) >= 0.5
    if (!isOwnChange) return
  }
  const opacity = opacityOf(el)
  const target = naturalHeight(el)
  for (const a of el.getAnimations()) if (a.playState === 'finished') a.cancel()
  if (Math.abs(from.x - target) >= 0.5 || Math.abs(from.v) * FRAME_MS >= 0.5)
    glide(el, 'height', from, target, false, scalesEdges, delay)
  const isGrowingIn = state === 'entering'
  if (opacity < 0.99 && !isFadingIn(el) && !isGrowingIn) fade(el, opacity, 1, FADE_MS)
  const leftShown = was?.openPart !== part && was?.openPart?.closest(FORM_LEFT) ? was.openShown : 0
  if (part && state === 'opening' && changed.has(key))
    openPanel(part, was?.openPart === part, delay, target, from, leftShown)
}

/**
 * Whether an element is drawn in a panel that is closing or leaving, such as a press's status in a closing row's panel
 * or a row in a closing PR block's body. It goes with the panel, which fades as it closes, so it starts no move of its
 * own, and one drawn new during the close shows nothing. A line that was shown and starts to leave still fades out.
 */
const isInClosingPanel = (el: HTMLElement): boolean => (el.parentElement?.closest('.closing[inert]') ?? null) !== null

/** The form a row leaves, drawn over the form it takes. */
const FORM_LEFT = '.form-left'

/**
 * Goes on with a leave whose element a draw replaced, as a status line above a row's buttons when Undo draws the row's
 * panel again: from the height and opacity its last element showed, on the leave's own clock, so it ends with its track.
 */
function goOnLeaving(el: HTMLElement, was: Drawn, track: RowTrack) {
  const fadeLeft = was.opacity > 0.01 ? Math.max(0, track.since + LEAVE_FADE_MS - drawnAt) : 0
  fade(el, was.opacity, 0, fadeLeft, true, !isInsideLeaving(el))
  glide(el, 'height', springOf(was.el, was.height), restOf(el), true, true, fadeLeft)
}

/**
 * Fades an opening row's panel in once its space is nearly open, counted from where the space is. A panel the row
 * still drew as it closed turns back at once, from the opacity it shows, in the steps of `turnBackFades`, and one
 * that still shows whole stops its fade out. A panel the form the row leaves still showed, at `leftShown`, as when
 * Undo brings a row back while its open form fades out, turns back the same way from that opacity.
 */
function openPanel(
  part: HTMLElement,
  wasDrawn: boolean,
  delay: number,
  target: number,
  from: SpringState,
  leftShown: number,
) {
  if (!wasDrawn && leftShown > 0.01) {
    const steps = turnBackFades(target, from)
    for (const el of [part, ...trunkBeside(part)]) fadeThrough(el, leftShown, steps, delay)
    openHoldsUp(part, delay + steps.slice(0, -1).reduce((ms, step) => ms + step.ms, 0))
    return
  }
  if (!wasDrawn) {
    const shows = delay + enterDelayMs(target, from)
    for (const el of [part, ...trunkBeside(part)]) fade(el, 0, 1, ENTER_FADE_MS, false, false, shows)
    openHoldsUp(part, shows)
    return
  }
  const steps = turnBackFades(target, from)
  for (const el of new Set([part, ...fadingParts(part), ...trunkBeside(part)])) {
    const opacity = opacityOf(el)
    if (opacity < 0.99) fadeThrough(el, opacity, steps, delay)
    else stopFadeOut(el)
  }
  openHoldsUp(part, delay + steps.slice(0, -1).reduce((ms, step) => ms + step.ms, 0))
}

/** Starts a row's or a PR block's move into `state`. False leaves the element to glide to its new height. */
function startState(
  el: HTMLElement,
  track: RowTrack,
  from: SpringState,
  isFresh: boolean,
  openTop: number | null,
  line: DrawnLine | null,
) {
  const { state } = track
  switch (state) {
    case 'entering': {
      const isTurn = !isFresh && el.getAnimations().length > 0
      const delay = isTurn && !isSpaceShort(el) ? 0 : Math.max(heightWaitMs, closeWaitMs)
      const isFaint = !isTurn && track.entersFaint === true
      growIn(el, isTurn ? from : { x: restOf(el), v: 0 }, isTurn ? opacityOf(el) : 0, delay, isFaint)
      return true
    }
    case 'closing':
    case 'settling':
      collapse(
        el,
        from,
        state,
        openTop,
        Math.max(tabState.isReadDraw ? heightWaitMs : 0, swapsForm(el) ? track.since + LEAVE_FADE_MS - drawnAt : 0),
        line,
      )
      return true
    case 'leaving':
      fadeAway(el, from, !isInsideLeaving(el), restOf(el))
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
 * Starts to grow or shrink the list drawn under `data-motion="closed-<motion>"` after its fold opened or shut: an Asks
 * group's closed rows, or a Status done fold's finished rows. Returns what runs after the caller's draw. `isOpen`
 * reads whether the fold is open now, so a fold opened again before its list finished shrinking stays drawn.
 */
export function foldMove(motion: string, isOpening: boolean, isOpen: () => boolean): () => void {
  const el = root.querySelector<HTMLElement>(`[data-motion="closed-${motion}"]`)
  if (isOpening) {
    if (closingFolds.delete(motion) && el) delete el.dataset.closing
    else entering.add(`closed-${motion}`)
    return () => undefined
  }
  if (!el || reducedMotion.matches) return () => undefined
  closingFolds.add(motion)

  return () => {
    el.dataset.closing = '1'
    fadeAway(el, springOf(el, el.getBoundingClientRect().height), true)
    later(() => {
      if (isOpen() || !closingFolds.delete(motion)) return
      tabState.draw()
    }, LEAVE_FADE_MS + HEIGHT_SETTLE_MS)
  }
}
