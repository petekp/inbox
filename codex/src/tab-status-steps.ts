import { milestoneRows, unfoldedRows } from '../../core/view/status-folds'
import { goalNotes, shownMilestones } from '../../core/view/status-goal-page'
import type { GoalBlock, MilestoneRow } from '../../core/view/status-goal-page'
import type { StatusPage, StatusRow } from '../../core/view/status-page'
import { WAS_LEVEL } from '../../core/view/status-page-parts'
import { tabState } from './tab-state'
import { isParentFolded } from './tab-status-fold'
import { stepLines } from './tab-line-steps'
import type { TextLine } from './tab-line-steps'

/** A line of the goal's list: a milestone, or a row under one. A done milestone folded to its name keeps its rows in its fold. */
type GoalLine = { id: string; milestone: MilestoneRow } | { id: string; row: StatusRow }

/** The line a met goal's milestones fold into. */
type FoldLine = { id: string; fold: NonNullable<GoalBlock['milestonesFold']> }

/**
 * The Status page's lists as the tab draws them, with the lines still leaving in the places they had: the lines under
 * the goal's text, the line a met goal's milestones fold into, the goal's milestones with their rows, the Later label
 * above the first milestone that starts later, and the rows after the goal.
 */
export type DrawnStatus = {
  head: TextLine[]
  fold: FoldLine[]
  goal: GoalLine[]
  later: LaterLine[]
  rows: StatusRow[]
}

/** The Later label, keyed by the milestone it sits above. A label that moves to another milestone leaves and enters. */
type LaterLine = { id: string }

export const statusRowMotion = (id: string) => `status-${id}`
export const goalLineMotion = (id: string) => `goal-${id}`
export const goalHeadMotion = (id: string) => `head-${id}`
export const metFoldMotion = (id: string) => `met-${id}`
export const laterMotion = (id: string) => `later-${id}`

/** The id of the goal's Prev line among the lines under its text. Its text is what the goal was. */
export const GOAL_WAS_LINE = 'was'

/** Milestones with the rows each draws, in draw order. */
const milestoneLines = (milestones: MilestoneRow[]): GoalLine[] =>
  milestones.flatMap(m => [
    { id: m.id, milestone: m },
    ...(m.foldId === null ? milestoneRows(m, () => false, isParentFolded) : []).map(r => ({ id: r.id, row: r })),
  ])

/** The milestones the goal draws: none while a met goal's fold is shut. */
const goalMilestones = (page: StatusPage): MilestoneRow[] =>
  page.goal ? shownMilestones(page.goal, id => tabState.ui.statusUnfolded.includes(id)) : []

/** The Later label, above the first milestone it draws that waits under it. */
const laterLines = (milestones: MilestoneRow[]): LaterLine[] => {
  const first = milestones.find(m => m.startsLater)

  return first ? [{ id: first.id }] : []
}

/** The lines under the goal's text: where it stands now, then what it was. None under a suggestion. */
function goalHead(page: StatusPage): TextLine[] {
  const g = page.suggestedGoal === null ? page.goal : null

  return goalNotes(g).map(n =>
    n.kind === 'was' ? { id: GOAL_WAS_LINE, text: n.text, level: WAS_LEVEL } : { id: 'now', text: n.text },
  )
}

/**
 * Steps the Status page's lines through the row states, as `stepLists` does for the rows of the other tabs. A first
 * draw of the Status draws every line at rest.
 */
export function stepStatus(page: StatusPage, now: number, changed: Set<string>, kept: Set<string>): DrawnStatus {
  const last = tabState.lastStatus
  const fold = page.goal?.milestonesFold ?? null
  const milestones = goalMilestones(page)

  return {
    head: stepLines(goalHead(page), last?.head, goalHeadMotion, now, changed, kept),
    fold: stepLines(fold ? [{ id: 'milestones', fold }] : [], last?.fold, metFoldMotion, now, changed, kept),
    goal: stepLines(milestoneLines(milestones), last?.goal, goalLineMotion, now, changed, kept),
    later: stepLines(laterLines(milestones), last?.later, laterMotion, now, changed, kept),
    rows: stepLines(
      unfoldedRows(page.rows, () => false, isParentFolded),
      last?.rows,
      statusRowMotion,
      now,
      changed,
      kept,
    ),
  }
}
