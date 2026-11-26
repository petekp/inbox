import { viewLimitError } from '../view-limits'
import { foldAll } from '../../../core/view/fold-all'
import { NEEDS_YOU_GROUPS } from '../../../core/view/rows'
import { FINDING_GROUPS } from '../../../core/view/help'
import type { FoldKind } from '../../../types'
import type { changeFolds as ChangeFolds } from '../client-shared'

const isFoldKind = (id: string): id is FoldKind =>
  NEEDS_YOU_GROUPS.some(group => group.kind === id) || Object.hasOwn(FINDING_GROUPS, id)
const kindOf = (id: string): FoldKind | null =>
  NEEDS_YOU_GROUPS.find(group => group.list === id)?.kind ?? (isFoldKind(id) ? id : null)
const idOf = (kind: FoldKind): string => NEEDS_YOU_GROUPS.find(group => group.kind === kind)?.list ?? kind

export const changeFolds: typeof ChangeFolds = ([signature, session, plan, place, mode]) => {
  if (!['toggle', 'open', 'close'].includes(mode)) throw new Error('Unknown fold action.')
  const change = foldAll(
    { ...plan, closed: plan.closed.filter(isFoldKind) },
    {
      unfolded: place.folds.flatMap(id => {
        const kind = kindOf(id)
        return kind ? [kind] : []
      }),
      statusUnfolded: place.folds.filter(id => kindOf(id) === null),
      collapsed: place.collapsed,
    },
    mode === 'toggle' ? null : mode === 'open',
  )
  const collapsed = new Set(place.collapsed)
  const records = new Map(place.collapses.map(entry => [entry.id, entry.value]))
  const captures = new Map(plan.records.map(entry => [entry.id, entry.value]))
  for (const row of change.collapses) {
    const capture = captures.get(row.id)
    if (row.isCollapsed && capture) {
      collapsed.add(row.id)
      records.set(row.id, capture)
    } else {
      collapsed.delete(row.id)
      records.delete(row.id)
    }
  }
  const result = {
    signature,
    session,
    error: '',
    folds: [...change.unfolded.map(idOf), ...change.statusUnfolded],
    collapsed: [...collapsed],
    collapses: [...records].filter(([id]) => collapsed.has(id)).map(([id, value]) => ({ id, value })),
  }
  const error = viewLimitError(result)
  return error
    ? { signature, session, error, folds: place.folds, collapsed: place.collapsed, collapses: place.collapses }
    : result
}
