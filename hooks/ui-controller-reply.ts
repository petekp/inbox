import { drawnLists, latestUndo, tabUndos } from './action-plan'
import { prRowIds } from './arrivals'
import { pressRowId, isPrPress, type PrPress } from './pr-press'
import { prMarkId } from './pr-rows'
import { actionId } from './press-labels'
import { isPressConfirmed, noteText } from './press-reducer'
import type { RowPress } from './presses'
import { allRows } from './rows'
import type { SessionView } from './session-view'
import { PRESS_TIMEOUT_MS } from './session-view'
import { isRowTab } from './tabs'
import { heldReplies, keptDiscards, SETTLED_MS, type Holds } from './timing'
import { isGuardedPress, selectedOf, selectRestored, tabWaits, withCursor } from './ui-controller-selection'
import {
  DEMO_REPLY_MS,
  type InputKind,
  type PressOut,
  type SettledOutcome,
  type UiState,
  type UiStep,
  withCommands,
} from './ui-controller-types'

/** The holds the host passes to `sessionView` and with a press. */
export function holdsOf(ui: UiState, now: number): Holds {
  const undoOut = Object.values(ui.pressesOut).flatMap(p =>
    p.action === 'undo' || p.action === 'pr-undo' ? [p.rowId] : [],
  )
  const undoShown =
    ui.config.undoClock === 'first-read'
      ? Object.entries(ui.undoSeen).flatMap(([id, at]) => (at + SETTLED_MS > now ? [id] : []))
      : undefined

  return {
    replies: heldReplies(ui.typing, ui.drafts),
    discarded: keptDiscards(ui.discarded, ui.shownSince),
    shownSince: ui.shownSince,
    listInput: ui.listInput,
    ...(undoShown === undefined ? {} : { undoShown }),
    undoOut,
  }
}

const isListed = (view: SessionView, id: string) =>
  allRows(view).some(r => r.id === id) || prRowIds(view.prs.drawn).includes(id)

/** Opens row `id`'s field with its draft, or a seed, and holds the row. */
export function openField(ui: UiState, view: SessionView, id: string, seed: string | undefined, now: number): UiStep {
  const draft = seed !== undefined ? { text: seed, since: now } : (ui.drafts[id] ?? { text: '', since: now })
  let next: UiState = { ...ui, typing: id, drafts: { ...ui.drafts, [id]: draft } }
  const tab = ui.tab
  if (isRowTab(tab) && ui.selection[tab].id === null && selectedOf(ui, view, tab) === id)
    next = withCursor(next, tab, { id, index: tabWaits(ui, view, tab).findIndex(r => r.id === id), guard: null })

  return withCommands(next, { kind: 'focus-field', id })
}

export function editDraft(ui: UiState, id: string, text: string, now: number): UiState {
  return { ...ui, drafts: { ...ui.drafts, [id]: { text, since: ui.drafts[id]?.since ?? now } } }
}

export function closeField(ui: UiState, view: SessionView, id: string, isDiscard: boolean, now: number): UiStep {
  const typing = ui.typing === id ? null : ui.typing
  if (!isDiscard) return withCommands(releasedDrafts({ ...ui, typing }, view))
  const { [id]: _draft, ...drafts } = ui.drafts
  const { [id]: _sent, ...sentReplies } = ui.sentReplies
  const discarded = { ...keptDiscards(ui.discarded, ui.shownSince), [id]: now }

  return withCommands({ ...ui, typing, drafts, sentReplies, discarded })
}

const isUndoPress = (p: RowPress | PrPress) => p.action === 'undo' || p.action === 'pr-undo'

/**
 * Sends a press, unless it repeats an action still out on its row, falls in the guard of the input that opened the
 * row, or is a reply with no words. A reply repeats only when a reply is out on its row and its words match the
 * row's latest sent reply. A reply's field closes and its draft stays, holding its row, until the reply arrives.
 */
export function press(ui: UiState, view: SessionView, p: RowPress | PrPress, by: InputKind, now: number): UiStep {
  const rowId = pressRowId(p)
  const action = actionId(p)
  const isReply = p.action === 'type'
  const isOtherReply = isReply && ui.sentReplies[rowId]?.text !== p.text.trim()
  const isRepeat = !isOtherReply && Object.values(ui.pressesOut).some(o => o.rowId === rowId && o.action === action)
  const isBlank = isReply && p.text.trim() === ''
  if (isRepeat || isBlank || isGuardedPress(ui, ui.tab, rowId, by, now)) return withCommands(ui)
  const holds = holdsOf(ui, now)
  const pressId = ui.nextPressId
  const out: PressOut = { pressId, rowId, tab: ui.tab, action, isReply, at: now, by }
  const { [rowId]: _error, ...errors } = ui.errors
  const { [rowId]: _note, ...notes } = ui.notes
  let next: UiState = {
    ...ui,
    nextPressId: pressId + 1,
    pressesOut: { ...ui.pressesOut, [pressId]: out },
    errors,
    notes,
  }
  if (isReply) {
    const text = p.text.trim()
    const sent = { pressId, text, atBefore: view.lastActions[rowId]?.at ?? null, isConfirmed: false }
    next = {
      ...next,
      typing: next.typing === rowId ? null : next.typing,
      drafts: { ...next.drafts, [rowId]: { text: p.text, since: next.drafts[rowId]?.since ?? now } },
      sentReplies: { ...next.sentReplies, [rowId]: sent },
    }
  }
  const tab = ui.tab
  const isPinning = !isUndoPress(p) && !isPrPress(p)
  if (isPinning && isRowTab(tab) && ui.selection[tab].id === null) {
    const index = tabWaits(ui, view, tab).findIndex(r => r.id === rowId)
    if (index >= 0) next = withCursor(next, tab, { id: rowId, index, guard: null })
  }

  return withCommands(next, { kind: 'press', pressId, press: p, holds })
}

/** When row or PR `id` closed, by the session's clock, or null when the view draws it unsettled or not at all. */
function settledAt(view: SessionView, id: string): number | null {
  const row = allRows(view).find(r => r.id === id)?.state
  const pr = view.prs.drawn.find(d => prMarkId(d.pr.ref) === id)?.state
  const state = row ?? pr

  return state?.is === 'settled' ? state.at : null
}

/** Whether settled row `id` still offers its Undo, by the look's Undo clock. */
function isUndoShown(ui: UiState, view: SessionView, id: string, now: number): boolean {
  const at = ui.config.undoClock === 'first-read' ? (ui.undoSeen[id] ?? null) : settledAt(view, id)

  return at !== null && now < at + SETTLED_MS
}

/** The undo key: the shown tab's Undo whose row closed last. */
export function undoKey(ui: UiState, view: SessionView, now: number): UiStep {
  if (!isRowTab(ui.tab)) return withCommands(ui)
  const lists = drawnLists(
    view,
    () => true,
    r => r,
  )
  const isStillShown = (id: string) => ui.config.undoClock === 'session' || isUndoShown(ui, view, id, now)
  const undos = tabUndos(ui.tab, lists, view.prs.drawn).filter(u => isStillShown(pressRowId(u.press)))
  const latest = latestUndo(undos)

  return latest === null ? withCommands(ui) : press(ui, view, latest.press, 'key', now)
}

/**
 * Whether the person has not moved since `out`: the same tab shows, no field is open, and no input or press of theirs
 * came after it, even within the same millisecond. A cursor the controller moved meanwhile, as when the host saved the
 * reply's row as answered, does not count.
 */
function hasNotMoved(ui: UiState, out: PressOut): boolean {
  const isQuiet = ui.listInput === null || ui.listInput.last <= out.at
  const isLastPress = ui.nextPressId === out.pressId + 1

  return ui.tab === out.tab && ui.typing === null && isQuiet && isLastPress
}

const isNotSentShown = (view: SessionView, id: string) =>
  allRows(view).find(r => r.id === id)?.feedback?.is === 'notSent'

/** What a press's answer does: notes, errors, a reopened field, Undo's restored row, the demo's reply. */
export function pressSettled(
  ui: UiState,
  view: SessionView,
  pressId: number,
  outcome: SettledOutcome,
  now: number,
): UiStep {
  const out = ui.pressesOut[pressId]
  if (out === undefined) return withCommands(ui)
  const { [pressId]: _out, ...pressesOut } = ui.pressesOut
  let next: UiState = { ...ui, pressesOut }
  const row = out.rowId
  const isUndo = out.action === 'undo' || out.action === 'pr-undo'
  const hasUndoTimeEnded = isUndo && !isUndoShown(ui, view, row, now)
  const isRowListed = isListed(view, row) && !hasUndoTimeEnded
  if (outcome.note === 'stale')
    next = isRowListed
      ? { ...next, notes: { ...next.notes, [row]: { note: 'stale', at: now } } }
      : { ...next, notice: { text: noteText(), at: now, isError: false } }
  if (outcome.error !== null && !isNotSentShown(view, row))
    next = isRowListed
      ? { ...next, errors: { ...next.errors, [row]: { text: outcome.error, at: now } } }
      : { ...next, notice: { text: outcome.error, at: now, isError: true } }
  const isConfirmed = isPressConfirmed(outcome)
  const sent = next.sentReplies[row]
  if (sent?.pressId === pressId) {
    const isRefused = outcome.error !== null || outcome.note !== null
    const { [row]: _sent, ...rest } = next.sentReplies
    next = { ...next, sentReplies: isRefused ? rest : { ...rest, [row]: { ...sent, isConfirmed } } }
  }
  if (out.action === 'undo' && isConfirmed) next = { ...next, restoring: { id: row, at: now, by: out.by } }
  const restored = selectRestored(next, view, now)
  next = restored.ui
  if (outcome.isDemoSent)
    next = { ...next, demoReplies: [...next.demoReplies, { pressId, dueAt: now + DEMO_REPLY_MS }] }
  const isReplyBack = out.isReply && (outcome.error !== null || outcome.note === 'stale')
  if (!(isReplyBack || outcome.isRowFailed) || !hasNotMoved(next, out)) return withCommands(next, ...restored.commands)
  const index = isRowTab(out.tab) ? tabWaits(next, view, out.tab).findIndex(r => r.id === row) : -1
  const back = isRowTab(out.tab) ? withCursor(next, out.tab, { id: row, index, guard: null }) : next

  return isReplyBack
    ? withCommands({ ...back, typing: row }, ...restored.commands, { kind: 'focus-field', id: row })
    : withCommands(back, ...restored.commands)
}

/** Whether press `out` still waits on its row's message, which a host holds or queues until the agent takes it. */
function isWaitingOnDelivery(view: SessionView, out: PressOut): boolean {
  const state = view.lastActions[out.rowId]?.delivery?.state

  return state === 'held' || state === 'queued'
}

/** When each press out that has no message under way gives up. */
export function pressEndsAt(ui: UiState, view: SessionView): number[] {
  return Object.values(ui.pressesOut).flatMap(o => (isWaitingOnDelivery(view, o) ? [] : [o.at + PRESS_TIMEOUT_MS]))
}

/** Presses that got no answer by `PRESS_TIMEOUT_MS`, with no message under way, end as not confirmed. */
export function expirePresses(ui: UiState, view: SessionView, now: number): UiState {
  const isEnded = (o: PressOut) => now >= o.at + PRESS_TIMEOUT_MS && !isWaitingOnDelivery(view, o)
  const ended = Object.values(ui.pressesOut).filter(isEnded)
  if (ended.length === 0) return ui
  const pressesOut = Object.fromEntries(Object.entries(ui.pressesOut).filter(([, o]) => !isEnded(o)))

  return { ...ui, pressesOut }
}

type SentFate = 'wait' | 'release' | 'keep'

/** What the view says about a sent reply: still on its way, arrived, or refused, so its words stay. */
function sentFate(ui: UiState, view: SessionView, row: string): SentFate {
  const sent = ui.sentReplies[row]
  if (sent === undefined) return 'keep'
  const last = view.lastActions[row]
  const isOut = Object.values(ui.pressesOut).some(o => o.pressId === sent.pressId)
  if (last === undefined) return sent.atBefore === null && isOut ? 'wait' : sent.isConfirmed ? 'release' : 'keep'
  if (last.at === sent.atBefore) return isOut ? 'wait' : 'keep'
  if (last.reply?.trim() !== sent.text) return isOut ? 'wait' : 'keep'
  const state = last.delivery?.state
  if (state === 'held' || state === 'queued') return 'wait'

  return state === 'failed' || state === 'unconfirmed' ? 'keep' : 'release'
}

/** Deletes each sent reply's draft once the view shows it arrived, unedited, with its field closed. */
export function releasedDrafts(ui: UiState, view: SessionView): UiState {
  let next = ui
  for (const row of Object.keys(ui.sentReplies)) {
    const fate = sentFate(next, view, row)
    if (fate === 'wait' || (fate === 'release' && next.typing === row)) continue
    const isSentDraft = fate === 'release' && next.drafts[row]?.text.trim() === next.sentReplies[row]?.text
    const { [row]: _sent, ...sentReplies } = next.sentReplies
    const { [row]: _draft, ...without } = next.drafts
    next = { ...next, sentReplies, drafts: isSentDraft ? without : next.drafts }
  }

  return next
}
