/** The shared value that keeps the panel's last width at zoom 1, which Herdr saves across restarts. */
const WIDTH_KEY = 'inbox.paneWidth'
/** A new panel this close to the kept width is left as Herdr split it. */
const CLOSE_ENOUGH = 8
/** How long a width holds before it is kept, so a drag or a window resize writes once. */
const SETTLE_MS = 400

/**
 * The panel's own pane. A panel a layout or a header places is told its pane in `props`, but one `/inbox` splits is
 * not, so it is the inbox pane in the tab the panel follows.
 */
export function ownPaneOf(
  propsPane: unknown,
  panes: readonly { pane: string; mod?: string; tab: string }[],
  tab: string | null,
): string | null {
  if (typeof propsPane === 'string') return propsPane

  return panes.find(p => p.mod === 'inbox' && p.tab === tab)?.pane ?? null
}

/** The Herdr app's calls the panel's width needs, which `main.ts` passes in. */
type PaneWidthCalls = {
  pane: () => unknown
  zoom: () => number
  shared: (key: string) => unknown
  setShared: (key: string, value: unknown) => unknown
  run: (name: string, args: Record<string, unknown>) => unknown
}

type Timers = { timer: { after: (ms: number, fire: () => void) => { cancel(): void } } }

/**
 * Gives the panel the width the person last left it at. `/inbox` splits a new panel at half the terminal's pane, so
 * the panel's first measured width is moved to the kept one with `pane.resize`, and each width the panel settles at
 * after that is kept for the next panel.
 */
export class PaneWidth {
  private isRestored = false
  private keepTimer: { cancel(): void } | null = null

  constructor(private readonly calls: PaneWidthCalls) {}

  measured(width: number, cx: Timers): void {
    const pane = this.calls.pane()
    if (typeof pane !== 'string' || !Number.isFinite(width) || width <= 0) return
    const zoom = this.calls.zoom()
    const atZoom1 = Math.round(width / zoom)
    const kept = this.calls.shared(WIDTH_KEY)
    if (!this.isRestored) {
      this.isRestored = true
      if (typeof kept === 'number' && Math.abs(kept - atZoom1) >= CLOSE_ENOUGH) {
        const direction = kept > atZoom1 ? 'left' : 'right'
        this.calls.run('pane.resize', { pane, direction, px: Math.round(Math.abs(kept - atZoom1) * zoom) })
        return
      }
    }
    this.keepTimer?.cancel()
    this.keepTimer = cx.timer.after(SETTLE_MS, () => {
      if (this.calls.shared(WIDTH_KEY) !== atZoom1) this.calls.setShared(WIDTH_KEY, atZoom1)
    })
  }
}
