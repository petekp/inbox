import type { UiPressArgument } from 'claude-code'

import { demoReply } from './mod-demo'
import { drawnState, isPaneShown, readUi, redraw } from './mod-drawn'
import { saveCollapse } from './mod-pane-input'
import { focusOpenedField, tabShown } from './mod-pane-open'
import { revealRow } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { runPress } from './mod-press-run'
import { conversation } from './mod-sessions'
import { paneState } from './mod-state'
import { applyUiEvents, hostFactsOf, isReadWake, undoStepAt, withPaneShown } from './mod-ui'
import { openFields } from './pane-keys'
import type { SessionView } from './session-view'
import { earliestOf } from './timing'
import { keptUiStates, restoredUi } from './ui-controller'
import { nextWakeAt } from './ui-controller-clock'
import { freshUi, type UiCommand, type UiEvent, type UiState } from './ui-controller-types'

type UiLoopCalls = Pick<
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

/** Runs `work` after every batch already queued for the controller, so no two read and save its state at once. */
function inUiQueue<T>(work: () => Promise<T>): Promise<T> {
  const run = paneState.uiQueue.then(work)
  paneState.uiQueue = run.then(
    () => undefined,
    () => undefined,
  )

  return run
}

const withoutListInput = (ui: UiState) => JSON.stringify({ ...ui, listInput: null })

/**
 * Runs `events` through the shared controller on the drawn view, one batch at a time, saves its state, and runs its
 * commands. `'read'` reads what the drawn session says about its host. A press's `surface` reaches its commands.
 */
export function sendUi(m: UiLoopCalls, events: (UiEvent | 'read')[], surface?: UiPressArgument['surface']) {
  return inUiQueue(() => applyUi(m, events, surface))
}

async function applyUi(m: UiLoopCalls, events: (UiEvent | 'read')[], surface?: UiPressArgument['surface']) {
  const [drawn, isPaneShownNow] = await Promise.all([drawnState(m), isPaneShown(m)])
  const isPaneOpen = isPaneShownNow && paneState.loadingRevision === null
  const host = hostFactsOf(drawn)
  const synced = withPaneShown(events, drawn.ui, isPaneOpen)
  const all = synced.map((event): UiEvent => (event === 'read' ? { type: 'read', host } : event))
  const applied = applyUiEvents(drawn.ui, drawn.view, all, drawn.now)
  paneState.listInput = applied.ui.listInput
  paneState.nextPressId = applied.ui.nextPressId
  if (withoutListInput(applied.ui) !== withoutListInput(drawn.ui)) await m.atoms.ui.update(() => applied.ui)
  scheduleUiWake(m, applied.ui, drawn.view, applied.nextWakeAt, drawn.now)
  for (const c of applied.commands) void runUiCommand(m, c, surface).catch(() => undefined)
}

/** Keeps the one timer at the controller's next wake, or the terminal's next Undo step when that comes first. */
function scheduleUiWake(m: UiLoopCalls, ui: UiState, view: SessionView, wakeAt: number | null, now: number) {
  const undoStep = paneState.drawsTerminal && ui.shownSince !== null ? undoStepAt(view, now) : null
  const at = earliestOf([wakeAt, undoStep])
  const isRead = at !== null && isReadWake(ui, view, at, now)
  const wake = paneState.uiWake
  if (wake !== null && wake.at === at && wake.isRead === isRead) return
  wake?.timer.cancel()
  paneState.uiWake = null
  if (at === null) return
  try {
    paneState.uiWake = { at, isRead, timer: m.clock.after(Math.max(0, at - now), () => void wakeUi(m)) }
  } catch {
    // An earlier mod can refuse the timer. The terminal's next render then starts it again.
  }
}

/** A terminal render draws the last frame, and starts the timer again when it died, as when the engine refused it. */
export function landTerminalFrame(m: UiLoopCalls, ui: UiState, view: SessionView, now: number) {
  paneState.drawsTerminal = true
  paneState.isTerminalFrameLanded = true
  const wake = paneState.uiWake
  if (wake === null || wake.at < now) scheduleUiWake(m, ui, view, nextWakeAt(ui, view, now), now)
}

/** A wake reads the view again when it changed on the clock, and otherwise only draws the next frame or step. */
async function wakeUi(m: UiLoopCalls) {
  const isRead = paneState.uiWake?.isRead === true
  paneState.uiWake = null
  const isFrameDrawing = paneState.drawsTerminal && !paneState.isTerminalFrameLanded
  if (!isRead && isFrameDrawing) return
  await m.sendUi([isRead ? 'read' : { type: 'tick' }])
  if (isRead) return redraw(m)
  if (!paneState.drawsTerminal) return
  paneState.isTerminalFrameLanded = false
  await m.atoms.runningFrame.update(n => n + 1)
}

async function runUiCommand(m: UiLoopCalls, c: UiCommand, surface?: UiPressArgument['surface']) {
  if (c.kind === 'press') await runPress(m, c.pressId, c.press, c.holds, surface)
  else if (c.kind === 'save-collapse') await saveCollapse(m, c.id, c.isCollapsed).then(() => m.sendUi(['read']))
  else if (c.kind === 'read') await m.sendUi(['read'])
  else if (c.kind === 'focus-field') await focusOpenedField(m, c.id)
  else if (c.kind === 'reveal') await revealRow(m, c.tab, c.id, c.closedId)
  else if (c.kind === 'tab-shown') await tabShown(m, c.tab)
  else await demoReply(m, c.pressId)
}

/** Keeps the leaving conversation's state among the others kept, and starts the pane over, closed, on the same tab. */
export function leaveUi(m: UiLoopCalls) {
  return inUiQueue(async () => {
    const [ui, now] = await Promise.all([readUi(m), m.clock.now()])
    const id = conversation.id
    paneState.keptUi = keptUiStates({ ...paneState.keptUi, [id]: { ui, shownAt: now } }, null)
    paneState.listInput = null
    await m.atoms.ui.update(() => freshUi(ui.config, ui.tab))
  })
}

/**
 * Takes the state kept for conversation `id`, else goes on from the current one. No press's answer survives a load.
 * The pane opens on the conversation once the load ends.
 */
export function enterUi(m: UiLoopCalls, id: string) {
  return inUiQueue(async () => {
    const { [id]: kept, ...others } = paneState.keptUi
    paneState.keptUi = others
    const ui = restoredUi(kept?.ui ?? (await readUi(m)))
    openFields.clear()
    await m.atoms.ui.update(() => ({ ...ui, shownSince: null }))
  })
}
