import type { SessionView } from './session-view'
import { isRowTab } from './tabs'
import { SETTLED_MS, withListInput } from './timing'
import { dueDemoReplies, expired, nextWakeAt, seenSettled } from './ui-controller-clock'
import {
  closeField,
  editDraft,
  expirePresses,
  openField,
  press,
  pressSettled,
  releasedDrafts,
  undoKey,
} from './ui-controller-reply'
import {
  collapseRow,
  foldAll,
  readCursors,
  selectedOf,
  selectRestored,
  selectRow,
  setFold,
  settleHeldClose,
  stepSelection,
  tabWaits,
  titlePress,
  withCursor,
} from './ui-controller-selection'
import { closed, follow, hasHeldArrivals, opened, readTabs, recordTabs, shownTab, visible } from './ui-controller-tabs'
import {
  chain,
  freshUi,
  MAX_KEPT_UI,
  type UiCommand,
  type UiEvent,
  type UiState,
  type UiStep,
  withCommands,
} from './ui-controller-types'
import type { RowNote } from '../types'

const PERSON_EVENTS = new Set<UiEvent['type']>([
  'show-tab',
  'show-help',
  'show-ask',
  'select',
  'step',
  'title-press',
  'collapse',
  'fold',
  'status-fold',
  'earlier',
  'show-options',
  'fold-all',
  'open-field',
  'edit-draft',
  'close-field',
  'press',
  'undo-key',
  'list-input',
])

const addOnce = <T>(list: readonly T[], x: T): T[] => (list.includes(x) ? [...list] : [...list, x])

/** The demo switched on or off: the look starts over as it opens, and keeps drafts, discards and folds. */
function resetUi(ui: UiState, now: number): UiState {
  const fresh = freshUi(ui.config, ui.tab)

  return {
    ...fresh,
    host: ui.host,
    isVisible: ui.isVisible,
    shownSince: ui.shownSince === null ? null : now,
    isOpening: ui.shownSince !== null,
    nextPressId: ui.nextPressId,
    drafts: ui.drafts,
    discarded: ui.discarded,
    unfolded: ui.unfolded,
    closedAll: ui.closedAll,
    statusUnfolded: ui.statusUnfolded,
    optionsShown: ui.optionsShown,
  }
}

/** The state to go on from after a reload or a page swap. No press's answer or timer survives one. */
export function restoredUi(ui: UiState): UiState {
  return {
    ...ui,
    pressesOut: {},
    demoReplies: [],
    heldArrivals: {},
    heldClose: null,
    isOpening: false,
    opensOnAsks: false,
  }
}

function read(ui: UiState, view: SessionView, host: UiState['host'], now: number): UiStep {
  const recorded = recordTabs(ui, view, host, now)
  const settled = expired(releasedDrafts(expirePresses(recorded.ui, view, now), view), view, now)
  const start = { ...settled, undoSeen: seenSettled(settled, view, now) }

  return chain(
    withCommands(start),
    next => readCursors(next, view, recorded.added, now),
    next => readTabs(next, view, recorded.added, now),
    next => selectRestored(next, view),
  )
}

function tick(ui: UiState, view: SessionView, now: number): UiStep {
  const start = expired(expirePresses(ui, view, now), view, now)

  return chain(
    withCommands(start),
    next => settleHeldClose(next, view, now),
    next => (hasHeldArrivals(next) ? follow(next, view, {}, now) : withCommands(next)),
    next => dueDemoReplies(next, now),
  )
}

function showAsk(ui: UiState, view: SessionView, id: string, by: 'click' | 'key', now: number): UiStep {
  const shown = shownTab(ui, 'needsYou', now)
  const index = tabWaits(shown, view, 'needsYou').findIndex(r => r.id === id)
  const selected = withCursor(shown, 'needsYou', { id, index, guard: { by, at: now } })
  const commands: UiCommand[] = [
    { kind: 'tab-shown', tab: 'needsYou' },
    { kind: 'reveal', tab: 'needsYou', id, closedId: null },
  ]

  return withCommands(selected, ...commands)
}

function step(ui: UiState, view: SessionView, by: 1 | -1, ids: string[], now: number): UiStep {
  const next = stepSelection(ui, view, by, ids, now)
  const id = selectedOf(next, view, next.tab)
  const tab = next.tab

  return isRowTab(tab) && id !== null
    ? withCommands(next, { kind: 'reveal', tab, id, closedId: null })
    : withCommands(next)
}

function handle(ui: UiState, view: SessionView, e: UiEvent, now: number): UiStep {
  switch (e.type) {
    case 'opened':
      return withCommands(opened(ui, now))
    case 'closed':
      return withCommands(closed(ui))
    case 'reset':
      return withCommands(resetUi(ui, now))
    case 'read':
      return read(ui, view, e.host, now)
    case 'visible':
      return withCommands(visible(ui, e.isVisible))
    case 'show-tab':
      return withCommands(shownTab(ui, e.tab, now), { kind: 'tab-shown', tab: e.tab })
    case 'show-help':
      return withCommands({ ...ui, isHelpShown: e.isShown })
    case 'show-ask':
      return showAsk(ui, view, e.id, e.by, now)
    case 'select':
      return withCommands(selectRow(ui, view, e.tab, e.id, e.by, now))
    case 'step':
      return step(ui, view, e.by, e.ids, now)
    case 'title-press':
      return titlePress(ui, view, e.id, e.by, now)
    case 'collapse':
      return collapseRow(ui, view, e.id, e.isCollapsed, now)
    case 'fold':
      return withCommands(setFold(ui, e.fold, e.isOpen))
    case 'status-fold':
      return withCommands({
        ...ui,
        statusUnfolded: e.isOpen ? addOnce(ui.statusUnfolded, e.id) : ui.statusUnfolded.filter(id => id !== e.id),
      })
    case 'earlier':
      return withCommands({ ...ui, closedAll: addOnce(ui.closedAll, e.fold) })
    case 'show-options':
      return withCommands({ ...ui, optionsShown: addOnce(ui.optionsShown, e.id) })
    case 'fold-all':
      return foldAll(ui, view, e.isOpening, now)
    case 'open-field':
      return openField(ui, view, e.id, e.seed, now)
    case 'edit-draft':
      return withCommands(editDraft(ui, e.id, e.text, now))
    case 'close-field':
      return closeField(ui, view, e.id, e.isDiscard, now)
    case 'press':
      return press(ui, view, e.press, e.by, now)
    case 'undo-key':
      return undoKey(ui, view, now)
    case 'press-settled':
      return pressSettled(ui, view, e.pressId, e.outcome, now)
    case 'list-input':
      return withCommands(ui)
    case 'tick':
      return tick(ui, view, now)
  }
}

/**
 * The look's interaction state after `event`, the commands the host runs for it, and when to send the next `tick`. The
 * host builds `view` at `now` with `holdsOf(ui, now)` and `notesOf(ui)` before every event.
 */
export function reduceUi(
  ui: UiState,
  view: SessionView,
  event: UiEvent,
  now: number,
): UiStep & { nextWakeAt: number | null } {
  const noted = PERSON_EVENTS.has(event.type) ? { ...ui, listInput: withListInput(ui.listInput, now) } : ui
  const result = handle(noted, view, event, now)

  return { ...result, nextWakeAt: nextWakeAt(result.ui, view, now) }
}

export const notesOf = (ui: UiState): Record<string, RowNote> => ui.notes

/** A refused press's text on row `id`, while it shows. */
export function rowErrorOf(ui: UiState, id: string, now: number): string | null {
  const error = ui.errors[id]

  return error !== undefined && now < error.at + SETTLED_MS ? error.text : null
}

/** The line under the tabs for a press whose row is gone, while it shows. */
export function noticeOf(ui: UiState, now: number): UiState['notice'] {
  return ui.notice !== null && now < ui.notice.at + SETTLED_MS ? ui.notice : null
}

/**
 * The other sessions' states a host keeps: those holding a draft or a sent reply, the most recently shown first, at
 * most `MAX_KEPT_UI`. The session shown is always kept.
 */
export function keptUiStates(
  states: Record<string, { ui: UiState; shownAt: number }>,
  shownId: string | null,
): Record<string, { ui: UiState; shownAt: number }> {
  const isWorthKeeping = (ui: UiState) => Object.keys(ui.drafts).length > 0 || Object.keys(ui.sentReplies).length > 0
  const others = Object.entries(states)
    .filter(([id, s]) => id !== shownId && isWorthKeeping(s.ui))
    .sort(([, a], [, b]) => b.shownAt - a.shownAt)
    .slice(0, MAX_KEPT_UI)
  const shown = shownId !== null && states[shownId] ? [[shownId, states[shownId]] as const] : []

  return Object.fromEntries([...shown, ...others])
}
