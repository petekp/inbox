import { isPrPress } from '../../hooks/pr-press'
import { keptDiscards, isGuarded } from '../../hooks/timing'
import { shownTabs, isRowTab } from '../../hooks/tabs'
import { firstWaiting, rowAfterClose } from '../../hooks/action-plan'
import { GOAL_KEYS_ID, statusKeyRows, statusSelected } from '../../hooks/status-keys'
import type { StatusKeyTarget } from '../../hooks/status-keys'
import type { ShownTab } from '../../hooks/tabs'
import { entriesOf } from './panel-entries'
import { isSelectable, isShut, linesOf, waitsOf } from './panel-lines'
import type { Button, Line } from './panel-lines'
import type { PanelPress, PanelScreen, PanelUi } from './panel'

const wrapIndex = (i: number, n: number) => ((i % n) + n) % n

export function resolveSelected(lines: Line[], selectedId: string | null): Line | null {
  const selectable = lines.filter(isSelectable)
  const current = lines.find(l => l.id === selectedId)
  if (current && isSelectable(current)) return current
  const waits = waitsOf(lines)
  const nextId = (current ? rowAfterClose(waits, current.id) : null) ?? firstWaiting(waits)

  return lines.find(l => l.id === nextId) ?? selectable[0] ?? null
}

function defaultFocus(line: Line): number {
  return Math.max(
    0,
    line.buttons.findIndex(b => b.isRecommended),
  )
}

export const focusOf = (line: Line, ui: PanelUi): number =>
  ui.focus?.rowId === line.id ? Math.min(ui.focus.index, line.buttons.length - 1) : defaultFocus(line)

type KeyResult = { ui: PanelUi; press?: PanelPress; close?: true }

function withSelection(ui: PanelUi, id: string | null): PanelUi {
  return { ...ui, selectedId: id, focus: null, opened: ui.opened === id ? ui.opened : null, openedAt: 0 }
}

/** Shows `tab`. Its showing starts at `now` unless it already shows, so its settled rows stay. */
export const withTab = (ui: PanelUi, tab: ShownTab, now: number): PanelUi => ({
  ...withSelection(ui, null),
  tab,
  pageTop: 0,
  shownSince: tab === ui.tab ? ui.shownSince : now,
  isHelpShown: false,
})

/** Whether the line `id` on the shown tab waits on the person. */
export function isLineWaiting(screen: PanelScreen, ui: PanelUi, id: string, now: number): boolean {
  return waitsOf(linesOf(entriesOf(screen, ui, ui.tab, now))).some(w => w.id === id && w.isWaiting)
}

/**
 * After a press stops the selected row from waiting, the selection moves to the next row that waits, as the
 * terminal's does. The row stays selected when none waits. A failed send leaves the row waiting, so it stays selected.
 */
export function afterHandOff(screen: PanelScreen, ui: PanelUi, id: string, now: number): PanelUi {
  if (ui.selectedId !== id) return ui
  const lines = linesOf(entriesOf(screen, ui, ui.tab, now))
  const waits = waitsOf(lines)
  if (!lines.some(l => l.id === id) || waits.some(w => w.id === id && w.isWaiting)) return ui
  const next = rowAfterClose(waits, id)

  return next === null ? { ...ui, focus: null, opened: null } : withSelection(ui, next)
}

function activate(screen: PanelScreen, ui: PanelUi, line: Line, button: Button, now: number): KeyResult {
  const { press } = button
  if (button.isOut) return { ui }
  if (press.action === 'resume') {
    const { stop } = screen
    const isSending = ui.resuming?.is === 'sending' && ui.resuming.stopAt === stop?.at
    if (!stop || isSending) return { ui }

    return { ui: { ...ui, focus: null, resuming: { stopAt: stop.at, is: 'sending' } }, press }
  }
  if (!isPrPress(press) && press.action === 'type') {
    const draft = ui.drafts[line.id] ?? { text: '', since: now }

    return { ui: { ...ui, typing: line.id, focus: null, drafts: { ...ui.drafts, [line.id]: draft } } }
  }
  if (!isPrPress(press) && press.action === 'discard') {
    const { [line.id]: _discarded, ...drafts } = ui.drafts
    const discarded = { ...keptDiscards(ui.discarded, ui.shownSince), [line.id]: now }

    return { ui: { ...ui, focus: null, drafts, discarded } }
  }

  return { ui: { ...ui, focus: null }, press }
}

function typingKey(ui: PanelUi, id: string, key: string, now: number, text: string | undefined): KeyResult {
  const draft = ui.drafts[id] ?? { text: '', since: now }
  const edit = (next: string): KeyResult => ({
    ui: { ...ui, drafts: { ...ui.drafts, [id]: { ...draft, text: next } } },
  })
  if (key === 'escape') return { ui: { ...ui, typing: null } }
  if (key === 'enter') {
    if (draft.text.trim() === '') return { ui }

    return { ui: { ...ui, typing: null }, press: { action: 'type', id, text: draft.text } }
  }
  if (key === 'backspace') return edit([...draft.text].slice(0, -1).join(''))
  if (text !== undefined) return edit(draft.text + text.replace(/[\r\n]+/g, ' '))

  return { ui }
}

/**
 * Applies one key. `key` is the parsed key name, as pi-tui's `parseKey` gives it. `text` is the printable text the
 * key types, which only a reply field reads.
 */
export function handleKey(screen: PanelScreen, ui: PanelUi, key: string, now: number, text?: string): KeyResult {
  const lines = linesOf(entriesOf(screen, ui, ui.tab, now))
  const selected = resolveSelected(lines, ui.selectedId)
  const isPage = !isRowTab(ui.tab)
  // The Status lists no lines, and its selection is a Status row's id.
  const base: PanelUi = isPage ? ui : { ...ui, selectedId: selected?.id ?? null }
  if (base.typing !== null) return typingKey(base, base.typing, key, now, text)
  const shown = shownTabs(screen.isNextBuild === true)
  const isTabKey = key === 'tab' || key === 'shift+tab' || shown.some(t => t.hotkey === key)
  if (key === '?' || (base.isHelpShown && key === 'escape'))
    return { ui: { ...base, isHelpShown: key === '?' && !base.isHelpShown, pageTop: 0 } }
  if (key === 'escape') return { ui: base, close: true }
  if (isPage && !base.isHelpShown) {
    const page = pageKey(screen, base, key, now)
    if (page) return page
  }
  const isUp = key === 'up' || key === 'k'
  if (base.isHelpShown && !isTabKey && !isUp && key !== 'down' && key !== 'j') return { ui: base }
  if ((base.isHelpShown || isPage) && (isUp || key === 'down' || key === 'j'))
    return { ui: { ...base, pageTop: Math.max(0, base.pageTop + (isUp ? -1 : 1)) } }
  const selectable = lines.filter(isSelectable)
  const at = selectable.findIndex(l => l.id === selected?.id)
  if ((key === 'up' || key === 'k' || key === 'down' || key === 'j') && selectable.length > 0) {
    const step = key === 'up' || key === 'k' ? -1 : 1

    return { ui: withSelection(base, selectable[wrapIndex(Math.max(0, at) + step, selectable.length)]!.id) }
  }
  const tabs = shown.map(t => t.id)
  const pickedTab = shown.find(t => t.hotkey === key)
  if (key === 'tab' || key === 'shift+tab') {
    const step = key === 'tab' ? 1 : -1

    return { ui: withTab(base, tabs[wrapIndex(tabs.indexOf(base.tab) + step, tabs.length)]!, now) }
  }
  if (pickedTab) return { ui: withTab(base, pickedTab.id, now) }
  if (key === 'u') {
    const undoable = lines.filter(l => l.settled?.undo).at(-1)
    const press = undoable?.settled?.undo
    if (undoable && press) return { ui: withSelection(base, undoable.id), press }

    return { ui: base }
  }
  const tabLine = lines.find(l => l.isTabButtons && l.buttons.some(b => b.key === key))
  const tabButton = tabLine?.buttons.find(b => b.key === key)
  if (tabLine && tabButton) return activate(screen, base, tabLine, tabButton, now)
  if (selected?.fold && key === 'enter') {
    const kind = selected.fold
    const unfolded = base.unfolded.includes(kind) ? base.unfolded.filter(k => k !== kind) : [...base.unfolded, kind]

    return { ui: { ...base, unfolded } }
  }
  if (selected && isShut(selected, base))
    return key === 'enter' ? { ui: { ...base, opened: selected.id } } : { ui: base }
  if (!selected || selected.buttons.length === 0 || isGuarded(base.openedAt, now)) return { ui: base }
  if (key === 'left' || key === 'right') {
    const index = wrapIndex(focusOf(selected, base) + (key === 'left' ? -1 : 1), selected.buttons.length)

    return { ui: { ...base, focus: { rowId: selected.id, index } } }
  }
  const button = key === 'enter' ? selected.buttons[focusOf(selected, base)] : selected.buttons.find(b => b.key === key)

  return button ? activate(screen, base, selected, button, now) : { ui: base }
}

/**
 * A key on the Status page, or null when the page leaves it to the panel. While a target has buttons, j and k move the
 * selection between those targets and up and down still scroll. Enter and the buttons' keys press the selected
 * target's. View shows Asks, a goal button that types opens the goal's field with its text, and the rest are presses.
 */
function pageKey(screen: PanelScreen, ui: PanelUi, key: string, now: number): KeyResult | null {
  const page = screen.view.statusPage
  const rows = statusKeyRows(page)
  const row = statusSelected(page, ui.selectedId)
  if (!row) return null
  if (key === 'j' || key === 'k') {
    const at = rows.findIndex(r => r.id === row.id)
    const to = rows[wrapIndex(at + (key === 'k' ? -1 : 1), rows.length)]!.id

    return { ui: { ...ui, selectedId: to, focus: null, pageReveal: to } }
  }
  const { keys } = row
  if (key === 'left' || key === 'right') {
    const index = wrapIndex(pageFocus(row, ui) + (key === 'left' ? -1 : 1), keys.length)

    return { ui: { ...ui, selectedId: row.id, focus: { rowId: row.id, index } } }
  }
  const pressed = key === 'enter' ? keys[pageFocus(row, ui)] : keys.find(k => k.hotkey === key)
  if (!pressed) return null
  const { press } = pressed
  if (press.action === 'show-ask')
    return { ui: { ...withTab(ui, 'needsYou', now), selectedId: press.askId, openedAt: now } }
  if (press.action === 'type-goal') {
    const drafts = { ...ui.drafts, [GOAL_KEYS_ID]: { text: press.text, since: now } }

    return { ui: { ...ui, selectedId: row.id, typing: GOAL_KEYS_ID, focus: null, drafts } }
  }

  return { ui: { ...ui, selectedId: row.id, focus: null }, press: { action: press.action, id: GOAL_KEYS_ID } }
}

export const pageFocus = (target: StatusKeyTarget, ui: PanelUi): number =>
  ui.focus?.rowId === target.id ? Math.min(ui.focus.index, target.keys.length - 1) : 0
