import { VIEW_ENTRY_LIMIT, viewLimitError } from '../view-limits'
import { NO_VIEW_PREFERENCES } from './collapse-view'
import type { ViewPreferences } from './collapse-view'

export function viewRequest(value: unknown): {
  session: string
  viewer: string
  since: number
  schema: string | null
  preferences: ViewPreferences
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid view request.')
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some(
      key => !['session', 'viewer', 'since', 'schema', 'folds', 'collapsed', 'collapses'].includes(key),
    )
  )
    throw new Error('Unknown view field.')
  const session = input.session ?? '',
    viewer = input.viewer ?? '',
    since = input.since ?? 0
  const validSession = typeof session === 'string' && (session === '' || /^[a-f0-9]{64}$/.test(session))
  const validViewer = typeof viewer === 'string' && /^[\w-]{0,100}$/.test(viewer)
  if (!validSession || !validViewer || typeof since !== 'number' || !Number.isFinite(since) || since < 0)
    throw new Error('Invalid view identity.')
  const ids = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.length <= VIEW_ENTRY_LIMIT &&
    value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 2048)
  const folds = input.folds ?? NO_VIEW_PREFERENCES.folds,
    collapsed = input.collapsed ?? NO_VIEW_PREFERENCES.collapsed,
    collapses = input.collapses ?? []
  if (
    !ids(folds) ||
    !ids(collapsed) ||
    !Array.isArray(collapses) ||
    collapses.length > VIEW_ENTRY_LIMIT ||
    !collapses.every(
      entry =>
        entry &&
        typeof entry === 'object' &&
        Object.keys(entry).every(key => key === 'id' || key === 'value') &&
        typeof entry.id === 'string' &&
        entry.id.length > 0 &&
        entry.id.length <= 2048 &&
        typeof entry.value === 'string' &&
        entry.value.length <= 16384,
    )
  )
    throw new Error('Invalid view preferences.')
  const limitError = viewLimitError({ folds, collapsed, collapses })
  if (limitError) throw new Error(limitError)
  return {
    session,
    viewer,
    since,
    schema: input.schema === 2 || input.schema === '2' ? '2' : null,
    preferences: { folds, collapsed, collapses },
  }
}
