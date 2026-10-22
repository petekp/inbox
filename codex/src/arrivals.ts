import {
  closedGroups,
  isPrsTabEmpty,
  isTabEmpty,
  listedRowIds,
  openRowIds,
  prRowIds,
  recordRows,
} from '../../hooks/arrivals'
import type { ListedTab, RowRecord } from '../../hooks/arrivals'
import type { Tab } from '../../types'
import type { SessionView } from '../../hooks/session'
import type { InboxView } from '../../hooks/view'
import type { HeardState } from './core'

export type Group = 'question' | 'task' | 'finding'
export type FoldGroup = 'question' | 'task' | 'issue' | 'opportunity'

export const TAB_OF: Record<Group, ListedTab> = { question: 'needsYou', task: 'needsYou', finding: 'findings' }

export type SeenRows = RowRecord<Tab>

export function openRows(v: InboxView): Record<Tab, string[]> {
  return { ...openRowIds(v), prs: [] }
}

export function newRows(
  seen: SeenRows,
  v: SessionView,
  isFetchingPrs: boolean,
): { seen: SeenRows; added: Record<Tab, string[]> } {
  return recordRows(seen, { ...listedRowIds(v), prs: isFetchingPrs ? null : prRowIds(v.prs.drawn) })
}

export function isShownEmpty(
  v: SessionView & { heard: HeardState },
  t: Tab,
  drawn: ReadonlySet<string>,
  unfolded: ReadonlySet<FoldGroup>,
  isFetchingPrs: boolean,
): boolean {
  if (t === 'prs') return isPrsTabEmpty(v.prs.drawn.length, isFetchingPrs)

  return isTabEmpty({
    rows: t === 'findings' ? v.findings.rows : [...v.needsYou.questions, ...v.needsYou.tasks],
    settled: drawn,
    closed: closedGroups(v, t, kind => unfolded.has(kind)),
    hasBlocker: t === 'needsYou' && v.heard !== 'heard',
  })
}
