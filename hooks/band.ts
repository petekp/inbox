import type { Tab } from '../types'
import { MAYBE_STALE_TEXT } from './banners'
import type { SessionView } from './session-view'
import { ROW_TABS } from './tabs'

/**
 * Whether the asks and findings may be missing some: an update failed or is being retried, or the host could not
 * read the inbox's saved rows.
 */
export function isMaybeStale(view: Pick<SessionView, 'status'>, isReadFailed = false): boolean {
  return isReadFailed || view.status.error !== null || view.status.isRetrying
}

/** The band's counts: each row tab that has something waiting on the person, in tab order. */
export function bandCounts(view: Pick<SessionView, Tab>): { id: Tab; label: string; count: number }[] {
  return ROW_TABS.map(t => ({ id: t.id, label: t.label, count: view[t.id].count })).filter(c => c.count > 0)
}

/** What the band reads when no tab has a count. */
export function noCountsText(view: Pick<SessionView, 'status'>, isReadFailed = false): string {
  return isMaybeStale(view, isReadFailed) ? MAYBE_STALE_TEXT : 'Nothing needed'
}
