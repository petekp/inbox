import { HERDR_CHECK_MS } from '../../core/remote/herdr'
import { PR_POLL_MS } from '../../core/runtime/host-prs'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import { READING_TEXT } from '../../core/view/banners'
import type { Holds } from '../../core/view/timing'
import type { ShownTab } from '../../core/view/tabs'
import { notesOf, restoredUi } from '../../core/view/ui-controller'
import { holdsOf } from '../../core/view/ui-controller-reply'
import { readWakeAt } from '../../core/view/ui-controller-clock'
import type { HostFacts, SettledOutcome, UiCommand, UiEvent, UiState } from '../../core/view/ui-controller-types'
import type { RowNote } from '../../types'
import { INITIAL_UI, NO_LOCAL, OMP_LOOK, drawPanel, sharedOf, tallestTabHeight } from './panel'
import type { LocalPress, PanelScreen, PanelUi, Style } from './panel'
import { applyEvents, handleKey } from './panel-keys'
import type { KeyResult } from './panel-keys'

/** What the panel needs from a session, so the live inbox and the demo can both supply it. */
export type PanelSource = {
  screen(holds: Holds, notes: Record<string, RowNote>): Promise<PanelScreen>
  /** Applies a press. `pressId` is the shared controller's, which the demo's stand-in reply answers to. */
  press(p: RowPress | PrPress, holds: Holds, pressId: number): Promise<SettledOutcome>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(): Promise<string | null>
  /** Answers the question before omp installs the inbox's Herdr mod. */
  answerHerdr?(isYes: boolean): Promise<void>
  /** Saves the row `id` as collapsed or expanded. */
  collapse(id: string, isCollapsed: boolean): Promise<void>
  /** The controller state an earlier panel of this session kept, or null. */
  savedUi(): Promise<UiState | null>
  /** Keeps `ui` for the next panel, and holds the rows `holds` names in place while no panel is open. */
  keepUi(ui: UiState, holds: Holds): void
  /** Sends the demo's stand-in reply to press `pressId`. */
  demoReply?(pressId: number): void
  fetchPrsWhenDue(isTabShown: boolean): void
  /** Asks Herdr about the running delegates, when a check is due. */
  checkDelegatesWhenDue(): void
  /**
   * Tells the session which tab the panel shows, for the inbox model's note on what the person sees, and what the
   * panel holds in place, from when it began showing that tab.
   */
  shown(tab: ShownTab, holds: Holds): void
  /** Tells the session which Status subject rows the panel has on screen now, for the look under way. */
  showedRows(ids: string[]): void
  /** Calls `listener` after the session's saved state changes. Returns how to stop. */
  onChange(listener: () => void): () => void
}

type PanelDeps = {
  source: PanelSource
  style: Style
  now(): number
  /** When the person asked for the panel. Its first tab shows from then, so a row the demo closes as it starts stays. */
  openedAt: number
  requestRender(): void
  /** Closes the panel. */
  close(): void
  timers: {
    every(fn: () => void, ms: number): unknown
    after(fn: () => void, ms: number): unknown
    stop(handle: unknown): void
  }
  /** The rows the terminal has, or undefined when the panel may grow. */
  height(): number | undefined
}

type Panel = {
  render(width: number): string[]
  /** `key` is the parsed key name and `text` the printable text the key types. */
  handleInput(key: string, text?: string): void
  start(): Promise<void>
  dispose(): void
}

const hostFacts = (screen: PanelScreen): HostFacts => ({
  isFetchingPrs: screen.isFetchingPrs,
  hasAsksBlocker: screen.stop !== null,
  lastTypedMessageAt: null,
})

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Whether the rows `ui` holds for its drafts and discards changed since `before`, so the session should keep them. */
const isKeptChanged = (before: UiState, ui: UiState) =>
  ui.drafts !== before.drafts ||
  ui.typing !== before.typing ||
  ui.discarded !== before.discarded ||
  ui.sentReplies !== before.sentReplies

/**
 * The open panel: the cached screen and the person's ui state, which the shared controller runs. One timer wakes the
 * panel when the controller says something changes on the clock: it reads the session again only when the view
 * changes, and otherwise redraws a running mark's frame or a title's tint step.
 */
/** How long a failed read waits before the panel reads again. */
const READ_RETRY_MS = 1000

export function createPanel(deps: PanelDeps): Panel {
  const { source, style, timers } = deps
  let ui: PanelUi = { ...INITIAL_UI, shownSince: deps.openedAt }
  let screen: PanelScreen | null = null
  let wake: { at: number; isRead: boolean; timer: unknown } | null = null
  let version = 0
  let isLoaded = false
  let isDisposed = false
  /**
   * Answers to presses, which the next read applies after the screen it reads. The host saves a press's change before
   * it answers, so that screen shows the change while the press still counts as out, and a close the person pressed
   * moves the cursor at once.
   */
  const settled: UiEvent[] = []
  /**
   * The panel's height while it is open: its tallest tab's when it opens, and after that only taller, so the session
   * above it stays still as tabs switch and rows grow or close.
   */
  let heldHeight: number | null = null
  const stops: (() => void)[] = []

  function schedule(at: number | null): void {
    if (isDisposed || screen === null) return
    const readAt = at === null ? null : readWakeAt(ui, screen.view, deps.now())
    const isRead = readAt !== null && at !== null && readAt <= at
    if (wake !== null && wake.at === at && wake.isRead === isRead) return
    if (wake !== null) timers.stop(wake.timer)
    wake = null
    if (at === null) return
    wake = { at, isRead, timer: timers.after(onWake, Math.max(0, at - deps.now())) }
  }

  function onWake(): void {
    const isRead = wake?.isRead === true
    wake = null
    if (isRead) void refresh()
    else {
      apply([{ type: 'tick' }])
      deps.requestRender()
    }
  }

  /** Reads again after `READ_RETRY_MS`, or at the wake already due sooner, so the clock goes on after a failed read. */
  function retryRead(): void {
    if (isDisposed || screen === null) return
    const at = deps.now() + READ_RETRY_MS
    if (wake !== null && wake.at <= at) {
      wake.isRead = true
      return
    }
    if (wake !== null) timers.stop(wake.timer)
    wake = { at, isRead: true, timer: timers.after(onWake, READ_RETRY_MS) }
  }

  /** Takes a step's state, keeps what the session holds for it, and runs its commands. */
  function settle(result: KeyResult): void {
    const before = ui
    ui = result.ui
    if (isKeptChanged(before, ui)) source.keepUi(sharedOf(ui), holdsOf(ui, deps.now()))
    schedule(result.nextWakeAt)
    for (const c of result.commands) run(c)
  }

  function apply(events: UiEvent[], now = deps.now()): void {
    if (screen !== null && !isDisposed) settle(applyEvents(screen, ui, events, now))
  }

  function run(c: UiCommand): void {
    if (c.kind === 'press') void runPress(c.pressId, c.press, c.holds)
    else if (c.kind === 'save-collapse') void source.collapse(c.id, c.isCollapsed).then(() => refresh())
    else if (c.kind === 'read') void refresh()
    else if (c.kind === 'tab-shown') source.shown(c.tab, holdsOf(ui, deps.now()))
    else if (c.kind === 'demo-reply') source.demoReply?.(c.pressId)
    // An open field and the selected row draw on every render, so focus-field and reveal need nothing more.
  }

  async function runPress(pressId: number, p: RowPress | PrPress, holds: Holds): Promise<void> {
    const outcome = await source
      .press(p, holds, pressId)
      .catch((err: unknown): SettledOutcome => ({ error: errorText(err), note: null, isUnconfirmed: false }))
    settled.push({ type: 'press-settled', pressId, outcome })
    await refresh()
  }

  /** Reads the session's latest screen, applies the answers to presses since the last read, and draws. */
  async function refresh(): Promise<void> {
    const mine = ++version
    const next = await source.screen(holdsOf(ui, deps.now()), notesOf(ui)).catch(() => null)
    if (mine !== version || isDisposed) return
    if (next === null) {
      if (screen && !screen.isReadFailed) {
        screen = { ...screen, isReadFailed: true }
        deps.requestRender()
      }
      retryRead()
      return
    }
    const isFirst = screen === null
    screen = next
    if (isFirst) apply([{ type: 'opened' }], deps.openedAt)
    apply([{ type: 'read', host: hostFacts(next) }, ...settled.splice(0)])
    if (isFirst) source.shown(ui.tab, holdsOf(ui, deps.now()))
    deps.requestRender()
  }

  async function localPress(p: LocalPress): Promise<void> {
    if (p.action === 'herdr-ask') return source.answerHerdr?.(p.isYes).then(() => refresh())
    const why = await source.resume().catch(errorText)
    if (why !== null && ui.resuming?.is === 'sending')
      ui = { ...ui, resuming: { stopAt: ui.resuming.stopAt, is: 'refused', why } }
    await refresh()
  }

  return {
    render(width) {
      if (screen === null) return [` ${READING_TEXT}`]
      const now = deps.now()
      const maxHeight = deps.height()
      heldHeight ??= tallestTabHeight(screen, ui, width, now, style, maxHeight)
      const drawn = drawPanel(screen, ui, width, now, style, maxHeight, Math.min(heldHeight, maxHeight ?? Infinity))
      heldHeight = Math.max(heldHeight, drawn.lines.length)
      if (drawn.shownSubjects.length > 0) source.showedRows(drawn.shownSubjects)
      // A reveal waits for a draw that has its target, as after Remove, whose Undo and New buttons come with the next screen.
      ui = { ...ui, pageTop: drawn.pageTop, pageReveal: drawn.isRevealed ? null : ui.pageReveal }

      return drawn.lines
    },
    handleInput(key, text) {
      if (screen === null || isDisposed) return
      const result = handleKey(screen, ui, key, deps.now(), text)
      settle(result)
      if (result.close) deps.close()
      if (result.press) void localPress(result.press)
      deps.requestRender()
    },
    async start() {
      const saved = await source.savedUi().catch(() => null)
      if (isDisposed) return
      if (saved) ui = { ...restoredUi({ ...saved, config: OMP_LOOK }), ...NO_LOCAL, shownSince: deps.openedAt }
      isLoaded = true
      stops.push(source.onChange(() => void refresh()))
      const prs = timers.every(() => source.fetchPrsWhenDue(ui.tab === 'prs'), PR_POLL_MS)
      stops.push(() => timers.stop(prs))
      const delegates = timers.every(() => {
        if (ui.tab === 'overview') source.checkDelegatesWhenDue()
      }, HERDR_CHECK_MS)
      stops.push(() => timers.stop(delegates))
      await refresh()
    },
    dispose() {
      if (screen !== null) ui = applyEvents(screen, ui, [{ type: 'closed' }], deps.now()).ui
      version++
      isDisposed = true
      for (const stop of stops.splice(0)) stop()
      if (wake !== null) timers.stop(wake.timer)
      wake = null
      if (isLoaded) source.keepUi(sharedOf(ui), holdsOf(ui, deps.now()))
    },
  }
}
