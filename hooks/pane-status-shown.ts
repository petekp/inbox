import type { SiteScroll } from 'claude-code'
import type { Lines, RowTop } from './pane-status-tops'

/** When each Status subject row was last on screen in the look under way. */
let rows = new Map<string, number>()

/**
 * The lines of the pane's tree that the windows drawn since `since` showed between them, on a page laid out as `layout`
 * says. Each window overlapped the windows before it by a line and the page top's range, since each window's offset may
 * be off by half that range. A move that overlaps less, as the End key makes, or a draw whose page top or rows moved,
 * starts it again.
 */
let covered: { from: number; to: number; since: number; layout: string } | null = null

/**
 * The pane drew the Status at `now`: `pageTop` is the line of the pane's tree the Status page starts on, and `tops` each
 * subject row's first line from there, as the drawing counts them. A row counts as shown at `now` when its first line
 * is surely whole in the window. A row whose first line is surely in the lines the windows covered counts as shown at
 * `since`, since a draw showed it after then. A row whose line is not counted, and every row when `pageTop` is not
 * counted, counts as shown when `isUnplacedShown`, and is left out otherwise.
 */
export function noteStatusDrawn(d: {
  pageTop: Lines | null
  tops: Map<string, RowTop>
  scroll: SiteScroll
  now: number
  isUnplacedShown: boolean
}) {
  const { pageTop, scroll, now } = d
  const from = scroll.offset
  const to = scroll.offset + scroll.bodyRows
  const layout = JSON.stringify([pageTop, [...d.tops]])
  const pageTopRange = pageTop ? pageTop.most - pageTop.least : 0
  const isJoined =
    covered !== null &&
    covered.layout === layout &&
    Math.min(to, covered.to) - Math.max(from, covered.from) >= 1 + pageTopRange
  const window =
    covered && isJoined
      ? { from: Math.min(from, covered.from), to: Math.max(to, covered.to), since: covered.since, layout }
      : { from, to, since: now, layout }
  covered = window
  for (const [id, top] of d.tops) {
    if (top === 'unknown' || pageTop === null) {
      if (d.isUnplacedShown) rows.set(id, now)
      continue
    }
    const least = pageTop.least + top.least
    const most = pageTop.most + top.most
    const isInWindow = least >= from && most + 1 <= to
    const isCovered = least >= window.from && most + 1 <= window.to
    if (isInWindow) rows.set(id, now)
    else if (isCovered) rows.set(id, Math.max(rows.get(id) ?? 0, window.since))
  }
}

/** The rows the look that just ended showed. The next look starts with none. */
export function takeShownRows(): Record<string, number> {
  const shown = Object.fromEntries(rows)
  rows = new Map()
  covered = null

  return shown
}
