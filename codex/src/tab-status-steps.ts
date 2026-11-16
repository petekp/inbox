import { milestoneRows, unfoldedRows } from '../../hooks/status-folds'
import { shownMilestones } from '../../hooks/status-goal-page'
import type { GoalBlock, MilestoneRow } from '../../hooks/status-goal-page'
import { WAS_PREFIX } from '../../hooks/status-page'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { statusUnfolded, tabState } from './tab-state'
import { isParentFolded } from './tab-status-fold'
import { stepLines } from './tab-line-steps'
import type { TextLine } from './tab-line-steps'

/** A line of the goal's list: a milestone, or a row under one. A done milestone folded to its name keeps its rows in its fold. */
type GoalLine = { id: string; milestone: MilestoneRow } | { id: string; row: StatusRow }

/** The line a met goal's milestones fold into. */
type FoldLine = { id: string; fold: NonNullable<GoalBlock['milestonesFold']> }

/** The page's head in its own section, as it draws with no goal or a met one. */
type HeadLine = { id: string; head: NonNullable<StatusPage['head']> }

/**
 * The Status page's lists as the tab draws them, with the lines still leaving in the places they had: the lines under
 * the goal's text, the line a met goal's milestones fold into, the goal's milestones with their rows, the head in its
 * own section, and the rows after the goal.
 */
export type DrawnStatus = { head: TextLine[]; fold: FoldLine[]; goal: GoalLine[]; apart: HeadLine[]; rows: StatusRow[] }

export const statusRowMotion = (id: string) => `status-${id}`
export const goalLineMotion = (id: string) => `goal-${id}`
export const goalHeadMotion = (id: string) => `head-${id}`
export const metFoldMotion = (id: string) => `met-${id}`
export const headApartMotion = (id: string) => `apart-${id}`

/** Milestones with the rows each draws, in draw order. */
const milestoneLines = (milestones: MilestoneRow[]): GoalLine[] =>
  milestones.flatMap(m => [
    { id: m.id, milestone: m },
    ...(m.foldId === null ? milestoneRows(m, () => false, isParentFolded) : []).map(r => ({ id: r.id, row: r })),
  ])

/** The goal's lines that step: the milestones it draws, none while a met goal's fold is shut. */
const goalLines = (page: StatusPage): GoalLine[] =>
  page.goal ? milestoneLines(shownMilestones(page.goal, id => statusUnfolded.has(id))) : []

/** The lines under the goal's text: what it was, where it stands now, and what it waits on. */
function goalHead(page: StatusPage): TextLine[] {
  const g = page.goal

  return [
    ...(g?.was ? [{ id: 'was', text: `${WAS_PREFIX}${g.was}` }] : []),
    ...(g?.now ? [{ id: 'now', text: g.now }] : []),
    ...(g?.awaiting ? [{ id: 'awaiting', text: g.awaiting }] : []),
  ]
}

/**
 * Steps the Status page's lines through the row states, as `stepLists` does for the rows of the other tabs. A first
 * draw of the Status draws every line at rest.
 */
export function stepStatus(page: StatusPage, now: number, changed: Set<string>, kept: Set<string>): DrawnStatus {
  const last = tabState.lastStatus
  const fold = page.goal?.milestonesFold ?? null
  const apart = page.isHeadApart ? page.head : null

  return {
    head: stepLines(goalHead(page), last?.head, goalHeadMotion, now, changed, kept),
    fold: stepLines(fold ? [{ id: 'milestones', fold }] : [], last?.fold, metFoldMotion, now, changed, kept),
    goal: stepLines(goalLines(page), last?.goal, goalLineMotion, now, changed, kept),
    apart: stepLines(apart ? [{ id: 'head', head: apart }] : [], last?.apart, headApartMotion, now, changed, kept),
    rows: stepLines(unfoldedRows(page.rows, () => false, isParentFolded), last?.rows, statusRowMotion, now, changed, kept),
  }
}
