import type { RenderElement } from 'claude-code'

import { COLLAPSE_KEY, FOLD_ALL_KEY } from './help'
import { later } from './mod-drawn'
import { readAgain } from './mod-load'
import {
  closeField,
  discardReply,
  pressTitle,
  sendDraft,
  sendTyped,
  showAsk,
  startTyping,
  stepCursor,
  toggleHelp,
  toggleParent,
  unlessGuarded,
} from './mod-pane-input'
import { showTab } from './mod-pane-open'
import { selectStatusRow } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { paneState } from './mod-state'
import { resume } from './mod-turns'
import { lookOf } from './palettes'
import type { PaneHandlers } from './pane-context'
import { fieldKey, focusKeys, type KeyAction, pressedBy, type PressVia } from './pane-keys'
import { DESKTOP_OFFSET_ROUNDING } from './pane-sizes'
import { noteStatusDrawn } from './pane-status-shown'
import { desktopSpaceLines } from './pane-status-tops'
import type { PrPress } from './pr-press'
import type { RowPress } from './presses'
import { rowKeyActions } from './row-key-actions'
import { shownTabs } from './tabs'

type Look = ReturnType<typeof lookOf>
type StatusDrawn = Parameters<typeof noteStatusDrawn>[0]

/** What the pane's rows and buttons do when pressed: each sends its event to the controller or runs its step. */
export function paneHandlers(m: Mod): PaneHandlers {
  const runButtonPress = (p: RowPress | PrPress, via: PressVia) =>
    m.sendUi([{ type: 'press', press: p, by: pressedBy(via) }], via.surface)

  return {
    rowKeyActions: (r, isAllShown) =>
      rowKeyActions(
        {
          runPress: runButtonPress,
          startTyping: id => startTyping(m, id),
          discardReply: id => discardReply(m, id),
          showAllOptions: id => void m.sendUi([{ type: 'show-options', id }]),
        },
        r,
        isAllShown,
      ),
    unlessGuarded: (rowId, press, onPress) => unlessGuarded(m, rowId, press, onPress),
    sendDraft: (id, surface) => sendDraft(m, id, surface),
    discardReply: id => discardReply(m, id),
    startTyping: (id, seed) => startTyping(m, id, seed),
    selectStatusRow: (id, focusKey) => selectStatusRow(m, id, focusKey),
    sendTyped: (id, text, surface) => sendTyped(m, id, text, surface),
    pressTitle: id => pressTitle(m, id),
    showTab: tab => showTab(m, tab),
    toggleParent: id => toggleParent(m, id),
    closeField: id => closeField(m, id),
    editDraft: (id, text) => m.sendUi([{ type: 'edit-draft', id, text }]),
    toggleHelp: () => toggleHelp(m),
    setFold: (fold, isOpen) => m.sendUi([{ type: 'fold', fold, isOpen }]),
    showEarlier: fold => m.sendUi([{ type: 'earlier', fold }]),
    setStatusFold: (id, isOpen) => m.sendUi([{ type: 'status-fold', id, isOpen }]),
    runPress: runButtonPress,
    readAgain: () => readAgain(m),
    resume: () => resume(m),
    showAsk: askId => showAsk(m, askId),
  }
}

/**
 * The keys that move in the pane: a key for each tab, j and k, Collapse and Fold all. A pane takes a key only as a
 * Button's hotkey, so the look draws these as Buttons in a hidden Box.
 */
export function paneViewKeys(
  m: Mod,
  p: {
    tabList: ReturnType<typeof shownTabs>
    isHelpShown: boolean
    isListShown: boolean
    /** The ids j and k step among, and on the Status the row they step from. */
    stepIds: string[]
    statusFrom: string | null
    selectedId: string | null
    collapsed: string[]
  },
): KeyAction[] {
  const moveBy = (by: 1 | -1) => (p.isHelpShown ? undefined : void stepCursor(m, by, p.stepIds, p.statusFrom))
  const { selectedId } = p
  // Claude Code sends a key no Button binds to the prompt and gives it the keyboard, so the keys
  // stay bound when there is nothing to move to or close.
  const moveKeys: KeyAction[] = [
    { key: 'next', label: 'Next', hotkey: 'j', kind: 'view', onPress: () => moveBy(1) },
    { key: 'previous', label: 'Previous', hotkey: 'k', kind: 'view', onPress: () => moveBy(-1) },
    {
      key: 'collapse',
      label: 'Collapse',
      hotkey: COLLAPSE_KEY,
      kind: 'view',
      onPress: () =>
        p.isListShown && selectedId !== null
          ? void m.sendUi([{ type: 'collapse', id: selectedId, isCollapsed: !p.collapsed.includes(selectedId) }])
          : undefined,
    },
    {
      key: 'fold-all',
      label: 'Fold all',
      hotkey: FOLD_ALL_KEY,
      kind: 'view',
      onPress: () => (p.isHelpShown ? undefined : void m.sendUi([{ type: 'fold-all', isOpening: null }])),
    },
  ]
  const tabKeys: KeyAction[] = p.tabList.map(({ id, label, hotkey }) => ({
    key: `tab-key-${id}`,
    label,
    hotkey,
    kind: 'view',
    onPress: () => void showTab(m, id),
  }))

  return [...tabKeys, ...moveKeys]
}

/** Notes where the drawn Status starts in the pane, when the lines above it are known, for the Status look. */
export function noteStatusTop(p: {
  look: Look
  hasRail: boolean
  isTabRowFit: boolean
  isInline: boolean
  desktopTabLines: number | null
  hasStatusBlock: boolean
  showsDemoNotices: boolean
  blankLine: 0 | 1
  tops: StatusDrawn['tops']
  scroll: StatusDrawn['scroll']
  now: number
}) {
  const { look, hasRail, blankLine } = p
  // The lines above the Status: the tabs, unless the rail draws them beside it, and the space under them, which
  // desktop counts in half lines.
  const terminalTabLines = hasRail ? 0 : p.isTabRowFit ? (p.isInline ? 1 : 3) : null
  const tabLines = look === 'desktop' ? (hasRail ? null : p.desktopTabLines) : terminalTabLines
  const isChromeKnown = tabLines !== null && !p.hasStatusBlock && !p.showsDemoNotices
  const spaceLines = hasRail ? 0 : look === 'desktop' ? desktopSpaceLines(blankLine) : blankLine
  const top = isChromeKnown ? tabLines + spaceLines : null
  const rounding = look === 'desktop' ? DESKTOP_OFFSET_ROUNDING : 0
  const pageTop = top === null ? null : { least: top - rounding, most: top + rounding }
  noteStatusDrawn({ pageTop, tops: p.tops, scroll: p.scroll, now: p.now, isUnplacedShown: look === 'terminal' })
}

/** On desktop, moves the focus to the hint once the focused key is gone from `tree`, or once a field opened. */
export function restoreDesktopFocus(m: Mod, tree: RenderElement) {
  if (paneState.focusedKey === null) return
  const keys = focusKeys(tree)
  const hint = paneState.focusHint?.startsWith('type-')
    ? fieldKey(paneState.focusHint.slice('type-'.length))
    : paneState.focusHint
  const opensField = hint?.startsWith('type-') && keys.has(hint)
  if (keys.has(paneState.focusedKey) && !opensField) return
  const focusKey = hint && keys.has(hint) ? hint : null
  paneState.focusedKey = focusKey
  paneState.focusHint = null
  // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
  if (focusKey) later(m, 0, () => m.pane.focus(focusKey))
}
