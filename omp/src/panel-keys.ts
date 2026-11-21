import { isPrPress } from '../../core/view/pr-press'
import { CLEAR_FINISHED_ID } from '../../core/view/pr-rows'
import { shownTabs, isRowTab } from '../../core/view/tabs'
import { firstWaiting, steppedIndex } from '../../core/view/action-plan'
import { COLLAPSE_KEY, FOLD_ALL_KEY, UNDO_KEY } from '../../core/view/help'
import { GOAL_KEYS_ID, statusKeyRows, statusSelected } from '../../core/view/status-keys'
import type { StatusKey, StatusKeyTarget } from '../../core/view/status-keys'
import { reduceUi } from '../../core/view/ui-controller'
import { collapsedOf, isGuardedPress } from '../../core/view/ui-controller-selection'
import type { UiCommand, UiEvent, UiState } from '../../core/view/ui-controller-types'
import { entriesOf } from './panel-entries'
import { focusOf, isSelectable, isShut, linesOf, pageFocus, waitsOf } from './panel-lines'
import type { Button, Line } from './panel-lines'
import { collapsedIn } from './panel-text'
import type { LocalPress, PanelScreen, PanelUi } from './panel'

type Local = Pick<PanelUi, 'focus' | 'resuming' | 'opened' | 'pageTop' | 'pageReveal'>

/** What one key does: controller events, then the panel's own fields, a press the panel runs itself, or a close. */
type KeyPlan = { events?: UiEvent[]; patch?: Partial<Local>; press?: LocalPress; close?: true }

export type KeyResult = {
  ui: PanelUi
  commands: UiCommand[]
  nextWakeAt: number | null
  press?: LocalPress
  close?: true
}

/** `screen` with the collapses the person made that the view does not show yet. */
export const withCollapses = (screen: PanelScreen, ui: UiState): PanelScreen => ({
  ...screen,
  view: { ...screen.view, collapsed: collapsedOf(ui, screen.view) },
})

const cursorOf = (ui: UiState): string | null => (isRowTab(ui.tab) ? ui.selection[ui.tab].id : ui.statusSelection)

/**
 * `shared`, the controller's state after an event, with the panel's fields from `before`. A button's focus and a
 * reopened row last while the cursor stays on their row. A tab that starts showing starts at its top.
 */
export function withShared(before: PanelUi, shared: UiState): PanelUi {
  const cursor = cursorOf(shared)
  const isTabChanged = shared.tab !== before.tab

  return {
    ...shared,
    focus: before.focus?.rowId === cursor && !isTabChanged ? before.focus : null,
    resuming: before.resuming,
    opened: before.opened === cursor && !isTabChanged ? before.opened : null,
    pageTop: isTabChanged ? 0 : before.pageTop,
    pageReveal: isTabChanged ? (isRowTab(shared.tab) ? null : true) : before.pageReveal,
  }
}

/** Runs `events` through the shared controller in order, each on the state the last one left. */
export function applyEvents(screen: PanelScreen, ui: PanelUi, events: UiEvent[], now: number): KeyResult {
  let shared: UiState = ui
  let commands: UiCommand[] = []
  let nextWakeAt: number | null = null
  for (const event of events) {
    const step = reduceUi(shared, screen.view, event, now)
    shared = step.ui
    commands = [...commands, ...step.commands]
    nextWakeAt = step.nextWakeAt
  }

  return { ui: withShared(ui, shared), commands, nextWakeAt }
}

/**
 * The line the shown row tab's cursor is on. A cursor on no row, or on a line it cannot land on, rests on the first
 * line that waits, which may be the stop or the install question, else the first line the cursor can land on. A row
 * the agent closed keeps the cursor while the person's keys hold the close.
 */
export function selectedLine(lines: Line[], ui: UiState): Line | null {
  if (!isRowTab(ui.tab)) return null
  const id = ui.selection[ui.tab].id
  const current = id === null ? undefined : lines.find(l => l.id === id)
  const isCloseHeld = current !== undefined && ui.heldClose[ui.tab] === current.id
  if (current && (isSelectable(current) || isCloseHeld)) return current
  const waiting = firstWaiting(waitsOf(lines))

  return lines.find(l => l.id === waiting) ?? lines.filter(isSelectable).find(l => l.id !== CLEAR_FINISHED_ID) ?? null
}

function activate(screen: PanelScreen, ui: PanelUi, line: Line, button: Button): KeyPlan {
  const { press } = button
  if (button.isOut) return {}
  if (press.action === 'all-options') {
    const index = line.buttons.findIndex(b => b.press === press)

    return { events: [{ type: 'show-options', id: press.id }], patch: { focus: { rowId: line.id, index } } }
  }
  if (press.action === 'resume') {
    const { stop } = screen
    const isSending = ui.resuming?.is === 'sending' && ui.resuming.stopAt === stop?.at
    if (!stop || isSending) return {}

    return { patch: { focus: null, resuming: { stopAt: stop.at, is: 'sending' } }, press }
  }
  if (press.action === 'herdr-ask') return { patch: { focus: null }, press }
  if (!isPrPress(press) && press.action === 'type')
    return { events: [{ type: 'open-field', id: line.id }], patch: { focus: null } }
  if (!isPrPress(press) && press.action === 'discard')
    return { events: [{ type: 'close-field', id: line.id, isDiscard: true }], patch: { focus: null } }

  return { events: [{ type: 'press', press, by: 'key' }], patch: { focus: null } }
}

function typingKey(ui: PanelUi, id: string, key: string, text: string | undefined): KeyPlan {
  const draft = ui.drafts[id]?.text ?? ''
  const edit = (next: string): KeyPlan => ({ events: [{ type: 'edit-draft', id, text: next }] })
  if (key === 'escape') return { events: [{ type: 'close-field', id, isDiscard: false }] }
  if (key === 'enter') return { events: [{ type: 'press', press: { action: 'type', id, text: draft }, by: 'key' }] }
  if (key === 'backspace') return edit([...draft].slice(0, -1).join(''))
  if (text !== undefined) return edit(draft + text.replace(/[\r\n]+/g, ' '))

  return {}
}

const isUpKey = (key: string) => key === 'up' || key === 'k'
const isStepKey = (key: string) => isUpKey(key) || key === 'down' || key === 'j'

function rowTabKey(screen: PanelScreen, ui: PanelUi, lines: Line[], selected: Line | null, key: string, now: number) {
  const tabLine = lines.find(l => l.isTabButtons && l.buttons.some(b => b.key === key))
  const tabButton = tabLine?.buttons.find(b => b.key === key)
  if (tabLine && tabButton) return activate(screen, ui, tabLine, tabButton)
  if (isStepKey(key)) {
    const ids = lines.filter(l => isSelectable(l) || l.id === selected?.id).map(l => l.id)
    return ids.length > 0 ? { events: [{ type: 'step', by: isUpKey(key) ? -1 : 1, ids } as UiEvent] } : {}
  }
  if (key === UNDO_KEY) return { events: [{ type: 'undo-key' } as UiEvent] }
  if (!selected) return {}
  if (key === COLLAPSE_KEY && !selected.isTabButtons && isSelectable(selected))
    return { events: [{ type: 'collapse', id: selected.id, isCollapsed: selected.isCollapsed !== true } as UiEvent] }
  if (selected.isCollapsed) return {}
  if (selected.fold && key === 'enter')
    return { events: [{ type: 'fold', fold: selected.fold, isOpen: !ui.unfolded.includes(selected.fold) } as UiEvent] }
  if (selected.earlierOf && key === 'enter')
    return { events: [{ type: 'earlier', fold: selected.earlierOf } as UiEvent] }
  if (isShut(selected, ui)) return key === 'enter' ? { patch: { opened: selected.id } } : {}
  if (selected.buttons.length === 0) return {}
  if (key === 'left' || key === 'right') {
    const index = steppedIndex(focusOf(selected, ui), key === 'left' ? -1 : 1, selected.buttons.length)
    return { patch: { focus: { rowId: selected.id, index } } }
  }
  const button = key === 'enter' ? selected.buttons[focusOf(selected, ui)] : selected.buttons.find(b => b.key === key)
  if (!button || isGuardedPress(ui, ui.tab, selected.id, 'key', now)) return {}

  return activate(screen, ui, selected, button)
}

function planKey(screen: PanelScreen, ui: PanelUi, lines: Line[], selected: Line | null, key: string, now: number) {
  const shown = shownTabs()
  const isTabKey = key === 'tab' || key === 'shift+tab' || shown.some(t => t.hotkey === key)
  if (key === '?' || (ui.isHelpShown && key === 'escape'))
    return {
      events: [{ type: 'show-help', isShown: key === '?' && !ui.isHelpShown } as UiEvent],
      patch: { pageTop: 0 },
    }
  if (key === 'escape') return { close: true } as KeyPlan
  const isPage = !isRowTab(ui.tab)
  if (isPage && !ui.isHelpShown) {
    const page = pageKey(screen, ui, key)
    if (page) return page
  }
  if (ui.isHelpShown && !isTabKey && !isStepKey(key)) return {}
  if ((ui.isHelpShown || isPage) && isStepKey(key))
    return { patch: { pageTop: Math.max(0, ui.pageTop + (isUpKey(key) ? -1 : 1)) } }
  const tabs = shown.map(t => t.id)
  const picked =
    key === 'tab' || key === 'shift+tab'
      ? tabs[steppedIndex(tabs.indexOf(ui.tab), key === 'tab' ? 1 : -1, tabs.length)]
      : shown.find(t => t.hotkey === key)?.id
  if (picked)
    return {
      events: [{ type: 'show-tab', tab: picked } as UiEvent],
      patch: { pageTop: 0, pageReveal: isRowTab(picked) ? null : (true as const) },
    }
  if (key === FOLD_ALL_KEY) return { events: [{ type: 'fold-all', isOpening: null } as UiEvent] }
  if (isPage) return {}
  const plan: KeyPlan = rowTabKey(screen, ui, lines, selected, key, now)
  // The drawn line becomes the cursor's row first, so the controller acts on the row the person sees.
  const isPinned = selected === null || selected.id === cursorOf(ui)
  const pin: UiEvent[] = isPinned ? [] : [{ type: 'select', tab: ui.tab, id: selected.id, by: 'key' }]

  return { ...plan, events: [...pin, ...(plan.events ?? [])] }
}

/**
 * Applies one key. `key` is the parsed key name, as pi-tui's `parseKey` gives it. `text` is the printable text the
 * key types, which only a reply field reads. A key that sends no event still counts as the person using the list.
 */
export function handleKey(screen: PanelScreen, ui: PanelUi, key: string, now: number, text?: string): KeyResult {
  const shown = withCollapses(screen, ui)
  const lines = linesOf(entriesOf(shown, ui, ui.tab, now))
  const plan: KeyPlan =
    ui.typing !== null
      ? typingKey(ui, ui.typing, key, text)
      : planKey(shown, ui, lines, selectedLine(lines, ui), key, now)
  const events = plan.events && plan.events.length > 0 ? plan.events : [{ type: 'list-input' } as UiEvent]
  const result = applyEvents(shown, ui, events, now)
  const local = plan.patch ?? {}

  return {
    ...result,
    ui: { ...result.ui, ...local },
    ...(plan.press ? { press: plan.press } : {}),
    ...(plan.close ? { close: true as const } : {}),
  }
}

/**
 * A key on the Status page, or null when the page leaves it to the panel. While a target has buttons, j and k move the
 * selection between those targets and up and down still scroll. Enter and the buttons' keys press the selected
 * target's. View shows Asks, a goal button that types opens the goal's field with its text, and the rest are presses.
 */
function pageKey(screen: PanelScreen, ui: PanelUi, key: string): KeyPlan | null {
  const page = screen.view.statusPage
  const isUnfolded = (id: string) => ui.statusUnfolded.includes(id)
  const isCollapsed = collapsedIn(screen.view)
  const rows = statusKeyRows(page, isUnfolded, isCollapsed)
  const row = statusSelected(page, ui.statusSelection, isUnfolded, isCollapsed)
  if (!row) return null
  const select = (id: string): UiEvent => ({ type: 'select', tab: 'overview', id, by: 'key' })
  if (key === 'j' || key === 'k') {
    const at = rows.findIndex(r => r.id === row.id)
    const to = rows[steppedIndex(at, key === 'k' ? -1 : 1, rows.length)]!.id

    return { events: [select(to)], patch: { focus: null, pageReveal: to } }
  }
  const keys = drawnKeys(row)
  const fold = row.keys.find(k => k.press.action === 'toggle-collapse')
  if (fold && (key === fold.hotkey || (key === 'enter' && keys.length === 0)))
    return {
      events: [select(row.id), { type: 'collapse', id: row.id, isCollapsed: !isCollapsed(row.id) }],
      patch: { focus: null, pageReveal: row.id },
    }
  const drawn = { id: row.id, keys }
  if ((key === 'left' || key === 'right') && keys.length > 0) {
    const index = steppedIndex(pageFocus(drawn, ui), key === 'left' ? -1 : 1, keys.length)

    return { events: [select(row.id)], patch: { focus: { rowId: row.id, index } } }
  }
  const pressed = key === 'enter' ? keys[pageFocus(drawn, ui)] : keys.find(k => k.hotkey === key)
  if (!pressed) return null
  const { press } = pressed
  if (press.action === 'toggle-collapse') return null
  if (press.action === 'show-ask') return { events: [{ type: 'show-ask', id: press.askId, by: 'key' }] }
  if (press.action === 'toggle-fold')
    return { events: [select(row.id), { type: 'status-fold', id: press.foldId, isOpen: !isUnfolded(press.foldId) }] }
  if (press.action === 'type-goal')
    return {
      events: [select(row.id), { type: 'open-field', id: GOAL_KEYS_ID, seed: press.text }],
      patch: { focus: null },
    }

  // The goal's buttons change with the press, so the goal's place keeps the selection: Undo after Remove.
  const isGoalPress = press.action === 'remove-goal' || press.action === 'restore-goal' || press.action === 'take-goal'
  if (!isGoalPress) return null

  return {
    events: [select(GOAL_KEYS_ID), { type: 'press', press: { action: press.action, id: GOAL_KEYS_ID }, by: 'key' }],
    patch: { focus: null, pageReveal: GOAL_KEYS_ID },
  }
}

/** A Status target's keys that draw as buttons: its fold is the parent's name line, not a button. */
export const drawnKeys = (target: StatusKeyTarget): StatusKey[] =>
  target.keys.filter(k => k.press.action !== 'toggle-collapse')
