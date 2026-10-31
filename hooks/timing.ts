import type { LastAction, Draft, Closed } from '../types'
import { isUndoable } from './pressed'
import { RUNNING_FRAMES } from './help'
import type { SettledState, RowView, ResultMark } from './rows'
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
 * A send still on its way. For its first QUEUED_AFTER_MS a queued send reads as sending, so a send that the agent takes
 * at once never reads Queued. Neither reads as delivered, so neither draws a ✓.
 */
export function pendingDeliveryAt(
  last: LastAction | undefined,
  now: number,
): 'sending' | 'queued' | 'unconfirmed' | null {
  if (last?.delivery?.state === 'unconfirmed') return 'unconfirmed'
  if (last?.delivery?.state !== 'queued') return null
  return isQueuedAt(last, now) ? 'queued' : 'sending'
}

/** 0 means no click opened it, so nothing is guarded. */
export function isGuarded(openedAt: number, now: number): boolean {
  return openedAt > 0 && now - openedAt < PRESS_GUARD_MS
}

/** What a look holds in place besides the session: the rows replies hold, and the rows closed while it shows them. */
export type Holds = Pick<ViewInput, 'replies' | 'discarded' | 'shownSince'>

export const NO_HOLDS: Holds = { replies: {}, discarded: {}, shownSince: null }

/**
 * Whether the look has shown its tab since `at`. Every row that closed or was pressed since then can still be drawn in
 * place, as `isSettledInPlace` says, so a prune keeps its record.
 */
export function isShownSince(at: number, shownSince: number | null): boolean {
  return shownSince !== null && at >= shownSince
}

/**
 * Whether a settled row stays in place, with its result. It stays while the look shows the tab it settled on, until
 * the person sends a message they typed. While its Undo lasts, it stays through that message and folds when Undo ends.
 * Leaving the tab, by switching tab or closing the inbox, folds it at once.
 */
export function isSettledInPlace(
  state: Pick<SettledState, 'at' | 'canUndo'>,
  { shownSince, lastTypedMessageAt }: Pick<ViewInput, 'shownSince' | 'lastTypedMessageAt'>,
): boolean {
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at

  return isShownSince(state.at, shownSince) && (state.canUndo || !isTypedSince)
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
  return page.rows.some(r => (r.kind === 'subject' || r.kind === 'child') && r.isRunning)
}

/** A running row's mark at `now`. Every mark on a page takes its frame from the clock, so all of them move together. */
export function runningMark(now: number): string {
  return RUNNING_FRAMES[Math.floor(now / RUNNING_FRAME_MS) % RUNNING_FRAMES.length]!
}

/** A result mark's glyph in the text looks at `now`. A blank mark keeps its place, so the result stays put when its mark arrives. */
export function resultGlyph(mark: ResultMark, now: number): string {
  return mark.isRunning ? runningMark(now) : mark.text || ' '
}
