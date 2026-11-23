import type { Hook } from 'claude-code'

import { pressTitle, setFold, toggleHelp, toggleParent } from './mod-pane-input'
import { redraw } from './mod-drawn'
import { showTab } from './mod-pane-open'
import { type Mod, PANE } from './mod-ports'
import { cancelUndoScroll, paneState, suspendUndoReveal } from './mod-state'
import { focusHintFor, followUpPresses, paneHasKeys } from '../pane/pane-keys'
import { PARENT_PREFIX } from '../pane/pane-status-parent'
import { isShownTab } from '../../core/view/tabs'

type PaneEventCalls = Pick<
  Mod,
  | 'atoms'
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

type UiPressEvent = Parameters<Hook<'ui.press'>>[1]
type UiMessageEvent = Parameters<Hook<'ui.message'>>[1]

/** A press in the pane: any press ends the list's typed input, and on the inline terminal it ends the Undo reveal. */
export async function panePressed(m: PaneEventCalls, e: UiPressEvent) {
  if (e.requestId !== PANE) return
  await m.sendUi([{ type: 'list-input' }])
  if (e.surface === 'terminal') {
    if (e.element.startsWith('fold-') || e.element === 'hide-demo') cancelUndoScroll()
    else suspendUndoReveal()
  }
  if (e.surface === 'desktop') {
    paneState.focusedKey = e.element
    paneState.focusHint = focusHintFor(e.element)
  }
}

/** The person scrolled the pane, which ends the list's typed input and any Undo the pane keeps in view. */
export async function paneScrolled(m: PaneEventCalls, isByPerson: boolean) {
  if (!isByPerson) return
  cancelUndoScroll()
  await m.sendUi([{ type: 'list-input' }])
}

/** A message a Client in the pane posted: a tab, Help, fold, title or parent press, or a press it passes on. */
export async function paneMessaged(m: PaneEventCalls, e: UiMessageEvent) {
  if (e.requestId !== PANE) return
  const data = e.data as {
    tab?: unknown
    isUnfolded?: unknown
    isAll?: unknown
    key?: unknown
    isPointer?: unknown
    isHelp?: unknown
    isRunning?: unknown
  } | null
  if (e.element === 'tabs' && paneState.isTabsClientNew) {
    paneState.isTabsClientNew = false
    await redraw(m)
  }
  if (data?.isRunning === true) return
  await m.sendUi([{ type: 'list-input' }])
  if (data?.isPointer === true) return
  const shown = isShownTab(data?.tab) ? data.tab : null
  const followUp = typeof data?.key === 'string' ? followUpPresses.get(data.key) : undefined
  if (e.element === 'tabs' && data?.isHelp === true) await toggleHelp(m)
  else if (e.element === 'tabs' && shown) await showTab(m, shown)
  else if (e.element.startsWith('undo-') && followUp && typeof data?.key === 'string')
    followUp({
      plugin: 'inbox',
      element: data.key,
      component: e.component,
      requestId: e.requestId,
      surface: e.surface,
    })
  else if (e.element.startsWith('links-') && followUp && typeof data?.key === 'string') {
    // The Client is not a focusable key, so the next drawing moves the focus to the hint, when it is drawn.
    paneState.focusedKey = e.element
    paneState.focusHint = focusHintFor(data.key)
    followUp({
      plugin: 'inbox',
      element: data.key,
      component: e.component,
      requestId: e.requestId,
      surface: e.surface,
    })
  } else if (/^(select|collapse)-/.test(e.element)) await pressTitle(m, e.element.replace(/^\w+-/, ''), data?.isAll)
  else if (e.element.startsWith(PARENT_PREFIX))
    await toggleParent(m, e.element.slice(PARENT_PREFIX.length), data?.isAll)
  else if (e.element.startsWith('fold-'))
    await setFold(m, e.element.slice('fold-'.length), data?.isUnfolded, data?.isAll)
}

/** The pane closed: it has no keys and no terminal frame, the controller hears it, and the Status look ends. */
export async function paneClosed(m: PaneEventCalls) {
  paneHasKeys.clear()
  paneState.isTabsClientNew = true
  paneState.drawsTerminal = false
  paneState.isOpenWaiting = false
  await m.sendUi([{ type: 'closed' }])
  void m.syncLook(false)
}
