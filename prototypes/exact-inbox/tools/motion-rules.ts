import { PRESS_GUARD_MS } from '../../../core/view/timing'
import { stepRow, isMoving, ROW_STATE_MS } from '../../../core/view/row-motion'
import type { RowState, RowTrack, RowTarget } from '../../../core/view/row-motion'
import { recordRows } from '../../../core/view/arrivals'
import type { advanceMotion as AdvanceMotion } from '../client-shared'

const isGuarded = (openedAt: number, now: number) => openedAt > 0 && now - openedAt < PRESS_GUARD_MS

type Frame = ReturnType<typeof AdvanceMotion>
type Visual = Frame['asks'][number]['rows'][number]

const trackOf = (row: Pick<Visual, 'phase' | 'since' | 'hasPanel'> | undefined): RowTrack | undefined =>
  row && Object.hasOwn(ROW_STATE_MS, row.phase)
    ? { state: row.phase as RowState, since: row.since, hasPanel: row.hasPanel }
    : undefined

export const advanceMotion: typeof AdvanceMotion = ([
  signature,
  inbox,
  selectedAsk,
  selectedFind,
  selectedPr,
  pendingRow,
  pendingKey,
  before,
  now,
  reduced,
]) => {
  const sameSession = before.session === inbox.key
  const draw = (groups: typeof inbox.askGroups, previous: Frame['asks'], selected: string): Frame['asks'] => {
    const oldGroups = sameSession ? previous : []
    const beforeRows = oldGroups.flatMap(group => group.rows)
    const currentIds = groups.flatMap(group => group.rows.map(row => row.id))
    const recorded = recordRows(sameSession ? { rows: new Set(beforeRows.map(row => row.id)) } : {}, {
      rows: currentIds,
    })
    const oldById = new Map(beforeRows.map(row => [row.id, row]))
    return groups.map(group => {
      const previousGroup = oldGroups.find(old => old.id === group.id)
      const list = [...group.rows]
      for (const [index, old] of (previousGroup?.rows ?? []).entries()) {
        if (!currentIds.includes(old.id)) list.splice(Math.min(index, list.length), 0, old.row)
      }
      const rows: Visual[] = []
      for (const row of list) {
        const prior = oldById.get(row.id)
        const gone = !currentIds.includes(row.id)
        const undoing =
          pendingRow === row.id && row.actions.some(action => action.key === pendingKey && action.command === 'undo')
        const target: RowTarget = gone
          ? 'gone'
          : row.state === 'settled'
            ? undoing
              ? 'undoing'
              : 'settled'
            : selected === row.id
              ? 'open'
              : 'closed'
        const track = stepRow(trackOf(prior), target, now, recorded.added.rows.includes(row.id), reduced)
        if (!track) continue
        const keepsPanel = prior && track.hasPanel && ['closing', 'settling', 'leaving'].includes(track.state)
        rows.push({
          guarded: !reduced && isMoving(track.state) && isGuarded(track.since, now),
          id: row.id,
          row,
          panel: keepsPanel ? prior.panel : row,
          phase: track.state,
          since: track.since,
          hasPanel: track.hasPanel,
          target,
          arriving: track.state === 'entering',
        })
      }
      const retained = new Set(rows.map(row => row.id))
      return {
        ...group,
        rows,
        empty: rows.length ? '' : group.empty,
        closed: group.closed.filter(row => !retained.has(row.id)),
        closedAll: group.closedAll.filter(row => !retained.has(row.id)),
      }
    })
  }
  const asks = draw(inbox.askGroups, before.asks, selectedAsk)
  const finds = draw(inbox.findingGroups, before.finds, selectedFind)
  const oldPrs = sameSession ? before.prs : []
  const prIds = new Set(inbox.prLines.map(row => row.id))
  const oldPrIds = new Set(oldPrs.map(row => row.id))
  const prLines = [...inbox.prLines]
  for (const [index, old] of oldPrs.entries())
    if (!prIds.has(old.id)) prLines.splice(Math.min(index, prLines.length), 0, old.row)
  const prs: Frame['prs'] = []
  for (const row of prLines) {
    const prior = oldPrs.find(old => old.id === row.id)
    const selectable = row.kind === 'thread' || row.kind === 'check'
    const target: RowTarget = !prIds.has(row.id) ? 'gone' : !selectable || selectedPr === row.id ? 'open' : 'closed'
    const track = stepRow(trackOf(prior), target, now, sameSession && !oldPrIds.has(row.id), reduced)
    if (!track) continue
    const keepsPanel = prior && track.hasPanel && ['closing', 'settling', 'leaving'].includes(track.state)
    prs.push({
      id: row.id,
      row,
      panel: keepsPanel ? prior.panel : row,
      phase: track.state,
      since: track.since,
      hasPanel: track.hasPanel,
      target,
      arriving: track.state === 'entering',
      guarded: !reduced && isMoving(track.state) && isGuarded(track.since, now),
    })
  }
  const deadlines = [...asks, ...finds].flatMap(group =>
    group.rows.flatMap(row => [
      ...(isMoving(row.phase as RowState) ? [row.since + ROW_STATE_MS[row.phase as RowState]] : []),
      ...(row.guarded ? [row.since + PRESS_GUARD_MS] : []),
    ]),
  )
  deadlines.push(
    ...prs.flatMap(row => [
      ...(isMoving(row.phase as RowState) ? [row.since + ROW_STATE_MS[row.phase as RowState]] : []),
      ...(row.guarded ? [row.since + PRESS_GUARD_MS] : []),
    ]),
  )
  return { session: inbox.key, signature, asks, finds, prs, deadline: deadlines.length ? Math.min(...deadlines) : 0 }
}
