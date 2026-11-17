import { HEIGHT_SETTLE_MS } from './springs'

/** How long a fade lasts when it does not move space, such as a hover or a row's fill, in ms. */
export const FADE_MS = 200

/**
 * How long content fades as its space enters, leaves, opens or closes, in ms: as long as the height spring takes to
 * come to rest. Content then stays shown until its space has closed, and shows in full only as its space has grown.
 */
export const SPACE_FADE_MS = HEIGHT_SETTLE_MS

/**
 * The opacity of content whose space is `height` px tall out of `full`: the height's share of the shorter of `full`
 * and `SPACE_FADE_PX`, raised to one third. Content stays visible until its space is nearly gone, since opacity under
 * 20% reads as blank, and shows in full only as its space has grown.
 */
const SPACE_FADE_PX = 200
export const spaceOpacity = (height: number, full: number): number =>
  full <= 0 ? 1 : Math.min(1, (Math.max(0, height) / Math.min(full, SPACE_FADE_PX)) ** (1 / 3))

/** How long a closed row's line fades back in as its close ends, in ms. */
export const LINE_RETURN_FADE_MS = 300

/**
 * How far a row's content sits above its place when it is fully faded out, in px. A row that leaves slides up to this
 * offset as it fades, and one that enters slides down from it, so the offset is always its share of the fade.
 */
export const SLIDE_PX = 8

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
 * and a row closing, settling or leaving from a state that drew it.
 */
export type RowTrack = { state: RowState; since: number; hasPanel: boolean }

/** How long each state's fade lasts, in ms. Resting states are 0. */
export const ROW_FADE_MS: Record<RowState, number> = {
  entering: SPACE_FADE_MS,
  opening: SPACE_FADE_MS,
  closing: SPACE_FADE_MS,
  settling: FADE_MS,
  leaving: SPACE_FADE_MS,
  closed: 0,
  open: 0,
  settled: 0,
  undoing: 0,
}

/**
 * How long each moving state lasts, in ms: until its height spring and its fade have both come to rest, so a row
 * keeps what it moves away from drawn while any of it shows. Resting states are 0.
 */
export const ROW_STATE_MS: Record<RowState, number> = Object.fromEntries(
  Object.entries(ROW_FADE_MS).map(([state, fadeMs]) => [state, fadeMs > 0 ? Math.max(fadeMs, HEIGHT_SETTLE_MS) : 0]),
) as Record<RowState, number>

type Form = Exclude<RowTarget, 'undoing'>

export function isMoving(state: RowState): boolean {
  return ROW_STATE_MS[state] > 0
}

/**
 * A row's next track, at each draw. A new target starts the move toward it from wherever the row is drawn. A moving
 * state comes to rest once its length has passed, so an animation that never reports its end cannot hold a row.
 * `isNew` grows a row the view just brought in, closed or open; any other row the tab has not drawn yet shows its
 * form at once. With `isReduced`, every move ends in the draw that starts it. Null when the row is no longer drawn.
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
    if (isNew && !isReduced && (form === 'closed' || form === 'open'))
      return { state: 'entering', since: now, hasPanel: form === 'open' }
    return rest(undefined, form, target, now)
  }
  const next = formOf(track) === form ? track : moveToward(track, form, now)
  if (isMoving(next.state) && !isReduced && now - next.since < ROW_STATE_MS[next.state]) return next

  return rest(next, form, target, now)
}

function formOf({ state, hasPanel }: RowTrack): Form {
  switch (state) {
    case 'entering':
      return hasPanel ? 'open' : 'closed'
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
        ? { state: 'entering', since: now, hasPanel: false }
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
