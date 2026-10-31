import { HERDR_CHECK_MS } from '../../hooks/herdr'
import { isPrPress, pressRowId } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import { isPressConfirmed } from '../../hooks/press-reducer'
import type { RowPress } from '../../hooks/presses'
import { showsRunningMark } from '../../hooks/session-view'
import { READING_TEXT, compareEndsAt, RUNNING_FRAME_MS } from '../../hooks/view'
import type { Holds, ShownTab } from '../../hooks/view'
import { INITIAL_UI, drawPanel, holdsOf, isAnimating, noticeFor, tallestTabHeight } from './panel'
import type { PanelPress, PanelScreen, PanelUi, Style } from './panel'
import { afterHandOff, handleKey, isLineWaiting } from './panel-keys'
import { followRows } from './panel-tabs'
import type { SeenRows } from './panel-tabs'

const ANIMATION_MS = 200
const PRS_CHECK_MS = 120_000

/** What the panel needs from a session, so the live inbox and the demo can both supply it. */
export type PanelSource = {
  screen(holds: Holds): Promise<PanelScreen>
  press(
    p: RowPress | PrPress,
    holds: Holds,
  ): Promise<{ error: string | null; note: 'stale' | null; isUnconfirmed: boolean }>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(): Promise<string | null>
  fetchPrsWhenDue(): void
  /** Asks Herdr about the running delegates, when a check is due. */
  checkDelegatesWhenDue(): void
  /**
   * Tells the session which tab the panel shows, for the inbox model's note on what the person sees, and what the
   * panel holds in place, from when it began showing that tab.
   */
  shown(tab: ShownTab, holds: Holds): void
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
  timers: { every(fn: () => void, ms: number): unknown; stop(handle: unknown): void }
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

/**
 * The open panel: the cached screen, the person's ui state, and the work a key starts. A redraw timer runs only while
 * something on the screen moves by itself.
 */
export function createPanel(deps: PanelDeps): Panel {
  const { source, style, timers } = deps
  let ui: PanelUi = { ...INITIAL_UI, shownSince: deps.openedAt }
  let screen: PanelScreen | null = null
  let animation: unknown = null
  /** Redraws without reading the session again, since a running mark's frame needs only the clock. */
  let frames: unknown = null
  let compareEnd: { at: number; timer: unknown } | null = null
  let version = 0
  let seen: SeenRows = {}
  let isOpening = true
  /**
   * The panel's height while it is open: its tallest tab's when it opens, and after that only taller, so the session
   * above it stays still as tabs switch and rows grow or close.
   */
  let heldHeight: number | null = null
  const stops: (() => void)[] = []

  const syncAnimation = () => {
    const isMoving = screen !== null && isAnimating(screen, ui, deps.now())
    if (isMoving && animation === null) animation = timers.every(() => void refresh(), ANIMATION_MS)
    if (!isMoving && animation !== null) {
      timers.stop(animation)
      animation = null
    }
    const hasFrames =
      screen !== null && showsRunningMark(screen.view, ui.tab, ui.isHelpShown, kind => ui.unfolded.includes(kind))
    if (hasFrames && frames === null) frames = timers.every(() => deps.requestRender(), RUNNING_FRAME_MS)
    if (!hasFrames && frames !== null) {
      timers.stop(frames)
      frames = null
    }
    const now = deps.now()
    const at = screen === null ? null : compareEndsAt(screen.view.lastActions, now)
    if (compareEnd !== null && compareEnd.at !== at) {
      timers.stop(compareEnd.timer)
      compareEnd = null
    }
    if (at !== null && compareEnd === null)
      compareEnd = { at, timer: timers.every(() => void refresh(), at - now + ANIMATION_MS) }
  }

  /** Draws the session's latest screen. `pressedId` names a row that waited before its press, so the selection may move on from it. */
  async function refresh(pressedId?: string): Promise<void> {
    const mine = ++version
    const next = await source.screen(holdsOf(ui)).catch(() => null)
    if (mine !== version || next === null) return
    screen = next
    const followed = followRows(next, ui, seen, isOpening, deps.now())
    ui = pressedId === undefined ? followed.ui : afterHandOff(next, followed.ui, pressedId, deps.now())
    seen = followed.seen
    isOpening = false
    source.shown(ui.tab, holdsOf(ui))
    syncAnimation()
    deps.requestRender()
  }

  async function resume(): Promise<void> {
    const why = await source.resume().catch((err: unknown) => (err instanceof Error ? err.message : String(err)))
    if (why !== null && ui.resuming?.is === 'sending')
      ui = { ...ui, resuming: { stopAt: ui.resuming.stopAt, is: 'refused', why } }
    await refresh()
  }

  async function press(p: PanelPress): Promise<void> {
    if (p.action === 'resume') return resume()
    const rowId = pressRowId(p)
    const wasWaiting = screen !== null && isLineWaiting(screen, ui, rowId, deps.now())
    const sentDraft = !isPrPress(p) && p.action === 'type' ? ui.drafts[p.id] : undefined
    const outcome = await source.press(p, holdsOf(ui)).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : String(err),
      note: null,
      isUnconfirmed: false,
    }))
    const now = deps.now()
    const isDraftUnedited = sentDraft !== undefined && ui.drafts[rowId] === sentDraft
    if (isPressConfirmed(outcome) && isDraftUnedited) {
      const { [rowId]: _sent, ...drafts } = ui.drafts
      ui = { ...ui, drafts }
    }
    const notice = noticeFor(outcome, now)
    if (notice) ui = { ...ui, notice }
    await refresh(wasWaiting ? rowId : undefined)
  }

  return {
    render(width) {
      if (screen === null) return [` ${READING_TEXT}`]
      const now = deps.now()
      const maxHeight = deps.height()
      heldHeight ??= tallestTabHeight(screen, ui, width, now, style, maxHeight)
      const drawn = drawPanel(screen, ui, width, now, style, maxHeight, Math.min(heldHeight, maxHeight ?? Infinity))
      heldHeight = Math.max(heldHeight, drawn.lines.length)
      ui = { ...ui, pageTop: drawn.pageTop, pageReveal: null }

      return drawn.lines
    },
    handleInput(key, text) {
      if (screen === null) return
      const result = handleKey(screen, ui, key, deps.now(), text)
      ui = result.ui
      source.shown(ui.tab, holdsOf(ui))
      if (result.close) deps.close()
      if (result.press) void press(result.press)
      else void refresh()
      deps.requestRender()
    },
    async start() {
      stops.push(source.onChange(() => void refresh()))
      const prs = timers.every(() => source.fetchPrsWhenDue(), PRS_CHECK_MS)
      stops.push(() => timers.stop(prs))
      const delegates = timers.every(() => {
        if (ui.tab === 'overview') source.checkDelegatesWhenDue()
      }, HERDR_CHECK_MS)
      stops.push(() => timers.stop(delegates))
      await refresh()
    },
    dispose() {
      version++
      for (const stop of stops.splice(0)) stop()
      if (animation !== null) timers.stop(animation)
      animation = null
      if (frames !== null) timers.stop(frames)
      frames = null
      if (compareEnd !== null) timers.stop(compareEnd.timer)
      compareEnd = null
    },
  }
}
