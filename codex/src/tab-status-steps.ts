import type { MilestoneRow } from '../../hooks/status-goal-page'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { stepRow } from '../../hooks/row-motion'
import { tabState, drawnRows } from './tab-state'
import { reducedMotion } from './tab-motion'

/** A line of the goal's list: a milestone, or a row under one. */
type GoalLine = { id: string; milestone: MilestoneRow } | { id: string; row: StatusRow }

/**
 * The Status page's lists as the tab draws them, with the lines still leaving in the places they had: the goal's
 * milestones with their rows, and the rows after the goal.
 */
export type DrawnStatus = { goal: GoalLine[]; rows: StatusRow[] }

export const statusRowMotion = (id: string) => `status-${id}`
export const goalLineMotion = (id: string) => `goal-${id}`

const goalLines = (page: StatusPage): GoalLine[] =>
  (page.goal?.milestones ?? []).flatMap(m => [{ id: m.id, milestone: m }, ...m.rows.map(r => ({ id: r.id, row: r }))])

/**
 * Steps the Status page's lines through the row states, as `stepLists` does for the rows of the other tabs. A line the
 * page brings in after the last draw drew the Status grows in, and a line it drops leaves from its place. A first draw
 * of the Status draws every line at rest.
 */
export function stepStatus(page: StatusPage, now: number, changed: Set<string>, kept: Set<string>): DrawnStatus {
  const last = tabState.lastStatus
  const step = <T extends { id: string }>(lines: T[], lastLines: T[] | undefined, motion: (id: string) => string) => {
    const listed = new Set(lines.map(l => l.id))
    const wasDrawn = new Set((lastLines ?? []).map(l => l.id))
    const entries = [...lines]
    for (const [n, l] of (lastLines ?? []).entries())
      if (!listed.has(l.id) && drawnRows.has(motion(l.id))) entries.splice(Math.min(n, entries.length), 0, l)

    return entries.filter(l => {
      const id = motion(l.id)
      const before = drawnRows.get(id)
      const isNew = lastLines !== undefined && !wasDrawn.has(l.id)
      const track = stepRow(before?.track, listed.has(l.id) ? 'closed' : 'gone', now, isNew, reducedMotion.matches)
      if (!track) return false
      if (track !== before?.track) changed.add(id)
      drawnRows.set(id, { track })
      kept.add(id)
      return true
    })
  }

  return {
    goal: step(goalLines(page), last?.goal, goalLineMotion),
    rows: step(page.rows, last?.rows, statusRowMotion),
  }
}
