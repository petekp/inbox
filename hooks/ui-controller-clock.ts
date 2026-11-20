import { NEW_FADE_MS, NEW_HOLD_MS, NEW_STEPS, titleTintEndsAt } from './arrivals'
import { prMarkId } from './pr-rows'
import { allRows, type SettledState } from './rows'
import { PRESS_TIMEOUT_MS, showsRunningMark, type SessionView } from './session-view'
import { isRowTab } from './tabs'
import {
  earliestOf,
  FOLD_QUIET_MS,
  isSendOnItsWay,
  nextFoldAt,
  PRESS_GUARD_MS,
  QUEUED_AFTER_MS,
  queuedSentAt,
  RUNNING_FRAME_MS,
  SETTLED_MS,
  timedChangeAt,
} from './timing'
import { pressEndsAt } from './ui-controller-reply'
import { hasHeldArrivals, newRowsOf } from './ui-controller-tabs'
import { COLLAPSE_WAIT_MS, type UiCommand, type UiState, type UiStep, withCommands } from './ui-controller-types'

/** Each settled row and PR the view still draws, by the id its Undo clock is kept under. */
function settledStates(view: SessionView): { id: string; state: SettledState }[] {
  const rows = allRows(view).flatMap(r => (r.state.is === 'settled' ? [{ id: r.id, state: r.state }] : []))
  const prs = view.prs.drawn.flatMap(d =>
    d.state.is === 'settled' ? [{ id: prMarkId(d.pr.ref), state: d.state }] : [],
  )

  return [...rows, ...prs]
}

/** For the first-read Undo clock: when the look first read each settled row or PR it still draws. */
export function seenSettled(ui: UiState, view: SessionView, now: number): Record<string, number> {
  if (ui.config.undoClock !== 'first-read') return {}

  return Object.fromEntries(settledStates(view).map(({ id }) => [id, ui.undoSeen[id] ?? now]))
}

const nextBoundary = (now: number, step: number) => (Math.floor(now / step) + 1) * step

/** The next step of a title tint drawn in steps, or its end for a look that draws it once. */
function tintWakeAt(ui: UiState, view: SessionView, now: number): number | null {
  if (ui.config.titleTint === 'self') return null
  const seen = new Map(Object.entries(ui.closedSeen))
  const endsAt = titleTintEndsAt(newRowsOf(ui), view, seen, now)
  if (ui.config.titleTint === 'end' || endsAt === null) return endsAt
  const step = NEW_FADE_MS / NEW_STEPS
  const starts = [...Object.values(ui.newRows).flatMap(r => (r.shownAt === null ? [] : [r.shownAt])), ...seen.values()]
  const steps = starts.flatMap(at =>
    Array.from({ length: NEW_STEPS + 1 }, (_, k) => at + NEW_HOLD_MS + k * step).filter(t => t > now),
  )

  return earliestOf([...steps, endsAt])
}

/** When the next running-mark frame is due, for a look that draws the marks as text frames. */
function frameWakeAt(ui: UiState, view: SessionView, now: number): number | null {
  if (ui.config.runningMarks !== 'frames' || ui.shownSince === null) return null
  const isRunning = showsRunningMark(view, ui.tab, ui.isHelpShown, kind => ui.unfolded.includes(kind))

  return isRunning ? nextBoundary(now, RUNNING_FRAME_MS) : null
}

/** When something drawn changes on the clock alone, or the controller has work due, after `now`. Null when nothing is. */
export function nextWakeAt(ui: UiState, view: SessionView, now: number): number | null {
  const lasts = Object.values(view.lastActions)
  const settled = settledStates(view)
  const isFirstRead = ui.config.undoClock === 'first-read'
  const cursor = isRowTab(ui.tab) ? ui.selection[ui.tab] : null
  const isHolding = hasHeldArrivals(ui) || ui.heldClose !== null
  const times: (number | null)[] = [
    ...lasts.flatMap(l => (l.delivery?.state === 'queued' ? [queuedSentAt(l) + QUEUED_AFTER_MS] : [])),
    ...lasts.flatMap(l =>
      l.result === undefined ? [] : [l.result.at + (l.result.state === 'pending' ? PRESS_TIMEOUT_MS : SETTLED_MS)],
    ),
    ...pressEndsAt(ui, view),
    ...settled.flatMap(({ id, state }) =>
      state.canUndo ? [isFirstRead ? (ui.undoSeen[id] ?? now) + SETTLED_MS : state.at + SETTLED_MS] : [],
    ),
    ...settled.flatMap(({ state }) =>
      state.canUndo && isSendOnItsWay(state.delivery) ? [state.at + SETTLED_MS + QUEUED_AFTER_MS] : [],
    ),
    nextFoldAt(
      settled.map(s => s.state),
      { lastTypedMessageAt: ui.host.lastTypedMessageAt, listInput: ui.listInput, now, settleWindowMs: SETTLED_MS },
    ),
    timedChangeAt(view.lastActions, now),
    isHolding && ui.listInput !== null ? ui.listInput.last + FOLD_QUIET_MS : null,
    cursor?.guard ? cursor.guard.at + PRESS_GUARD_MS : null,
    ...Object.values(ui.notes).map(n => n.at + SETTLED_MS),
    ...Object.values(ui.errors).map(e => e.at + SETTLED_MS),
    ui.notice === null ? null : ui.notice.at + SETTLED_MS,
    ui.restoring === null ? null : ui.restoring.at + SETTLED_MS,
    ...Object.values(ui.collapses).map(c => c.at + COLLAPSE_WAIT_MS),
    frameWakeAt(ui, view, now),
    ui.shownSince === null ? null : tintWakeAt(ui, view, now),
    ...ui.demoReplies.map(d => d.dueAt),
  ]

  return earliestOf(times.filter(t => t !== null && t > now))
}

const alive = <T extends { at: number }>(byId: Record<string, T>, ms: number, now: number) =>
  Object.fromEntries(Object.entries(byId).filter(([, x]) => now < x.at + ms))

/** Drops what has run its time: notes, errors, the notice, Undo's wait for its row, and collapses never shown. */
export function expired(ui: UiState, view: SessionView, now: number): UiState {
  const collapses = Object.fromEntries(
    Object.entries(ui.collapses).filter(
      ([id, c]) => now < c.at + COLLAPSE_WAIT_MS && view.collapsed.includes(id) !== c.isCollapsed,
    ),
  )

  return {
    ...ui,
    notes: alive(ui.notes, SETTLED_MS, now),
    errors: alive(ui.errors, SETTLED_MS, now),
    notice: ui.notice !== null && now < ui.notice.at + SETTLED_MS ? ui.notice : null,
    restoring: ui.restoring !== null && now < ui.restoring.at + SETTLED_MS ? ui.restoring : null,
    collapses,
  }
}

/** Sends the demo's replies that are due. */
export function dueDemoReplies(ui: UiState, now: number): UiStep {
  const due = ui.demoReplies.filter(d => d.dueAt <= now)
  const commands: UiCommand[] = due.map(d => ({ kind: 'demo-reply', pressId: d.pressId }))

  return withCommands({ ...ui, demoReplies: ui.demoReplies.filter(d => d.dueAt > now) }, ...commands)
}
