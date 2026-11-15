import type { MilestoneRow } from '../../hooks/status-goal-page'
import { WAS_PREFIX } from '../../hooks/status-page'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { tabState } from './tab-state'
import { stepLines } from './tab-line-steps'
import type { TextLine } from './tab-line-steps'

/** A line of the goal's list: a milestone, or a row under one. */
type GoalLine = { id: string; milestone: MilestoneRow } | { id: string; row: StatusRow }

/**
 * The Status page's lists as the tab draws them, with the lines still leaving in the places they had: the lines under
 * the goal's text, the goal's milestones with their rows, and the rows after the goal.
 */
export type DrawnStatus = { head: TextLine[]; goal: GoalLine[]; rows: StatusRow[] }

export const statusRowMotion = (id: string) => `status-${id}`
export const goalLineMotion = (id: string) => `goal-${id}`
export const goalHeadMotion = (id: string) => `head-${id}`

const goalLines = (page: StatusPage): GoalLine[] =>
  (page.goal?.milestones ?? []).flatMap(m => [{ id: m.id, milestone: m }, ...m.rows.map(r => ({ id: r.id, row: r }))])

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

  return {
    head: stepLines(goalHead(page), last?.head, goalHeadMotion, now, changed, kept),
    goal: stepLines(goalLines(page), last?.goal, goalLineMotion, now, changed, kept),
    rows: stepLines(page.rows, last?.rows, statusRowMotion, now, changed, kept),
  }
}
