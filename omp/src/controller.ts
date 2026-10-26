import { prRowId } from '../../hooks/pr-tab'
import type { PrPress } from '../../hooks/pr-tab'
import type { RowPress } from '../../hooks/presses'
import { READING_TEXT, compareEndsAt, RUNNING_FRAME_MS } from '../../hooks/view'
import type { ReplyHolds, ShownTab } from '../../hooks/view'
import {
  INITIAL_UI,
  afterHandOff,
  drawPanel,
  followRows,
  handleKey,
  holdsOf,
  isAnimating,
  isLineWaiting,
  isRunningMarkShown,
  noticeFor,
  render,
} from './panel'
import type { PanelPress, PanelScreen, PanelUi, SeenRows, Style } from './panel'

const ANIMATION_MS = 200
const PRS_CHECK_MS = 120_000

/** What the panel needs from a session, so the live inbox and the demo can both supply it. */
export type PanelSource = {
  screen(holds: ReplyHolds): Promise<PanelScreen>
  press(p: RowPress | PrPress, holds: ReplyHolds): Promise<{ error: string | null; note: 'stale' | null }>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(): Promise<string | null>
  fetchPrsWhenDue(): void
  /** Tells the session which tab the panel shows, for the inbox model's note on what the person sees. */
  shown(tab: ShownTab): void
  /** Calls `listener` after the session's saved state changes. Returns how to stop. */
  onChange(listener: () => void): () => void
}

export type PanelDeps = {
  source: PanelSource
  style: Style
  now(): number
  requestRender(): void
  /** Closes the panel. */
  close(): void
  timers: { every(fn: () => void, ms: number): unknown; stop(handle: unknown): void }
  /** The rows the terminal has, or undefined when the panel may grow. */
  height(): number | undefined
}

export type Panel = {
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
  let ui: PanelUi = INITIAL_UI
  let screen: PanelScreen | null = null
  let animation: unknown = null
  /** Redraws without reading the session again, since a running mark's frame needs only the clock. */
  let frames: unknown = null
  let compareEnd: { at: number; timer: unknown } | null = null
  let version = 0
  let seen: SeenRows = {}
  let isOpening = true
  const stops: (() => void)[] = []

  const syncAnimation = () => {
    const isMoving = screen !== null && isAnimating(screen, ui, deps.now())
    if (isMoving && animation === null) animation = timers.every(() => void refresh(), ANIMATION_MS)
    if (!isMoving && animation !== null) {
      timers.stop(animation)
      animation = null
    }
    const hasFrames = screen !== null && isRunningMarkShown(screen, ui)
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
    source.shown(ui.tab)
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
    const rowId = 'ref' in p ? prRowId(p) : p.id
    const wasWaiting = screen !== null && isLineWaiting(screen, ui, rowId, deps.now())
    const outcome = await source.press(p, holdsOf(ui)).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : String(err),
      note: null,
    }))
    const now = deps.now()
    if (!('ref' in p) && p.action === 'type' && outcome.note === 'stale')
      ui = { ...ui, drafts: { ...ui.drafts, [p.id]: { text: p.text, since: now } } }
    const notice = noticeFor(outcome, now)
    if (notice) ui = { ...ui, notice }
    await refresh(wasWaiting ? rowId : undefined)
  }

  return {
    render(width) {
      if (screen === null) return [` ${READING_TEXT}`]
      const drawn = drawPanel(screen, ui, width, deps.now(), style, deps.height())
      ui = { ...ui, pageTop: drawn.pageTop }

      return drawn.lines
    },
    handleInput(key, text) {
      if (screen === null) return
      const result = handleKey(screen, ui, key, deps.now(), text)
      ui = result.ui
      source.shown(ui.tab)
      if (result.close) deps.close()
      if (result.press) void press(result.press)
      else void refresh()
      deps.requestRender()
    },
    async start() {
      stops.push(source.onChange(() => void refresh()))
      const prs = timers.every(() => source.fetchPrsWhenDue(), PRS_CHECK_MS)
      stops.push(() => timers.stop(prs))
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
