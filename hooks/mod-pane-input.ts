import type { UiPressArgument } from 'claude-code'

import { withCollapse } from './collapse'
import { foldOf } from './fold-keys'
import { drawnState, readUi } from './mod-drawn'
import { focusField } from './mod-pane-open'
import { scrollToKey } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { currentOwner } from './mod-sessions'
import { type Action, openFields } from './pane-keys'
import { isGuardedPress } from './ui-controller-selection'
import type { UiEvent } from './ui-controller-types'

type PaneInputCalls = Pick<
  Mod,
  | 'atoms'
  | 'writeSession'
  | 'clock'
  | 'pane'
  | 'saves'
  | 'history'
  | 'commands'
  | 'herdr'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

export async function sendDraft(m: PaneInputCalls, id: string, surface: UiPressArgument['surface']) {
  await sendTyped(m, id, (await readUi(m)).drafts[id]?.text ?? '', surface)
}

export async function sendTyped(m: PaneInputCalls, id: string, text: string, surface: UiPressArgument['surface']) {
  if (text.trim()) await m.sendUi([{ type: 'press', press: { action: 'type', id, text }, by: 'click' }], surface)
  else await focusField(m, id)
}

export async function discardReply(m: PaneInputCalls, id: string) {
  openFields.delete(id)
  await m.sendUi([{ type: 'close-field', id, isDiscard: true }])
}

/** Opens `id`'s field with its draft, or with `seed` as a fresh one. */
export async function startTyping(m: PaneInputCalls, id: string, seed?: string) {
  await m.sendUi([{ type: 'open-field', id, ...(seed === undefined ? {} : { seed }) }])
}

/** Closes `id`'s field and keeps its draft, as Cancel and Escape do. */
export async function closeField(m: PaneInputCalls, id: string) {
  await m.sendUi([{ type: 'close-field', id, isDiscard: false }])
}

/**
 * j or k: the cursor steps among `ids`, from the Status row the pane draws selected when one is given, picked or not.
 * On the Status, the row it lands on scrolls into view.
 */
export async function stepCursor(m: PaneInputCalls, by: 1 | -1, ids: string[], statusFrom: string | null = null) {
  const pick: UiEvent[] = statusFrom === null ? [] : [{ type: 'select', tab: 'overview', id: statusFrom, by: 'key' }]
  await m.sendUi([...pick, { type: 'step', by, ids }])
  const ui = await readUi(m)
  if (ui.tab === 'overview' && ui.statusSelection !== null)
    await scrollToKey(m, `status-${ui.statusSelection}`, 'nearest')
}

/** A Status row's View press: Asks shows with the ask selected and in view. */
export async function showAsk(m: PaneInputCalls, askId: string) {
  await m.sendUi([{ type: 'show-ask', id: askId, by: 'click' }])
}

/** A set, not a toggle: a second click before the redraw posts the same state, so a double-click leaves it unfolded. */
export async function setFold(m: PaneInputCalls, key: string, isUnfolded: unknown, isAll?: unknown) {
  const fold = foldOf(key)
  if (!fold || typeof isUnfolded !== 'boolean') return
  if (isAll) return m.sendUi([{ type: 'fold-all', isOpening: isUnfolded }])
  await m.sendUi([
    'kind' in fold
      ? { type: 'fold', fold: fold.kind, isOpen: isUnfolded }
      : { type: 'status-fold', id: fold.statusId, isOpen: isUnfolded },
  ])
}

export async function unlessGuarded(
  m: PaneInputCalls,
  rowId: string,
  press: UiPressArgument,
  onPress: Action['onPress'],
) {
  const [ui, now] = await Promise.all([readUi(m), m.clock.now()])
  if (!isGuardedPress(ui, ui.tab, rowId, 'click', now)) await onPress(press)
}

/** A click on row `id`'s title. With `isAll`, it folds or opens every fold of the tab, as the row would go. */
export async function pressTitle(m: PaneInputCalls, id: string, isAll?: unknown) {
  if (!isAll) return m.sendUi([{ type: 'title-press', id, by: 'click' }])
  const { view } = await drawnState(m)
  await m.sendUi([{ type: 'fold-all', isOpening: view.collapsed.includes(id) }])
}

export async function toggleHelp(m: PaneInputCalls) {
  await m.sendUi([{ type: 'show-help', isShown: !(await readUi(m)).isHelpShown }])
}

/** A press on a Status parent's name or its Fold key. With `isAll`, every fold of the page goes the same way. */
export async function toggleParent(m: PaneInputCalls, id: string, isAll?: unknown) {
  const { view } = await drawnState(m)
  const isOpening = view.collapsed.includes(id)
  await m.sendUi([isAll ? { type: 'fold-all', isOpening } : { type: 'collapse', id, isCollapsed: !isOpening }])
}

/** Saves row `id` collapsed or open, in the sample copy while the sample shows. */
export async function saveCollapse(m: PaneInputCalls, id: string, isCollapsed: boolean) {
  const at = await m.clock.now()
  if (await m.atoms.demo.read()) await m.atoms.demo.update(d => d && withCollapse(d, id, isCollapsed, at))
  else await m.commit(currentOwner(), s => withCollapse(s, id, isCollapsed, at))
}
