import { atEndWeight } from './weight-ease'
import { ENTER_FADE_MS, enterDelayMs, FADE_MS, isMoving, LEAVE_FADE_MS, ROW_STATE_MS } from '../../hooks/row-motion'
import type { RowState } from '../../hooks/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS } from '../../hooks/springs'
import type { SpringState } from '../../hooks/springs'
import { tabState, entering, closingFolds, drawnRows, root } from './tab-state'
import { later, cancelTimer } from './tab-host'
import { atEndLines, closeTitle, openTitle, releaseLine, LINE } from './tab-title-motion'
import {
  fade,
  glide,
  glides,
  isFadingIn,
  isRunning,
  isScalingEdges,
  isUnderWay,
  opacityOf,
  springOf,
  stopFadeOut,
  waitLeftMs,
} from './tab-glide'

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/** An element's height before a draw, and the top of the part it draws open, a row's panel or a PR block's body. */
type Drawn = { el: HTMLElement; height: number; openTop: number | null; openPart: Element | null }
type TabWidth = { el: HTMLElement; width: number; isShown: boolean }
type Drawing = { heights: Map<string, Drawn>; tabWidths: Map<string, TabWidth>; fieldKeys: Set<Element> }

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
      openPart: part,
    })
  }
  const tabWidths = new Map<string, TabWidth>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-tab]'))
    tabWidths.set(el.dataset.tab!, { el, width: el.getBoundingClientRect().width, isShown: isShownTab(el) })

  return { heights, tabWidths, fieldKeys: new Set(root.querySelectorAll(FIELD_KEYS)) }
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

/** The height an element takes with no glide: its own glide stops, so the next one starts from `springOf`. Measured at the end weights. */
function naturalHeight(el: HTMLElement): number {
  glides.get(el)?.anim.cancel()

  return atEndWeight(el, () => atEndLines(el, () => el.getBoundingClientRect().height))
}

/** Whether a leaving element no longer holds its space: its space has begun to shrink, or it left before its space opened. */
function isSpaceShort(el: HTMLElement): boolean {
  const g = glides.get(el)
  if (!g || g.size !== 'height' || g.to !== 0 || !isRunning(g.anim)) return false
  const hasShrunk = Number(g.anim.currentTime ?? 0) >= g.delay

  return hasShrunk || g.from.x < 0.5
}

/**
 * Grows an element in from `from` after `delay` ms, holding it there until then, then fades its content in once its
 * space is nearly open. Content still partly shown, as in a leave turned back, fades back in at once.
 */
function growIn(el: HTMLElement, from: SpringState, opacity: number, delay: number) {
  const to = naturalHeight(el)
  const start = delay > 0 ? { x: from.x, v: 0 } : from
  glide(el, 'height', start, to, false, true, delay)
  const waits = opacity > 0.01 ? 0 : enterDelayMs(to, start)
  fade(el, opacity, 1, ENTER_FADE_MS, false, true, delay + waits)
}

/** Fades an element's content out while its space holds, then shrinks the space away. */
function fadeAway(el: HTMLElement, from: SpringState, slide: boolean) {
  fade(el, opacityOf(el), 0, LEAVE_FADE_MS, true, slide)
  glide(el, 'height', from, 0, true, true, LEAVE_FADE_MS)
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
  showFieldKeys(before)
  entering.clear()
  heightWaitMs = 0
  closeWaitMs = 0
}

/** A closing row's panel while any of the parts that fade shows. */
function shownPanel(el: HTMLElement): HTMLElement | null {
  const part = el.querySelector<HTMLElement>('.closing[inert]')
  const isShown = part !== null && fadingParts(part).some(p => opacityOf(p) > 0.01)

  return isShown ? part : null
}

/** How long a row that starts to open in this draw waits for the panels of closing rows to fade out, in ms. */
function closeWaitOf(els: HTMLElement[], changed: ReadonlySet<string>): number {
  const now = Date.now()
  for (const el of els) {
    const key = el.dataset.motion!
    const state = changed.has(key) ? drawnRows.get(key)?.track.state : undefined
    if (state === 'opening') closeHolds.delete(key)
    if (state === 'closing' && shownPanel(el)) closeHolds.set(key, now + LEAVE_FADE_MS)
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

/** A text field's buttons, such as the goal field's Save and Cancel. */
const FIELD_KEYS = '.field-keys'

/**
 * A field's buttons that this draw brings into a moving block fade in while the text field shows at once, as in Herdr.
 * While the field's box grows they wait until it has nearly grown to hold them. A box this draw brings in, as on a
 * page's first draw, opens no field, and its buttons show at once.
 */
function showFieldKeys(before: Drawing) {
  for (const keys of root.querySelectorAll<HTMLElement>(FIELD_KEYS)) {
    if (before.fieldKeys.has(keys)) continue
    const box = keys.closest<HTMLElement>('[data-motion]')
    if (!box || before.heights.get(box.dataset.motion!)?.el !== box) continue
    const g = glides.get(box)
    const isGrowing = g !== undefined && isRunning(g.anim) && g.to > g.from.x
    fade(keys, 0, 1, ENTER_FADE_MS, false, false, isGrowing ? g.delay + enterDelayMs(g.to, g.from) : 0)
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
  const wait = Math.max(tabState.isReadDraw && !isRowMoving ? heightWaitMs : 0, closeWait)
  if (state === 'opening' && (held || changed.has(key))) openTitle(el, wait, held)
}

function moveRow(
  el: HTMLElement,
  was: Drawn | undefined,
  changed: ReadonlySet<string>,
  carried: Set<Element>,
  closeWait: number,
) {
  const key = el.dataset.motion!
  const state = drawnRows.get(key)?.track.state
  const isFresh = !was || was.el !== el
  const part = drawnRows.has(key) ? el.querySelector<HTMLElement>(OPEN_PART) : null
  if (part && !part.classList.contains('closing')) part.style.marginTop = ''
  const from = springOf(el, isFresh ? el.getBoundingClientRect().height : was.height)
  const isOwnMove = (state === 'opening' && !tabState.isReadDraw) || isUnderWay(el)
  const waitLeft = waitLeftMs(el)
  const scalesEdges = isScalingEdges(el)
  const waitsForLeave = state === 'opening' || waitLeft > 0 || el.querySelector(NEW_NOTE) !== null
  const delay = Math.max(isOwnMove ? 0 : Math.max(waitsForLeave ? heightWaitMs : 0, waitLeft), closeWait)
  if (state && changed.has(key) && startState(el, state, from, isFresh, was?.openTop ?? null)) return
  if (state === 'closing' || state === 'settling' || state === 'leaving') return
  if (isFresh) {
    if (!state && entering.delete(key)) growIn(el, { x: 0, v: 0 }, 0, Math.max(heightWaitMs, closeWaitMs))
    return
  }
  if (carried.has(el) && !(state && isMoving(state))) {
    glides.get(el)?.anim.cancel()
    return
  }
  const opacity = opacityOf(el)
  const target = naturalHeight(el)
  for (const a of el.getAnimations()) if (a.playState === 'finished') a.cancel()
  if (Math.abs(from.x - target) >= 0.5 || Math.abs(from.v) * FRAME_MS >= 0.5)
    glide(el, 'height', from, target, false, scalesEdges, delay)
  if (opacity < 0.99 && !isFadingIn(el)) fade(el, opacity, 1, FADE_MS)
  if (part && state === 'opening' && changed.has(key)) openPanel(part, was?.openPart === part, delay, target, from)
}

/**
 * Fades an opening row's panel in once its space is nearly open, counted from where the space is. A panel the row
 * still drew as it closed turns back from the opacity it shows, and one that still shows whole stops its fade out.
 */
function openPanel(part: HTMLElement, wasDrawn: boolean, delay: number, target: number, from: SpringState) {
  const waits = delay + enterDelayMs(target, from)
  if (!wasDrawn) return fade(part, 0, 1, ENTER_FADE_MS, false, false, waits)
  for (const el of new Set([part, ...fadingParts(part)])) {
    const opacity = opacityOf(el)
    if (opacity < 0.99) fade(el, opacity, 1, ENTER_FADE_MS, false, false, waits)
    else stopFadeOut(el)
  }
}

/** A panel's Holds up line, which the closed line draws in the same place once the row's close ends. */
const HOLDS_UP = '.branch.holds-up'

/** The parts of a closing row's panel that fade out: all of it but its Holds up line, which stays shown. */
function fadingParts(el: HTMLElement): HTMLElement[] {
  if (!el.querySelector(HOLDS_UP)) return [el]

  return [...el.children].flatMap(c => (c.matches(HOLDS_UP) ? [] : fadingParts(c as HTMLElement)))
}

/** Starts a row's or a PR block's move into `state`. False leaves the element to glide to its new height. */
function startState(el: HTMLElement, state: RowState, from: SpringState, isFresh: boolean, openTop: number | null) {
  switch (state) {
    case 'entering': {
      const isTurn = !isFresh && el.getAnimations().length > 0
      const delay = isTurn && !isSpaceShort(el) ? 0 : Math.max(heightWaitMs, closeWaitMs)
      growIn(el, isTurn ? from : { x: 0, v: 0 }, isTurn ? opacityOf(el) : 0, delay)
      return true
    }
    case 'closing':
    case 'settling':
      collapse(el, from, state, openTop, tabState.isReadDraw ? heightWaitMs : 0)
      return true
    case 'leaving':
      fadeAway(el, from, !isInsideLeaving(el))
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
 * Shrinks an entry to the height it comes to rest at, over what it drew open and still draws, inert: a closing row's
 * panel or a PR block's body. A closing row's panel fades out first, while the entry holds its height, so the shrinking
 * height never cuts a line of it that shows. A panel that shows nothing yet, as one still waiting to fade in, stays
 * hidden and holds nothing. A settling PR block's dismissed head replaces the line above its body, so
 * the body keeps the top it had at `openTop` while the height shrinks over it. A settling row draws only its settled
 * line.
 */
function collapse(
  el: HTMLElement,
  from: SpringState,
  state: 'closing' | 'settling',
  openTop: number | null,
  delay: number,
) {
  const part = el.querySelector<HTMLElement>('.closing[inert]')
  // A closing row keeps its open line until the panel goes, so its end height is measured as it will draw then.
  const row = el.querySelector<HTMLElement>('.row.closing')
  const line = row?.querySelector<HTMLElement>(LINE) ?? null
  const lineFrom = line ? springOf(line, line.getBoundingClientRect().height) : null
  if (line) glides.get(line)?.anim.cancel()
  row?.classList.remove('closing')
  if (part) part.style.display = 'none'
  const target = naturalHeight(el)
  const title = line?.querySelector<HTMLElement>(':scope > .text:not(.short)')
  const lineTo = title ? atEndWeight(title, () => title.getBoundingClientRect().height) : null
  if (part) part.style.display = ''
  row?.classList.add('closing')
  if (part && state === 'settling' && openTop !== null) keepTop(el, part, openTop)
  const shown = state === 'closing' ? shownPanel(el) : null
  if (shown) for (const p of fadingParts(shown)) fade(p, opacityOf(p), 0, LEAVE_FADE_MS, true)
  else if (part && state === 'closing') fade(part, 0, 0, 0, true)
  const opacity = opacityOf(el)
  glide(el, 'height', from, target, true, false, Math.max(delay, shown ? LEAVE_FADE_MS : 0))
  if (line && lineFrom && lineTo !== null) closeTitle(line, lineFrom, lineTo, delay)
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
  fadeAway(el, springOf(el, el.getBoundingClientRect().height), true)
  later(() => {
    if (shown.has(id) || !closingFolds.delete(motion)) return
    tabState.draw()
  }, LEAVE_FADE_MS + HEIGHT_SETTLE_MS)
}

/** Scrolls the open row into view, and again once its height has come to rest. */
export function revealSelected() {
  if (tabState.isDisposed) return
  const behavior: ScrollBehavior = reducedMotion.matches ? 'auto' : 'smooth'
  const reveal = () => root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest', behavior })
  reveal()
  if (!reducedMotion.matches) later(reveal, HEIGHT_SETTLE_MS)
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
