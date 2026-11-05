import type { LastAction, Draft, Closed } from '../types'
import { isUndoable } from './pressed'
import { RUNNING_FRAMES } from './help'
import { textMark } from './marks'
import type { SettledState, RowView, ResultMark } from './rows'
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
export type Holds = Pick<ViewInput, 'replies' | 'discarded' | 'shownSince' | 'listInput'>

export const NO_HOLDS: Holds = { replies: {}, discarded: {}, shownSince: null, listInput: null }

/**
 * Whether the look has shown its tab since `at`. Every row that closed or was pressed since then can still be drawn in
 * place, as `isSettledInPlace` says, so a prune keeps its record.
 */
export function isShownSince(at: number, shownSince: number | null): boolean {
  return shownSince !== null && at >= shownSince
}

/**
 * When a settled row comes due to fold: `settleWindowMs` after it settled, or at a message the person typed after it
 * once Undo no longer lasts.
 */
function foldDueAt(
  state: Pick<SettledState, 'at' | 'canUndo'>,
  lastTypedMessageAt: number | null,
  settleWindowMs: number,
): number {
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at

  return isTypedSince && !state.canUndo ? lastTypedMessageAt : state.at + settleWindowMs
}

export type Placing = Pick<ViewInput, 'shownSince' | 'lastTypedMessageAt' | 'listInput' | 'now' | 'settleWindowMs'>

/**
 * Whether what a settled row sent has yet to reach the agent: on its way, unconfirmed, or refused. The row waits in place
 * until it arrives or the person acts on it, since its result is not final.
 */
export function isSendPending(state: Pick<SettledState, 'delivery'>): boolean {
  return state.delivery !== null && state.delivery !== 'held'
}

/**
 * Whether a settled row stays in place, with its result. It stays while the look shows the tab it settled on, until it
 * comes due by `foldDueAt`, and folds into its group's Closed fold then. A row due while the person is using the list
 * waits until they stop for FOLD_QUIET_MS, so a row never moves under a press, and a row waits while its send is
 * pending. Leaving the tab, by switching tab or closing the inbox, folds it at once.
 */
export function isSettledInPlace(
  state: Pick<SettledState, 'at' | 'canUndo' | 'delivery'>,
  { shownSince, lastTypedMessageAt, listInput, now, settleWindowMs }: Placing,
): boolean {
  const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs)
  const isWaiting = now < dueAt || isSendPending(state) || isListInUseSince(listInput, dueAt, now)

  return isShownSince(state.at, shownSince) && isWaiting
}

/**
 * When the next of `settled` can fold, so a look redraws then: a row's due time, or the end of the person's use of the
 * list for a row that waits on it. A row whose send is pending folds once the send arrives, which redraws anyway.
 */
export function nextFoldAt(
  settled: Pick<SettledState, 'at' | 'canUndo' | 'delivery'>[],
  { lastTypedMessageAt, listInput, now, settleWindowMs }: Omit<Placing, 'shownSince'>,
): number | null {
  const times = settled.flatMap(state => {
    const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs)
    if (dueAt > now) return [dueAt]
    if (isSendPending(state) || listInput === null) return []

    return [listInput.last + FOLD_QUIET_MS]
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
