import type { SiteScroll } from 'claude-code'
import type { RowTop } from './pane-status-tops'
import type { ShownRows } from './status-children'

/** When each Status subject row was last on screen in the look under way, or `all` once a draw could not say. */
let rows: Map<string, number> | 'all' = new Map()

/**
 * The pane drew the Status at `now`. The desktop pane cannot say what it scrolled to, so a look there counts every
 * subject. The terminal counts the subject rows whose first line is in the pane's window: `pageTop` is the line of the
 * pane's tree the Status page starts on, and `tops` each row's line from there, as `statusRowTops` counts them. A row
 * whose line is not known exactly counts as shown, and so does every row when `pageTop` is not known.
 */
export function noteStatusDrawn(
  d:
    | { look: 'desktop' }
    | { look: 'terminal'; pageTop: number | null; tops: Map<string, RowTop>; scroll: SiteScroll; now: number },
) {
  if (d.look === 'desktop') {
    rows = 'all'
    return
  }
  if (rows === 'all') return
  const { pageTop, scroll } = d
  const isInWindow = (top: RowTop) => {
    if (top === 'unknown' || pageTop === null) return true
    const at = pageTop + top
    return at >= scroll.offset && at < scroll.offset + scroll.bodyRows
  }
  for (const [id, top] of d.tops) if (isInWindow(top)) rows.set(id, d.now)
}

/** The rows the look that just ended showed. The next look starts with none. */
export function takeShownRows(): ShownRows {
  const shown = rows === 'all' ? 'all' : Object.fromEntries(rows)
  rows = new Map()

  return shown
}
