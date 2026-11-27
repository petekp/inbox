import { firstWaiting, openOnArrival } from '../../core/view/action-plan'
import { recordRows } from '../../core/view/arrivals'
import type { advanceSelection as AdvanceSelection } from '../client-shared'

export const advanceSelection: typeof AdvanceSelection = ([signature, inbox, place, before]) => {
  const pick = (
    rows: { id: string; waiting: boolean }[],
    chosen: string,
    previousIds: string[],
    previousIndex: number,
  ) => {
    const ids = rows.map(row => row.id)
    const waits = rows.map(row => ({
      id: row.id,
      isWaiting: row.waiting,
      isCollapsed: place.collapsed.includes(row.id),
    }))
    const remembered = place.collapsed.findLast(id => ids.includes(id))
    const recorded = recordRows(before.signature ? { rows: new Set(previousIds) } : {}, { rows: ids })
    const isLegacyClosed = chosen === 'closed' && !remembered
    if (isLegacyClosed) {
      const arrived = firstWaiting(waits.filter(row => recorded.added.rows.includes(row.id)))
      return { id: arrived ?? 'closed', ids, index: Math.max(0, ids.indexOf(arrived ?? '')) }
    }
    const picked = chosen === 'closed' ? (remembered ?? '') : chosen
    const arrival = openOnArrival(waits, picked || null, recorded.added.rows)
    let next = arrival ?? picked
    if (next && !ids.includes(next)) next = ids[Math.min(previousIndex, ids.length - 1)] ?? ''
    if (!next) next = firstWaiting(waits) ?? ''
    return { id: next, ids, index: Math.max(0, ids.indexOf(next)) }
  }
  const asks = pick(inbox.asks, place.asksExpanded, before.askIds, before.askIndex)
  const finds = pick(inbox.findings, place.findsExpanded, before.findIds, before.findIndex)
  const prs = pick(
    inbox.prLines.filter(row => row.kind === 'thread' || row.kind === 'check'),
    place.prsExpanded,
    before.prIds,
    before.prIndex,
  )
  return {
    prs: prs.id,
    prIds: prs.ids,
    prIndex: prs.index,
    session: inbox.key,
    signature,
    asks: asks.id,
    finds: finds.id,
    askIds: asks.ids,
    findIds: finds.ids,
    askIndex: asks.index,
    findIndex: finds.index,
  }
}
