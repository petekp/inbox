import { delegatesSettled } from '../../core/domain/children'
import { runOf } from './mod-commands'
import { isPaneShown, readUi, redraw } from './mod-drawn'
import { followDelegates as followHerdrDelegates, openInHerdr } from './mod-herdr'
import type { HerdrOpened } from '../../core/remote/herdr-open'
import { scrollToOpenRow } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { wakeForHeldSends } from './mod-press-run'
import { findPrs } from './mod-prs'
import { currentOwner } from './mod-sessions'
import { cancelUndoScroll, paneState } from './mod-state'
import type { RenderSurface } from 'claude-code'
import { fieldKey, openedField, openFields, paneHasKeys } from '../pane/pane-keys'
import { takeShownRows } from '../pane/pane-status-shown'
import { upgradeSession } from '../../core/view/session-files'
import { statusChanged, withLook } from '../../core/runtime/session-status'
import { isRowTab, type ShownTab } from '../../core/view/tabs'

type PaneOpenCalls = Pick<
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

/**
 * Opens the pane, or raises it, asking for the keyboard. The surface grants
 * that only while the prompt holds the keys over an empty composer.
 *
 * Escape closes a pane opened with `closeOnEscape` as its close mark does, and `ui.close` names both the
 * person's. So while a reply field is open the pane opens without it: Escape then only hands the keys back,
 * and the pane's render closes the field.
 */
function openPane(m: PaneOpenCalls, isFieldOpen = false) {
  paneState.paneClosesOnEscape = !isFieldOpen
  paneState.isOpenUnheard = true
  const opened = m.pane.open({ focus: true, ...(isFieldOpen ? {} : { closeOnEscape: true as const }) })
  void opened
    .then(async r => {
      paneState.isOpenWaiting = !r.isPlaced
      if (r.isPlaced) await paneOpened(m)
    })
    .catch(() => {
      paneState.isOpenUnheard = false
    })

  return opened
}

/** The engine drew the pane: the controller hears that it opened, and the look and held sends follow. */
export async function paneOpened(m: PaneOpenCalls) {
  const isOpenNew = (await readUi(m)).shownSince === null && paneState.loadingRevision === null
  await m.sendUi(isOpenNew ? [{ type: 'opened' }, 'read'] : ['read'])
  paneState.isOpenUnheard = false
  await m.syncLook(true)
  await wakeForHeldSends(m)
}

/**
 * Starts a look while the Status shows in the pane, and ends it when it stops showing there. Both are
 * idempotent, so every place that opens, closes or changes the pane's page can call it. The sample
 * leaves the real session's look alone. `isOpen` is whether the pane shows, when the caller knows.
 */
export async function syncLook(m: PaneOpenCalls, isOpen?: boolean) {
  if (await m.atoms.demo.read()) return
  const [ui, isPaneOpen, now] = await Promise.all([readUi(m), isOpen ?? isPaneShown(m), m.clock.now()])
  const isShown = isPaneOpen && ui.tab === 'overview'
  const shown = isShown ? {} : takeShownRows()
  await m.commit(currentOwner(), s => withLook(s, isShown, now, shown)).catch(() => undefined)
  followDelegates(m, isShown)
}

function followDelegates(m: PaneOpenCalls, isShown: boolean) {
  followHerdrDelegates(isShown, paneState, m.herdr, () => {
    const owner = currentOwner()
    return {
      run: runOf(m.commands),
      now: () => m.clock.now(),
      ownerId: owner.id,
      overview: async () => upgradeSession(await m.atoms.session.read()).ledger.overview,
      isStatusShown: async () =>
        (await readUi(m)).tab === 'overview' && (await isPaneShown(m)) && !(await m.atoms.demo.read()),
      settle: (agents, at) => m.commit(owner, s => statusChanged(s, o => delegatesSettled(o, agents, at))),
    }
  })
}

/** Opens the open pane again, without asking for the keyboard, once a reply field opened or closed. */
export async function matchPaneEscape(m: PaneOpenCalls) {
  const closesOnEscape = (await readUi(m)).typing === null
  if (closesOnEscape === paneState.paneClosesOnEscape) return
  paneState.paneClosesOnEscape = closesOnEscape
  if ((await m.pane.find()) === undefined) return
  await m.pane.open(closesOnEscape ? { closeOnEscape: true } : {})
}

/** How long a press waits for the desktop app to draw the pane again before it counts the pane as hidden. */
const DESKTOP_DRAW_WAIT_MS = 300

const desktopDrawWaiters = new Set<() => void>()

export function paneDrawnOnDesktop() {
  for (const resolve of desktopDrawWaiters) resolve()
  desktopDrawWaiters.clear()
}

/** `surface` is where the press came from. A command names none, so it counts only when the desktop app alone draws the pane. */
function mayBeHiddenByDesktop(surface: RenderSurface | undefined) {
  const isDesktopPress = surface === undefined ? paneHasKeys.size === 1 : surface === 'desktop'

  return isDesktopPress && paneHasKeys.has('desktop')
}

/** A redraw draws a pane the desktop app shows again within milliseconds, and draws nothing while the app hides it. */
async function isDrawnOnDesktop(m: PaneOpenCalls): Promise<boolean> {
  let markDrawn = () => {}
  const drawn = new Promise<boolean>(resolve => (markDrawn = () => resolve(true)))
  desktopDrawWaiters.add(markDrawn)
  try {
    await redraw(m).catch(() => undefined)

    return await Promise.race([drawn, m.clock.sleep(DESKTOP_DRAW_WAIT_MS).then(() => false)])
  } finally {
    desktopDrawWaiters.delete(markDrawn)
  }
}

/**
 * The desktop app's Hide Side Panel hides the pane without a `ui.close`, `ui.panes` still reads it shown, and
 * `ui.open` leaves it hidden. An open after a close shows it again, scrolled to the top, so the close runs only for a
 * pane the app no longer draws.
 */
async function showAgainIfHidden(m: PaneOpenCalls) {
  if (await isDrawnOnDesktop(m)) return
  openFields.clear()
  paneState.runningClients.clear()
  await m.pane.close().catch(() => undefined)
}

export async function showInbox(m: PaneOpenCalls, opening: HerdrOpened | Promise<HerdrOpened | null> | null) {
  const herdr = await opening
  if (herdr?.isShown) return herdr.text
  if (mayBeHiddenByDesktop(undefined)) await showAgainIfHidden(m)
  await openPane(m)

  return herdr?.text
}

export async function openInbox(m: PaneOpenCalls, isDemo: boolean, surface: RenderSurface) {
  const opening = isDemo ? null : openInHerdr(m.herdr)
  if (opening instanceof Promise && (await opening).isShown) return
  // Opened before any other await unless the Herdr look is opening or the press came from the desktop app. After one,
  // the engine no longer counts the press as asking for the pane, and below 144 columns, once the person has closed
  // it, leaves it unplaced. The desktop app places a pane at any width.
  if (mayBeHiddenByDesktop(surface)) await showAgainIfHidden(m)
  await openPane(m)
  if ((await readUi(m)).tab === 'prs') await findPrs(m)
}

/** The controller opened `id`'s field: the pane draws it with its draft, and it takes the keys. */
export async function focusOpenedField(m: PaneOpenCalls, id: string) {
  paneState.focusHint = `type-${id}`
  openFields.set(id, openedField(id, (await readUi(m)).drafts[id]))
  await focusField(m, id)
}

export async function focusField(m: PaneOpenCalls, id: string) {
  // A click leaves the keys with the prompt, and `ui.focus` is refused in a pane that lacks them.
  await openPane(m, true)
  const isMoved = await m.pane.focus(fieldKey(id)).then(
    r => r.deny === undefined,
    () => false,
  )
  // A deny also comes when the field's `autoFocus` took the keys first, so the pane says whether it has them.
  const isWithoutKeys = !isMoved && (await m.pane.find())?.isFocused === false
  if (isWithoutKeys === (paneState.fieldWithoutKeys === id)) return
  paneState.fieldWithoutKeys = isWithoutKeys ? id : null
  await redraw(m)
}

export async function showTab(m: PaneOpenCalls, tab: ShownTab) {
  if (tab === 'prs') await findPrs(m)
  await m.sendUi([{ type: 'show-tab', tab }])
}

/** The controller showed `tab`: the look follows it, and a row tab scrolls to its open row. */
export async function tabShown(m: PaneOpenCalls, tab: ShownTab) {
  cancelUndoScroll()
  void m.syncLook()
  if (isRowTab(tab)) await scrollToOpenRow(m, tab)
}
