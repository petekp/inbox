import type { SiteScroll, UiScrollInput, UiScrollResult } from 'claude-code'
import type { ShownRows } from './status-children'
import { statusListRows } from './status-page'
import type { StatusPage } from './status-page'
import { unfoldedRows } from './status-page-parts'

/**
 * Where a Status row's first line sits in the terminal pane's tree, from 0 at the top. `end` is a row in the last
 * screenful, which the engine clamps every scroll to, so its line is not known.
 */
type RowTop = number | 'end'

const PLUGIN = 'inbox'

/**
 * What measuring needs from Claude Code: a scroll that brings `key` to the window's top, resolving to whether Claude
 * Code resolved the key at all, and the clock.
 */
export type StatusEngine = { scrollToTop(key: string): Promise<boolean>; now(): Promise<number> }

/** Where each row of `layout` sits, or `unmeasured` when the engine could not resolve a row's key to a line. */
type Measured = { layout: string; tops: Map<string, RowTop> | 'unmeasured'; lastOffset: number }

/** What the pane drew in the look under way, for `takeShownRows` at its end. */
const look: {
  rows: Map<string, number> | 'all'
  measured: Measured | null
  /** The layout being measured, so a redraw of the same layout does not measure it again. */
  measuring: string | null
  /** What the probe under way read, until `probedScroll` answers it. */
  probe: { offset: number; contentRows: number; bodyRows: number } | null
  isProbing: boolean
  scroll: SiteScroll | null
} = { rows: new Map(), measured: null, measuring: null, probe: null, isProbing: false, scroll: null }

/** The rows whose first line is in the window that starts at `offset`. */
function rowsInWindow(m: Measured & { tops: Map<string, RowTop> }, scroll: SiteScroll): string[] {
  const isInWindow = (top: RowTop) =>
    top === 'end' ? scroll.offset >= m.lastOffset : top >= scroll.offset && top < scroll.offset + scroll.bodyRows

  return [...m.tops].flatMap(([id, top]) => (isInWindow(top) ? [id] : []))
}

/** Notes the rows in `scroll`'s window as shown at `now`. A layout the engine could not measure counts every subject, as desktop does. */
function noteWindow(m: Measured, scroll: SiteScroll, now: number) {
  const { tops } = m
  if (tops === 'unmeasured') look.rows = 'all'
  if (look.rows === 'all' || tops === 'unmeasured') return
  for (const id of rowsInWindow({ ...m, tops }, scroll)) look.rows.set(id, now)
}

/**
 * The pane drew the Status `page` at `now`, with the done folds `unfolded` names open. The terminal counts the subject
 * rows in its window as shown, each drawn under the key `status-<id>`. `layout` holds what else moves a row's line, so
 * a new one is measured first, and its rows count once that finishes. The desktop pane cannot say what it scrolled to,
 * so a look there counts every subject.
 */
export function noteStatusDrawn(
  engine: StatusEngine,
  d: {
    look: 'terminal' | 'desktop'
    page: StatusPage
    unfolded: string[]
    scroll: SiteScroll
    layout: unknown
    now: number
  },
) {
  if (d.look === 'desktop') {
    look.rows = 'all'
    return
  }
  const rows = unfoldedRows(statusListRows(d.page), id => d.unfolded.includes(id))
  const ids = rows.flatMap(r => (r.kind === 'subject' ? [r.id] : []))
  const layout = JSON.stringify([d.layout, d.page, d.unfolded, d.scroll.bodyRows])
  const { scroll, now } = d
  look.scroll = scroll
  if (look.measured?.layout === layout) return noteWindow(look.measured, scroll, now)
  if (look.measuring === layout) return
  look.measuring = layout
  void measure(engine, layout, ids).catch(() => undefined)
}

/**
 * Finds each row's first line by asking the engine to scroll it to the window's top, and refusing the move in
 * `probedScroll`. The engine resolves the key to a row before any hook reads the move, and a refused move leaves the
 * window where it was. A scroll the engine fails, rather than refuses, means it cannot resolve keys at all.
 */
async function measure(engine: StatusEngine, layout: string, ids: string[]) {
  let tops: Measured['tops'] = new Map()
  let lastOffset = 0
  for (const id of ids) {
    if (look.measuring !== layout) return
    look.probe = null
    look.isProbing = true
    const isResolved = await engine.scrollToTop(`status-${id}`)
    look.isProbing = false
    if (!isResolved) {
      tops = 'unmeasured'
      break
    }
    const p = look.probe as { offset: number; contentRows: number; bodyRows: number } | null
    if (p === null) continue
    lastOffset = Math.max(0, p.contentRows - p.bodyRows)
    tops.set(id, p.offset < lastOffset ? p.offset : 'end')
  }
  if (look.measuring !== layout) return
  look.measured = { layout, tops, lastOffset }
  look.measuring = null
  if (look.scroll) noteWindow(look.measured, look.scroll, await engine.now())
}

/** The answer to a scroll this file's probe asked for: refused, with where it would have gone noted. Null for any other scroll. */
export function probedScroll(e: UiScrollInput): UiScrollResult | null {
  if (!look.isProbing || e.origin.kind !== 'plugin' || e.origin.name !== PLUGIN) return null
  look.probe = { offset: e.offset, contentRows: e.contentRows, bodyRows: e.bodyRows }

  return { deny: 'measuring where the Status rows sit' }
}

/** The rows the look that just ended showed, and a measurement under way stops. The next look starts with none. */
export function takeShownRows(): ShownRows {
  const rows = look.rows === 'all' ? 'all' : Object.fromEntries(look.rows)
  look.rows = new Map()
  look.measuring = null

  return rows
}
