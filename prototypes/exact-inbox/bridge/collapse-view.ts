import { collapsedRows, settledCollapses, withCollapse } from '../../../core/view/collapse'
import type { RowCollapse, Session } from '../../../types'
import type { Result } from '../app.contract'
import type { StatusOptions } from './status-view'

type Entry = Result<'loadInbox'>['collapses'][number]
export type ViewPreferences = StatusOptions & { collapses: Entry[] }
export const NO_VIEW_PREFERENCES: ViewPreferences = { folds: [], collapsed: [], collapses: [] }

function readCollapse(text: string): RowCollapse {
  if (text.length > 16384) throw new Error('Saved collapse state is too large.')
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved collapse state.')
  const row = value as Record<string, unknown>
  const known = Object.keys(row).every(key => ['at', 'waiting', 'untimedUrl'].includes(key))
  const validTime = typeof row.at === 'number' && Number.isSafeInteger(row.at) && row.at >= 0
  const validUrl = row.untimedUrl === undefined || (typeof row.untimedUrl === 'string' && row.untimedUrl.length <= 8192)
  const validWaiting =
    row.waiting === undefined ||
    (Array.isArray(row.waiting) &&
      row.waiting.length <= 256 &&
      row.waiting.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256))
  if (!known || !validTime || !validUrl || !validWaiting) throw new Error('Invalid saved collapse state.')
  return value as RowCollapse
}

export function collapseProjection(session: Session, preferences: ViewPreferences, now: number) {
  const wanted = new Set(preferences.collapsed)
  const records = Object.fromEntries(
    preferences.collapses.filter(entry => wanted.has(entry.id)).map(entry => [entry.id, readCollapse(entry.value)]),
  )
  const state = settledCollapses({ ...session, collapsed: records })
  const collapsed = collapsedRows(state)
  const collapses = collapsed.map(id => ({ id, value: JSON.stringify(state.collapsed![id]) }))
  const offers = new Map<string, string>()
  const offer = (id: string): string => {
    if (!offers.has(id)) {
      const record = withCollapse({ ...session, collapsed: {} }, id, true, now).collapsed?.[id]
      offers.set(id, record ? JSON.stringify(record) : '')
    }
    return offers.get(id)!
  }
  return {
    state,
    collapsed,
    collapses,
    collapseInput: { ids: preferences.collapsed, entries: preferences.collapses },
    offer,
  }
}
