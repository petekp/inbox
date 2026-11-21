import type { FoldKind } from '../../types'
import { listWaits } from './action-plan'
import { FINDING_GROUPS } from './help'
import { openPrViews } from './pr-views'
import { prRowWaits } from './pr-rows'
import { NEEDS_YOU_GROUPS } from './rows'
import type { SessionView } from './session-view'
import type { StatusRow } from './status-page'
import type { ShownTab } from './tabs'

/** Every fold a tab draws, by kind of fold. */
type TabFolds = {
  /** The Closed folds of Asks and Finds, by group. */
  closed: FoldKind[]
  /** The Status's done folds, by id: a done fold, a done milestone folded to its name, a met goal's milestones. */
  statusFolds: string[]
  /** The Status parents that fold their rows behind their name, by id. */
  parents: string[]
  /** The rows a person can collapse, by id. */
  rows: string[]
}

/** Which folds the person has open. A row or parent is open unless `collapsed` names it. */
type FoldState = {
  unfolded: readonly FoldKind[]
  statusUnfolded: readonly string[]
  collapsed: readonly string[]
}

/** The Closed and Status folds the person has open. The view says which rows and parents are collapsed. */
type OpenFolds = Pick<FoldState, 'unfolded' | 'statusUnfolded'>

/** The change that folds or opens every fold of a tab: each list as it should be saved, and the collapses that change. */
type FoldAllChange = {
  unfolded: FoldKind[]
  statusUnfolded: string[]
  collapses: { id: string; isCollapsed: boolean }[]
}

const statusFoldsOf = (view: SessionView): Pick<TabFolds, 'statusFolds' | 'parents'> => {
  const page = view.statusPage
  const milestones = page.goal?.milestones ?? []
  const rows = [...milestones.flatMap(m => m.rows), ...page.rows]
  const listed = rows.flatMap((r): StatusRow[] =>
    r.kind === 'done-fold' || r.kind === 'counts' ? [r, ...r.rows] : [r],
  )
  const foldIds = [
    ...(page.goal?.milestonesFold ? [page.goal.milestonesFold.id] : []),
    ...milestones.flatMap(m => (m.foldId === null ? [] : [m.foldId])),
    ...listed.filter(r => r.kind === 'done-fold' || r.kind === 'counts').map(r => r.id),
  ]
  const parentIds = [
    ...milestones.filter(m => m.foldCount > 0).map(m => m.id),
    ...listed.filter(r => r.kind === 'subject' && r.foldCount > 0).map(r => r.id),
  ]

  return { statusFolds: [...new Set(foldIds)], parents: [...new Set(parentIds)] }
}

/** The folds `tab` draws in `view`. A row that has settled draws no collapse, so it is left out. */
function tabFolds(view: SessionView, tab: ShownTab): TabFolds {
  const none: TabFolds = { closed: [], statusFolds: [], parents: [], rows: [] }
  if (tab === 'overview') return { ...none, ...statusFoldsOf(view) }
  if (tab === 'prs') return { ...none, rows: prRowWaits(openPrViews(view.prs.drawn), view.lastActions).map(r => r.id) }
  const live = new Set(
    (tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows)
      .filter(r => r.state.is !== 'settled')
      .map(r => r.id),
  )
  const closed =
    tab === 'needsYou'
      ? NEEDS_YOU_GROUPS.filter(g => view.needsYou.closed[g.list].length > 0).map(g => g.kind)
      : (Object.keys(FINDING_GROUPS) as FoldKind[]).filter(kind => view.findings.closed.some(f => f.kind === kind))

  return {
    ...none,
    closed,
    rows: listWaits(view)[tab].flatMap(r => (live.has(r.id) ? [r.id] : [])),
  }
}

/** Whether the person has any fold of the tab open. */
function isAnyFoldOpen(folds: TabFolds, state: FoldState): boolean {
  const isOpen = (id: string) => !state.collapsed.includes(id)

  return (
    folds.closed.some(k => state.unfolded.includes(k)) ||
    folds.statusFolds.some(id => state.statusUnfolded.includes(id)) ||
    folds.parents.some(isOpen) ||
    folds.rows.some(isOpen)
  )
}

/**
 * What it takes to open every fold of the tab, or fold every one. The lists keep the folds of other tabs as they were,
 * and `collapses` holds only the rows and parents whose state changes.
 */
function foldAll(folds: TabFolds, state: FoldState, isOpening: boolean): FoldAllChange {
  const set = <T>(list: readonly T[], these: readonly T[]) =>
    isOpening ? [...list, ...these.filter(t => !list.includes(t))] : list.filter(t => !these.includes(t))
  const collapsible = [...folds.parents, ...folds.rows]

  return {
    unfolded: set(state.unfolded, folds.closed),
    statusUnfolded: set(state.statusUnfolded, folds.statusFolds),
    collapses: collapsible.flatMap(id =>
      state.collapsed.includes(id) === isOpening ? [{ id, isCollapsed: !isOpening }] : [],
    ),
  }
}

/**
 * `foldAll` for the folds `tab` draws in `view`. `isOpening` is the direction a click on a fold names. A key names none,
 * so it folds every fold while any is open, and else opens them all.
 */
export function foldAllOn(view: SessionView, tab: ShownTab, open: OpenFolds, isOpening: boolean | null): FoldAllChange {
  const folds = tabFolds(view, tab)
  const state = { ...open, collapsed: view.collapsed }

  return foldAll(folds, state, isOpening ?? !isAnyFoldOpen(folds, state))
}
