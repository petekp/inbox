import { FRAME_MS, HEIGHT_SETTLE_MS, springFrames } from './springs'
import type { SpringState } from './springs'

/** How long a fade lasts when it does not move space, such as a hover or a row's fill, in ms. */
export const FADE_MS = 200

/**
 * How long the content of a block that leaves fades out, in ms. Its space holds its height meanwhile and closes as soon
 * as the content has faded, so no text is cut by a closing space. A row's panel fades out as fast as its row closes.
 */
export const LEAVE_FADE_MS = 120

/** How long the content of a block that enters, or a row's panel as it opens, fades in once its wait ends, in ms. */
export const ENTER_FADE_MS = 150

/**
 * How far a row's content sits above its place when it is fully faded out, in px. A row that leaves slides up to this
 * offset as it fades, and one that enters slides down from it, so the offset is always its share of the fade.
 */
export const SLIDE_PX = 8

/**
 * How long the content of a space that opens to `height` px, from none at rest or from `from`, waits before it fades
 * in, in ms: until the space stays within half of `SLIDE_PX` of open, so the edge of a space still opening never cuts
 * the letters of content that slides down into it. A space that was shutting keeps shutting for a moment before it
 * turns, so the wait follows its speed as well as its height. A tall space comes the last few px slowly, so the wait is
 * at most what lets the fade end as the height spring comes to rest.
 */
export function enterDelayMs(height: number, from: SpringState = { x: 0, v: 0 }): number {
  const at = springFrames(from, height).findLastIndex(x => height - x > SLIDE_PX / 2) + 1

  return Math.min(at * FRAME_MS, HEIGHT_SETTLE_MS - ENTER_FADE_MS)
}

/** The vertical offset of content at `opacity`: none when shown, `SLIDE_PX` above its place when faded out. */
export const slideOffset = (opacity: number): number => -SLIDE_PX * (1 - Math.min(1, Math.max(0, opacity)))

/**
 * A row's state. The resting states draw one form: `closed` its line, `open` its line and panel, `settled` its
 * settled line, `undoing` that line while an Undo press is out. The moving states animate toward a form, and each
 * keeps what it moves away from drawn: `closing` keeps the panel, `settling` keeps the last open panel under the
 * settled line, and `leaving` keeps the row's last form while it fades and collapses.
 */
export type RowState =
  'entering' | 'closed' | 'opening' | 'open' | 'closing' | 'settling' | 'settled' | 'undoing' | 'leaving'

/** The form the tab wants a row in now: from the view, the open row, and an Undo press. `gone` once it is not drawn. */
export type RowTarget = 'closed' | 'open' | 'settled' | 'undoing' | 'gone'

/**
 * A row's state, when it entered it, and whether it draws the open row's panel: an open row, one growing in open,
 * and a row closing, settling or leaving from a state that drew it. `entersSettled` marks a row growing in settled.
 */
export type RowTrack = { state: RowState; since: number; hasPanel: boolean; entersSettled?: true }

/** How long each state's fade lasts, in ms. Resting states are 0. */
export const ROW_FADE_MS: Record<RowState, number> = {
  entering: ENTER_FADE_MS,
  opening: ENTER_FADE_MS,
  closing: LEAVE_FADE_MS,
  settling: FADE_MS,
  leaving: LEAVE_FADE_MS,
  closed: 0,
  open: 0,
  settled: 0,
  undoing: 0,
}

/**
 * How long each moving state lasts, in ms: until its height spring and its fade have both come to rest, so a row
 * keeps what it moves away from drawn while any of it shows. A leaving row's spring starts once its fade ends. Resting
 * states are 0.
 */
export const ROW_STATE_MS: Record<RowState, number> = Object.fromEntries(
  Object.entries(ROW_FADE_MS).map(([state, fadeMs]) => {
    const springStarts = state === 'leaving' ? LEAVE_FADE_MS : 0

    return [state, fadeMs > 0 ? Math.max(fadeMs, springStarts + HEIGHT_SETTLE_MS) : 0]
  }),
) as Record<RowState, number>

type Form = Exclude<RowTarget, 'undoing'>

export function isMoving(state: RowState): boolean {
  return ROW_STATE_MS[state] > 0
}

/**
 * A row's next track, at each draw. A new target starts the move toward it from wherever the row is drawn. A moving
 * state comes to rest once its length has passed, so an animation that never reports its end cannot hold a row.
 * `isNew` grows a row the view just brought in, in any form; any other row the tab has not drawn yet shows its form at
 * once. With `isReduced`, every move ends in the draw that starts it. Null when the row is no longer drawn.
 */
export function stepRow(
  track: RowTrack | undefined,
  target: RowTarget,
  now: number,
  isNew = false,
  isReduced = false,
): RowTrack | null {
  const form: Form = target === 'undoing' ? 'settled' : target
  if (!track) {
    if (isNew && !isReduced && form !== 'gone') return entering(form, now)
    return rest(undefined, form, target, now)
  }
  const next = formOf(track) === form ? track : moveToward(track, form, now)
  if (isMoving(next.state) && !isReduced && now - next.since < ROW_STATE_MS[next.state]) return next

  return rest(next, form, target, now)
}

function entering(form: Exclude<Form, 'gone'>, now: number): RowTrack {
  const track: RowTrack = { state: 'entering', since: now, hasPanel: form === 'open' }

  return form === 'settled' ? { ...track, entersSettled: true } : track
}

function formOf({ state, hasPanel, entersSettled }: RowTrack): Form {
  switch (state) {
    case 'entering':
      return entersSettled ? 'settled' : hasPanel ? 'open' : 'closed'
    case 'opening':
    case 'open':
      return 'open'
    case 'closing':
    case 'closed':
      return 'closed'
    case 'settling':
    case 'settled':
    case 'undoing':
      return 'settled'
    case 'leaving':
      return 'gone'
  }
}

function moveToward(track: RowTrack, form: Form, now: number): RowTrack {
  switch (form) {
    case 'open':
      return { state: 'opening', since: now, hasPanel: true }
    case 'closed':
      return track.state === 'leaving'
        ? entering('closed', now)
        : { state: 'closing', since: now, hasPanel: track.hasPanel }
    case 'settled':
      return { state: 'settling', since: now, hasPanel: track.hasPanel }
    case 'gone':
      return { state: 'leaving', since: now, hasPanel: track.hasPanel }
  }
}

function rest(track: RowTrack | undefined, form: Form, target: RowTarget, now: number): RowTrack | null {
  if (form === 'gone') return null
  const state: RowState = target === 'undoing' ? 'undoing' : form

  return track?.state === state ? track : { state, since: now, hasPanel: state === 'open' }
}
