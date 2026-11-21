import type { Tab } from '../../types'
import { MAYBE_STALE_TEXT, NOTHING_NEEDED_TEXT } from './banners'
import type { SessionView } from './session-view'
import type { LedgerSync } from './sync-state'
import { ROW_TABS } from './tabs'
import { runningMark } from './timing'

/** Whether the asks and findings may be missing some: an update failed or has not run, or the inbox could not be read. */
export function isMaybeStale(ledger: LedgerSync): boolean {
  return ledger.is === 'stale' || ledger.is === 'unavailable'
}

/** The band's counts: each row tab that has something waiting on the person, in tab order. */
export function bandCounts(view: Pick<SessionView, Tab>): { id: Tab; label: string; count: number }[] {
  return ROW_TABS.map(t => ({ id: t.id, label: t.label, count: view[t.id].count })).filter(c => c.count > 0)
}

/**
 * What a look reads where no row waits on the person, in the band and on an empty Asks tab. `isChecking`: an update
 * runs over asks that were not current, so the look draws a running mark after the text, in a place it keeps while
 * no mark shows.
 */
type NothingText = { text: string; isChecking: boolean }

/** What a text look draws after `nothingText`: a space, then the running mark or a space in its place. */
export function nothingMark(isChecking: boolean, now: number): string {
  return ` ${isChecking ? runningMark(now) : ' '}`
}

export function nothingText(ledger: LedgerSync, current: string = NOTHING_NEEDED_TEXT): NothingText {
  return { text: isMaybeStale(ledger) ? MAYBE_STALE_TEXT : current, isChecking: ledger.is === 'checking' }
}
