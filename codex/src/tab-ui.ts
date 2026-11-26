import { clipLabel } from '../../core/domain/text'
import { capitalized } from '../../core/domain/press-labels'
import { pressRowId } from '../../core/view/pr-press'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import type { Feedback } from '../../core/view/feedback'
import { PRESS_TIMEOUT_MS } from '../../core/view/session-view'
import type { ShownTab } from '../../core/view/tabs'
import { reduceUi, rowErrorOf } from '../../core/view/ui-controller'
import { holdsOf } from '../../core/view/ui-controller-reply'
import { readWakeAt } from '../../core/view/ui-controller-clock'
import { collapsedOf, isGuardedPress, openRowOf, selectedOf } from '../../core/view/ui-controller-selection'
import type {
  HostFacts,
  InputKind,
  SettledOutcome,
  UiCommand,
  UiEvent,
  UiState,
} from '../../core/view/ui-controller-types'
import type { PressKind, Tab } from '../../types'
import type { TabView as View } from './core'
import type { PressReply } from './server'
import { POLL_MS } from './settle'
import { copies, drawnRows, entering, instanceAbort, localOuts, tabState } from './tab-state'
import { callTool, cancelTimer, later, READ_TIMEOUT_MS } from './tab-host'
import { revealSelected } from './tab-wake'
import { PAGE, swapPage } from './tab-swap'
import { takeShownRows } from './tab-shown'
import { lastPressKey } from './tab-press'

const hostFacts = (v: View): HostFacts => ({
  isFetchingPrs: v.isFetchingPrs,
  hasAsksBlocker: v.heard !== 'heard',
  lastTypedMessageAt: null,
})

/** The view as the tab draws it: the server's, with the collapses the person made that it does not show yet. */
const drawnView = (v: View, ui: UiState): View => ({ ...v, collapsed: collapsedOf(ui, v) })

/** The tab drawn: the shown tab, or Asks in place of a Status while the view has no Status page, as from an older server. */
export function drawnTab(): ShownTab {
  return tabState.ui.tab === 'overview' && !tabState.view?.statusPage ? 'needsYou' : tabState.ui.tab
}

/** The reveal the controller asked for last, which waits while the row it moved off still leaves. */
let pendingReveal: { id: string; closedId: string | null } | null = null

const isLeaving = (id: string | null) => id !== null && drawnRows.get(id)?.track.state === 'leaving'

/** Whether row `id` waits to open until the row the cursor moved off has left, so the two do not move at once. */
const isOpenHeld = (id: string) => pendingReveal?.id === id && isLeaving(pendingReveal.closedId)

/** The id of the row drawn open on tab `t`: the cursor's row, unless the person collapsed it or it waits for a leave. */
export function openRowId(t: Tab): string | undefined {
  const v = tabState.serverView
  const id = v ? openRowOf(tabState.ui, v, t) : null

  return id === null || isOpenHeld(id) ? undefined : id
}

/** The row tab `t`'s cursor is on. */
export const selectedId = (t: Tab): string | null =>
  tabState.serverView ? selectedOf(tabState.ui, tabState.serverView, t) : null

/** Scrolls to the row the controller revealed, once it draws open. tab.tsx calls it after each draw. */
export function afterDraw() {
  if (pendingReveal === null || isLeaving(pendingReveal.closedId)) return
  pendingReveal = null
  revealSelected()
}

/** A refused press's text on row `id`, while it shows. */
export const errorOf = (id: string): string | null => rowErrorOf(tabState.ui, id, Date.now())

/** Whether a press by `by` on row `id` falls in the guard of the input that opened it. */
export const isGuarded = (id: string, by: InputKind): boolean =>
  isGuardedPress(tabState.ui, tabState.ui.tab, id, by, Date.now())

/** One timer: it reads the view again when the view changes on the clock, and otherwise ticks the controller. */
let wake: { at: number; isRead: boolean; timer: number } | null = null
const WAKE_SLACK_MS = 20

function schedule(at: number | null) {
  const v = tabState.serverView
  if (tabState.isDisposed || !v) return
  const readAt = at === null ? null : readWakeAt(tabState.ui, v, Date.now())
  const isRead = readAt !== null && at !== null && readAt <= at
  if (wake && wake.at === at && wake.isRead === isRead) return
  if (wake) cancelTimer(wake.timer)
  wake = null
  if (at === null) return
  wake = { at, isRead, timer: later(onWake, Math.max(0, at - Date.now()) + WAKE_SLACK_MS) }
}

function onWake() {
  const isRead = wake?.isRead === true
  wake = null
  if (isRead) void read()
  else dispatch([{ type: 'tick' }])
}

/** What the drawing code passes with a press: the press's pending Local result and the plan action's kind. */
type LocalPress = { pending: Feedback | null; kind: PressKind | null }
const NO_LOCAL: LocalPress = { pending: null, kind: null }
let pressing: LocalPress = NO_LOCAL

/** Presses `press` through the controller, which refuses a repeat, a blank reply or a guarded press. */
export function pressRow(press: RowPress | PrPress, by: InputKind, local: LocalPress = NO_LOCAL) {
  pressing = local
  try {
    dispatch([{ type: 'press', press, by }])
  } finally {
    pressing = NO_LOCAL
  }
}

/** Runs `events` through the shared controller on the server's view, runs their commands, and draws unless told not to. */
export function dispatch(events: UiEvent[], { isDrawn = true } = {}) {
  const v = tabState.serverView
  if (tabState.isDisposed || !v || events.length === 0) return
  const now = Date.now()
  let ui = tabState.ui
  const commands: UiCommand[] = []
  let wakeAt: number | null = null
  for (const event of events) {
    const step = reduceUi(ui, v, event, now)
    ui = step.ui
    commands.push(...step.commands)
    wakeAt = step.nextWakeAt
  }
  tabState.ui = ui
  tabState.view = drawnView(v, ui)
  schedule(wakeAt)
  for (const c of commands) run(c)
  if (isDrawn) tabState.draw()
}

function run(c: UiCommand) {
  if (c.kind === 'press') void runPress(c)
  else if (c.kind === 'save-collapse') saveCollapse(c.id, c.isCollapsed)
  else if (c.kind === 'read') {
    // A view asked for before this did not carry the new holds, so it would draw a held row's close as final.
    tabState.shown = ++tabState.requested
    void read()
  } else if (c.kind === 'focus-field') tabState.focusField = c.id
  else if (c.kind === 'reveal') pendingReveal = { id: c.id, closedId: c.closedId }
}

async function runPress(c: Extract<UiCommand, { kind: 'press' }>) {
  const generation = tabState.viewGeneration
  const v = tabState.serverView
  const rowId = pressRowId(c.press)
  localOuts.set(c.pressId, { rowId, ...pressing, lastBefore: lastPressKey(v, rowId) })
  copies.delete(rowId)
  tabState.activePresses++
  let outcome: SettledOutcome
  let next: View | null = null
  try {
    const r = await callTool<PressReply>(
      'inbox_press',
      { press: c.press, thread: v?.thread, demo: tabState.isDemo, ...c.holds, when: c.when },
      PRESS_TIMEOUT_MS,
    )
    if (r.copy) copies.set(rowId, r.copy)
    outcome = { error: r.error, note: r.note, isUnconfirmed: r.delivery === 'unconfirmed' }
    next = r.view ?? null
  } catch {
    outcome = { error: 'Not confirmed: the inbox did not answer.', note: null, isUnconfirmed: false }
  } finally {
    localOuts.delete(c.pressId)
    tabState.activePresses--
  }
  if (tabState.isDisposed || generation !== tabState.viewGeneration) return
  const settled: UiEvent = { type: 'press-settled', pressId: c.pressId, outcome }
  // A new request number, so this view replaces any view a poll read while the press was out.
  if (next) applyView(next, ++tabState.requested, [settled])
  else dispatch([settled])
}

/** Saves a collapse. The controller draws it collapsed until a view shows it, whatever order the answers come in. */
function saveCollapse(id: string, isCollapsed: boolean) {
  const generation = tabState.viewGeneration
  const seq = ++tabState.requested
  callTool<PressReply>('inbox_press', {
    press: { action: 'collapse', id, isCollapsed },
    thread: tabState.serverView?.thread,
    demo: tabState.isDemo,
    ...holdsOf(tabState.ui, Date.now()),
  })
    .then(r => {
      if (!tabState.isDisposed && generation === tabState.viewGeneration && r.view) applyView(r.view, seq)
    })
    .catch(() => undefined)
}

/** Draws the view the page read last with the controller's state as it is now, as a swap restores that state. */
export function redrawView() {
  if (tabState.serverView) tabState.view = drawnView(tabState.serverView, tabState.ui)
}

/** Set on a page with nothing kept, so its first read opens the inbox with no tab the person chose. */
let isFreshOpen = false

export function openFresh() {
  isFreshOpen = true
}

/** Marks the rows each list tab records for the first time since the last read, so they grow in. */
function markEntering(before: UiState['rowsSeen'], after: UiState['rowsSeen']) {
  for (const t of ['needsYou', 'findings'] as const) {
    const was = before[t]
    if (was === undefined) continue
    for (const id of after[t] ?? []) if (!was.includes(id)) entering.add(id)
  }
}

/** Takes a view the server sent: the controller reads it, with the answers to presses it carries, and the tab draws it. */
function applyView(next: View, seq: number, answers: UiEvent[] = []) {
  if (tabState.isDisposed || seq < tabState.shown) return
  tabState.shown = seq
  tabState.readError = null
  tabState.pollFailures = 0
  tabState.readAt = Date.now()
  tabState.serverView = next
  const isVisible = document.visibilityState === 'visible'
  const events: UiEvent[] = [
    ...(isFreshOpen ? [{ type: 'opened', isFirst: true } as const] : []),
    ...(isVisible === tabState.ui.isVisible ? [] : [{ type: 'visible', isVisible } as const]),
    { type: 'read', host: hostFacts(next) },
    ...answers,
  ]
  isFreshOpen = false
  const before = tabState.ui.rowsSeen
  dispatch(events, { isDrawn: false })
  markEntering(before, tabState.ui.rowsSeen)
  tabState.isReadDraw = true
  try {
    tabState.draw()
  } finally {
    tabState.isReadDraw = false
  }
}

export async function read() {
  const generation = tabState.viewGeneration
  const seq = ++tabState.requested
  try {
    const next = await callTool<View>(
      'inbox_view',
      { demo: tabState.isDemo, tab: tabState.ui.tab, ...holdsOf(tabState.ui, Date.now()), shownRows: takeShownRows() },
      READ_TIMEOUT_MS,
    )
    if (generation !== tabState.viewGeneration || seq < tabState.shown) return
    tabState.requestedPage = next.devPage
    if (tabState.updateError?.page !== tabState.requestedPage) tabState.updateError = null
    const isPageOld = tabState.requestedPage !== PAGE
    if (isPageOld && !tabState.updateError) void swapPage(tabState.requestedPage)
    tabState.serverNote = next.isPluginFolderGone
      ? {
          text: 'Quit and reopen Codex to load the installed inbox. Its files were moved or removed, so it still runs the version Codex started with.',
          kind: 'server-gone',
        }
      : next.serverLoadError
        ? {
            text: `The inbox server could not load its new build, so it still runs the last one. ${next.serverLoadError}`,
            kind: 'server-load-failed',
          }
        : next.serverBuild !== SERVER_BUILD && !isPageOld
          ? { text: 'This tab and the inbox server are from different builds.', kind: 'server-builds-differ' }
          : null
    applyView(next, seq)
  } catch (err) {
    if (tabState.isDisposed || generation !== tabState.viewGeneration || seq < tabState.shown) return
    if (tabState.view) tabState.pollFailures++
    else tabState.readError = failureText(err)
    tabState.draw()
  }
}

/** The host rejects with its JSON-RPC error object, not an Error. */
function failureText(err: unknown): string {
  const message =
    typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err)
  const reason =
    clipLabel(
      message
        .replace(/^(Failed|Not done): /, '')
        .replace(/\s+/g, ' ')
        .trim(),
      120,
    ) || 'No reason given'

  return capitalized(/[.!?…]$/.test(reason) ? reason : `${reason}.`)
}

export async function poll() {
  try {
    await read()
  } catch (err) {
    console.error(err)
  } finally {
    later(poll, POLL_MS)
  }
}

/** Starts over on the demo or the real inbox: no state of the other carries over. */
export function resetView() {
  dispatch([{ type: 'reset' }], { isDrawn: false })
  tabState.viewGeneration++
  tabState.serverView = null
  tabState.view = null
  if (wake) cancelTimer(wake.timer)
  wake = null
  pendingReveal = null
  drawnRows.clear()
  localOuts.clear()
  tabState.lastLists = null
}

document.addEventListener(
  'visibilitychange',
  () => {
    if (!tabState.isActive) return
    dispatch([{ type: 'visible', isVisible: document.visibilityState === 'visible' }], { isDrawn: false })
    if (document.visibilityState === 'visible') void read()
  },
  { signal: instanceAbort.signal },
)
