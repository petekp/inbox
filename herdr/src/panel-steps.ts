import {
  ENTER_FADE_MS,
  FAINT_OPACITY,
  ROW_STATE_MS,
  enterDelayMs,
  faintCloseFades,
  turnBackFades,
} from '../../core/view/row-motion'
import type { FadeStep, RowState, RowTrack } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS, HEIGHT_SPRING, springStep } from '../../core/view/springs'
import type { SpringState } from '../../core/view/springs'
import { NEXT_FRAME_MS } from './block-glide'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { isStatusUnder } from './held-line'
import type { FormSwap } from './form-swap'
import type { Tracked } from './tracks'
import type { UnderLine } from './under-line'

/**
 * One step of a panel's fade as its row turns back, closes while faint or takes a press, with when it starts and the
 * opacity it starts from. A step
 * of no length still lasts a frame, so the look draws it before the next step starts.
 */
export type PanelStep = FadeStep & { at: number; from: number }

/**
 * A row's panel space, the part of its box that holds the panel, as the look springs it: `box` is its spring at `at`,
 * the draw that last set its target, and `to` that target, so a move that turns back counts from where it really is.
 */
export type PanelSpace = { box: SpringState; at: number; to: number }

/** Where the panel space is at `now`, and how fast it moves. */
export const spaceNow = (s: PanelSpace, now: number): SpringState => springStep(s.box, s.to, now - s.at)

/**
 * Whether `space` aims taller than `rest`, the space it last rested at, by more than the height spring's rest distance,
 * so a measure that differs from the last only in its last digits is no growth.
 */
export const isGrowingFrom = (rest: PanelSpace | null, space: PanelSpace): boolean =>
  rest !== null && space.to > rest.to + HEIGHT_SPRING.epsilon

/** The panel space with its target set to `to` px in this draw, from where it is, or at rest there if it is new. */
export function aimSpace(last: PanelSpace | null, to: number, now: number): PanelSpace {
  if (last === null) return { box: { x: to, v: 0 }, at: now, to }

  return to === last.to ? last : { box: spaceNow(last, now), at: now, to }
}

function timed(now: number, from: number, fades: FadeStep[]): PanelStep[] {
  let at = now
  let opacity = from

  return fades.map(step => {
    const started = { ...step, at, from: opacity }
    at += Math.max(step.ms, NEXT_FRAME_MS)
    opacity = step.to
    return started
  })
}

/**
 * The fade steps of a panel `height` px tall turned back in this draw at `opacity`, from where its space was, each with
 * its start.
 */
function stepsFrom(now: number, space: PanelSpace | null, height: number, opacity: number): PanelStep[] {
  return timed(now, opacity, turnBackFades(height, space ? spaceNow(space, now) : { x: height, v: 0 }))
}

/** The fade steps of a faint turned-back panel whose row closes in this draw, from the opacity its `steps` draw now. */
const faintCloseSteps = (now: number, steps: PanelStep[]): PanelStep[] => {
  const opacity = opacityAt(steps, now)

  return timed(now, opacity, faintCloseFades(opacity))
}

/** The progress of an `ease-out` fade, cubic-bezier(0, 0, .58, 1), after the share `x` of its time. */
export function easeOut(x: number): number {
  const at = (t: number, control: number) => 3 * (1 - t) * t * t * control + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (at(mid, 0.58) < x) lo = mid
    else hi = mid
  }

  return at((lo + hi) / 2, 1)
}

/** The opacity a panel's fade `steps` draw at `now`. */
export function opacityAt(steps: PanelStep[], now: number): number {
  const step = steps.findLast(s => s.at <= now) ?? steps[0]
  if (!step) return 0
  const share = step.ms > 0 ? Math.min(1, Math.max(0, (now - step.at) / step.ms)) : 1

  return step.from + (step.to - step.from) * easeOut(share)
}

/** A row's panel fades in as it opens and out as it closes, from where it is when the move turns back. */
export function panelOf(
  state: RowState,
  isStart: boolean,
  last: { track: RowTrack; opened: RowBlock | null; swap: FormSwap | null } | undefined,
  closing: RowBlock | null,
): number | null {
  const isLeftPanelShown = last?.swap?.inAt === null && isOpenRow(last.swap.from)
  const wasPanelFolding =
    last?.track.state === 'opening' || (last?.track.state === 'closing' && last.opened !== null) || isLeftPanelShown
  const isFrom = isStart && !wasPanelFolding
  if (state === 'opening') return isFrom ? 0 : 1
  if (state === 'closing' && closing) return isFrom ? 1 : 0

  return null
}

/** Whether an opening row's panel still holds faint in its fade steps at `now`, short of its last step. */
export const isPanelFaint = (t: Pick<Tracked, 'track' | 'panelSteps'>, now: number): boolean =>
  t.track.state === 'opening' && t.panelSteps !== null && now < (t.panelSteps.at(-1)?.at ?? now)

/**
 * A press that steps a row's panel to `FAINT_OPACITY` at once, so it shows in the press's own draw. `close` is the
 * press's answer closing the row with a status after its title, such as "Addressing…": the panel fades out from faint,
 * and the status shows faint over it until the panel has gone. `open` brings a status under the buttons of a row whose
 * panel still waits for its space: the panel and the status hold faint until its space is nearly open, then fade in by
 * the time the row is open.
 */
type PanelPress = 'close' | 'open' | null

/** Whether a row's closed form, `b`, draws a status after its title that its open form, `opened`, did not. */
const addsTitleLine = (opened: RowBlock, b: Block): boolean =>
  b.kind === 'row' &&
  b.feedback !== null &&
  !isStatusUnder(b) &&
  !b.isLineWaiting &&
  (isStatusUnder(opened) || opened.feedback?.text !== b.feedback.text)

/**
 * Whether a row's block, `b`, brings a status under its buttons whose text its last form, `was`, did not draw, wherever
 * that form drew its status.
 */
export const bringsStatusUnder = (was: Block | undefined, b: Block): boolean =>
  b.kind === 'row' &&
  b.feedback !== null &&
  isStatusUnder(b) &&
  (was?.kind !== 'row' || was.feedback?.text !== b.feedback.text)

/**
 * The press that steps a row's panel to faint in this draw, from the row as last drawn, `last`, the open form a
 * closing row keeps, `closing`, the block, its status under the buttons, `under`, whether the draw follows the
 * person's input to it, and whether its panel shows whole, `isShown`. A panel that does not yet show whole fades as
 * `stepPanel` says without a press, as does the panel of a row that turns back from closing, or one a press already
 * stepped.
 */
export function panelPressOf(
  track: RowTrack,
  last: Tracked | undefined,
  closing: RowBlock | null,
  b: Block,
  under: UnderLine | null,
  now: number,
  isInput: boolean,
  isShown: boolean,
): PanelPress {
  if (!isInput) return null
  if (track.state === 'closing')
    return track.since === now && isShown && closing && addsTitleLine(closing, b) ? 'close' : null
  const isUnderNew = under?.since === now && under.isInput && bringsStatusUnder(last?.block, b)
  const isTurnedBack = last?.track.state === 'closing'

  return track.state === 'opening' && isUnderNew && !isShown && !isTurnedBack && last?.isPanelPressed !== true
    ? 'open'
    : null
}

/**
 * The panel's fade steps from a press, as `PanelPress` says. A panel that closes fades out from the next draw until its
 * box lets go of its height, `heldUntil`. A panel that opens on its `track` holds faint until a panel `height` px tall
 * would start to fade in, as its space is nearly open, then fades to full by the time the row is open.
 */
function pressedSteps(
  now: number,
  press: 'close' | 'open',
  heldUntil: number,
  track: RowTrack,
  height: number | undefined,
): PanelStep[] {
  const outAt = now + NEXT_FRAME_MS
  if (press === 'close')
    return [
      { at: now, from: 1, to: FAINT_OPACITY, ms: 0 },
      { at: outAt, from: FAINT_OPACITY, to: 0, ms: Math.max(0, heldUntil - outAt) },
    ]

  const delay = height === undefined ? HEIGHT_SETTLE_MS - ENTER_FADE_MS : enterDelayMs(height)
  const fadeAt = Math.max(outAt, track.since + NEXT_FRAME_MS + delay)
  const openAt = track.since + ROW_STATE_MS.opening

  return [
    { at: now, from: 0, to: FAINT_OPACITY, ms: 0 },
    { at: fadeAt, from: FAINT_OPACITY, to: 1, ms: Math.max(0, Math.min(ENTER_FADE_MS, openAt - fadeAt)) },
  ]
}

/**
 * A row's panel fade steps in this draw on its `track`, as `Tracked` says, from the row as last drawn, `last`, with
 * `height` the panel's measured height, and whether a press stepped them, as `press` does in this draw, with the panel's
 * box holding its height until `heldUntil`. A panel a press held faint while it waited for its space hides at once if
 * its row closes, since it never showed whole. A panel that fades as its row opens or closes, or rests, has none.
 */
export function stepPanel(
  track: RowTrack,
  last: Tracked | undefined,
  now: number,
  height: number | undefined,
  press: PanelPress,
  heldUntil: number,
): { steps: PanelStep[] | null; isPressed: boolean } {
  const isStart = track.since === now
  const lastSteps = last?.panelSteps ?? null
  const none = { steps: null, isPressed: false }
  if (track.state !== 'opening' && track.state !== 'closing') return none
  if (press) return { steps: pressedSteps(now, press, heldUntil, track, height), isPressed: true }
  if (isStart && track.state === 'opening' && last?.track.state === 'closing' && last.opened !== null) {
    const from = lastSteps ? opacityAt(lastSteps, now) : 0
    return { steps: stepsFrom(now, last.panelSpace, height ?? 0, from), isPressed: false }
  }
  if (isStart && track.state === 'closing' && last && isPanelFaint(last, now) && lastSteps) {
    const steps = last.isPanelPressed ? timed(now, 0, [{ to: 0, ms: 0 }]) : faintCloseSteps(now, lastSteps)
    return { steps, isPressed: false }
  }

  return isStart ? none : { steps: lastSteps, isPressed: last?.isPanelPressed ?? false }
}
