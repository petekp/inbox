import type { LastAction, Draft, Closed } from '../types'
import { isUndoable } from './pressed'
import { RUNNING_FRAMES } from './help'
import { textMark } from './marks'
import type { ClosedDelivery, SettledState, RowView, ResultMark } from './rows'
import { statusListRows } from './status-page'
import type { StatusPage } from './status-page'
import type { ViewInput } from './view'

/** How long Undo can take back a close or a press. Once it passes, Done tells the agent. */
export const SETTLED_MS = 5120

/** How long an ask waits before its permission row shows, where no classic.PermissionRequest hook runs. */
export const PERMISSION_FALLBACK_DELAY_MS = 1500
export const PRESS_GUARD_MS = 400
export const QUEUED_AFTER_MS = 1000
/** How long a Compare press waits for the agent to record the question again after its reply. */
export const COMPARE_LIMIT_MS = 30 * 60_000

/** When the soonest Compare press still inside its limit reaches it, so a look can redraw then. */
export function compareEndsAt(lastActions: Record<string, LastAction>, now: number): number | null {
  const ends = Object.values(lastActions)
    .filter(l => l.action === 'compare')
    .map(l => l.at + COMPARE_LIMIT_MS)
    .filter(at => at > now)

  return ends.length > 0 ? Math.min(...ends) : null
}

function isQueuedAt(last: LastAction | undefined, now: number): boolean {
  return last?.delivery?.state === 'queued' && now - last.at >= QUEUED_AFTER_MS
}

/**
 * A send still on its way, or held for Undo before it leaves. For its first QUEUED_AFTER_MS a queued send reads as
 * sending, so a send that the agent takes at once never reads Queued. None reads as delivered, so none draws a ✓.
 */
export function pendingDeliveryAt(
  last: LastAction | undefined,
  now: number,
): 'held' | 'sending' | 'queued' | 'unconfirmed' | null {
  if (last?.delivery?.state === 'held') return 'held'
  if (last?.delivery?.state === 'unconfirmed') return 'unconfirmed'
  if (last?.delivery?.state !== 'queued') return null
  return isQueuedAt(last, now) ? 'queued' : 'sending'
}

/** 0 means no click opened it, so nothing is guarded. */
export function isGuarded(openedAt: number, now: number): boolean {
  return openedAt > 0 && now - openedAt < PRESS_GUARD_MS
}

/** How long the list stays in use after the person's last press, key, click or pointer move on it. */
export const FOLD_QUIET_MS = 1000

/** The person's latest run of input on the list: when it began, and its last input. A gap of FOLD_QUIET_MS ends a run. */
export type ListInput = { since: number; last: number }

/** `input` with one more input at `at`. */
export function withListInput(input: ListInput | null, at: number): ListInput {
  const isSameRun = input !== null && at - input.last < FOLD_QUIET_MS

  return isSameRun ? { since: input.since, last: Math.max(at, input.last) } : { since: at, last: at }
}

/** Whether the person has been using the list without a break since `at`, so a row due then waits to fold. */
export function isListInUseSince(input: ListInput | null, at: number, now: number): boolean {
  return input !== null && now - input.last < FOLD_QUIET_MS && input.since <= at
}

/**
 * What a look holds in place besides the session: the rows replies hold, the rows closed while it shows them, and the
 * person's input on the list, which keeps due rows from folding under it.
 */
export type Holds = Pick<ViewInput, 'replies' | 'discarded' | 'shownSince' | 'listInput' | 'undoShown'>

export const NO_HOLDS: Holds = { replies: {}, discarded: {}, shownSince: null, listInput: null }

/**
 * Whether the look has shown its tab since `at`. Every row that closed or was pressed since then can still be drawn in
 * place, as `isSettledInPlace` says, so a prune keeps its record.
 */
export function isShownSince(at: number, shownSince: number | null): boolean {
  return shownSince !== null && at >= shownSince
}

/**
 * When a settled row comes due to fold: `settleWindowMs` after it settled, or sooner, at a message the person typed
 * after it once Undo no longer lasts. A message typed later never moves it, so a hold that began after the row folded
 * cannot bring it back.
 */
function foldDueAt(
  state: Pick<SettledState, 'at' | 'canUndo'>,
  lastTypedMessageAt: number | null,
  settleWindowMs: number,
): number {
  const windowEndsAt = state.at + settleWindowMs
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at

  return isTypedSince && !state.canUndo ? Math.min(lastTypedMessageAt, windowEndsAt) : windowEndsAt
}

/** Whether a press still under way, begun at `pressOutSince`, had begun by `at`, so a row due then waits for it to end. */
export function isPressOutSince(pressOutSince: number | null, at: number): boolean {
  return pressOutSince !== null && pressOutSince <= at
}

/** The earliest of `times`, or null when none is known. */
export function earliestOf(times: (number | null)[]): number | null {
  const known = times.filter((t): t is number => t !== null)

  return known.length > 0 ? Math.min(...known) : null
}

/**
 * What places a settled row: the look's showing and the person's input from the view's input, and when the oldest press
 * still under way on a row of the row's tab began, which `inboxView` works out, or null while none is.
 */
export type Placing = Pick<
  ViewInput,
  'shownSince' | 'lastTypedMessageAt' | 'listInput' | 'now' | 'settleWindowMs' | 'undoShown'
> & { pressOutSince: number | null }

/**
 * Whether a row's message is still on its way to the agent: held for Undo, or sent and not yet taken. Every look and
 * the view read this one test. A held message counts from its press until its host records the send, so the row keeps
 * its place through the moment Undo ends, when a redraw can come before the release. A row whose message was refused
 * or could not be confirmed is not on its way: it folds once Undo ends, and its Closed line shows what happened.
 */
export function isSendOnItsWay(delivery: ClosedDelivery): boolean {
  return delivery === 'held' || delivery === 'sending' || delivery === 'queued'
}

/**
 * Whether a settled row stays in place, with its result. It stays while the look shows the tab it settled on, until it
 * comes due by `foldDueAt`, and folds into its group's Closed fold then. A due row waits while its message is on its way,
 * while a press begun before it came due is still out on a row of its tab, and while the person has been using the list
 * since before then, until they stop for FOLD_QUIET_MS, so nothing moves under a press. A hold keeps only a row that has
 * not folded yet: a press or input that begins after the row came due leaves it folded. A row whose Undo the look still
 * shows, named by `id` in `undoShown`, stays too. Leaving the tab, by switching tab or closing the inbox, folds it at once.
 */
export function isSettledInPlace(
  state: Pick<SettledState, 'at' | 'canUndo' | 'delivery'>,
  { shownSince, lastTypedMessageAt, listInput, now, settleWindowMs, undoShown, pressOutSince }: Placing,
  id?: string,
): boolean {
  const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs)
  const isUndoShown = id !== undefined && (undoShown ?? []).includes(id)
  const isWaiting =
    now < dueAt ||
    isUndoShown ||
    isSendOnItsWay(state.delivery) ||
    isPressOutSince(pressOutSince, dueAt) ||
    isListInUseSince(listInput, dueAt, now)

  return isShownSince(state.at, shownSince) && isWaiting
}

/**
 * When the next of `settled` can fold, so a look redraws then: a row's due time, or the end of the person's use of the
 * list. A row that waits on its message or on a press folds when that changes, which redraws anyway. Null when no
 * fold comes due on the clock.
 */
export function nextFoldAt(
  settled: Pick<SettledState, 'at' | 'canUndo' | 'delivery'>[],
  {
    lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
  }: Pick<Placing, 'lastTypedMessageAt' | 'listInput' | 'now' | 'settleWindowMs'>,
): number | null {
  const times = settled.flatMap(state => {
    const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs)
    if (dueAt > now) return [dueAt]
    const quietAt = listInput === null ? null : listInput.last + FOLD_QUIET_MS
    const isQuietLater = quietAt !== null && quietAt > now

    return !isSendOnItsWay(state.delivery) && isQuietLater ? [quietAt] : []
  })

  return times.length > 0 ? Math.min(...times) : null
}

/**
 * Whether a look drawing from a view it read before switching tabs still draws `row`. The view it reads next leaves a
 * settled row out once the look shows its tab from after the row settled, so the row folds without being drawn first.
 */
export function isDrawnInPlace(row: Pick<RowView, 'state'>, shownSince: number | null): boolean {
  return row.state.is !== 'settled' || isShownSince(row.state.at, shownSince)
}

/** The discards a look keeps: a discard keeps its row folded for as long as the row could stay in place. */
export function keptDiscards(discarded: Record<string, number>, shownSince: number | null): Record<string, number> {
  return Object.fromEntries(Object.entries(discarded).filter(([, at]) => isShownSince(at, shownSince)))
}

/** The row whose field is open and each row whose draft holds words. Opening a field gives its row a draft. */
export function heldReplies(typing: string | null, drafts: Record<string, Draft>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(drafts).flatMap(([id, d]) => (id === typing || d.text.trim() !== '' ? [[id, d.since]] : [])),
  )
}

export function isUndoLeft(at: number, now: number, settleWindowMs: number): boolean {
  return now - at < settleWindowMs
}

/** Whether Undo can still take back a close made at `at`. */
export function canUndoClose(
  closed: Pick<Closed, 'how' | 'isSentToAgent'>,
  at: number,
  now: number,
  settleWindowMs: number,
): boolean {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs)
}

export const RUNNING_FRAME_MS = 300

/** One pulse of a running mark, which the Codex tab and the desktop pane draw as a fade. */
export const RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS

export function hasRunningMark(page: StatusPage): boolean {
  return statusListRows(page).some(r => (r.kind === 'subject' || r.kind === 'child') && r.isRunning)
}

/** A running row's mark at `now`. Every mark on a page takes its frame from the clock, so all of them move together. */
export function runningMark(now: number): string {
  return RUNNING_FRAMES[Math.floor(now / RUNNING_FRAME_MS) % RUNNING_FRAMES.length]!
}

/** A result mark's glyph in the text looks at `now`. A blank mark keeps its place, so the result stays put when its mark arrives. */
export function resultGlyph(mark: ResultMark, now: number): string {
  return mark.isRunning ? runningMark(now) : textMark(mark.text) || ' '
}
