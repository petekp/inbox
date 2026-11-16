import type { SessionStatus } from '../types'
import type { Op } from './status'
import { restatesGoal, setTypedGoal } from './status-goal-ops'
import { clipWords, DESCRIPTION_KEPT, nameKey, REMOVED_KEPT } from './status-limits'

/** Whether a goal is set and not met, so no goal is offered in its place. */
export const hasRunningGoal = (o: SessionStatus): boolean => o.goal !== null && o.goal.metAt === null

/** Whether `text` restates the goal, the goal before it or a goal the person removed. */
function restatesKnownGoal(o: SessionStatus, text: string): boolean {
  const known = [o.goal?.text, o.goal?.was, ...o.removedGoals].filter((t): t is string => typeof t === 'string')

  return known.some(goal => restatesGoal(text, goal))
}

/**
 * The Status after an answer's SUGGEST lines: the last line's outcome, or none for `SUGGEST: -`. An answer with no
 * SUGGEST line keeps the suggestion. None is kept while a goal is set and not met, or one that restates a known goal.
 */
export function withSuggestion(o: SessionStatus, ops: readonly Op[]): SessionStatus {
  const line = ops.flatMap(op => (op.kind === 'suggest' ? [op] : [])).at(-1)
  const text = line ? line.text && clipWords(line.text, DESCRIPTION_KEPT) : o.suggestedGoal
  const isKept = text !== null && text !== '' && !hasRunningGoal(o) && !restatesKnownGoal(o, text)
  const suggestedGoal = isKept ? text : null

  return suggestedGoal === o.suggestedGoal ? o : { ...o, suggestedGoal }
}

/**
 * Set on the suggested goal: it becomes the goal, inferred, since the Status call wrote it, and waits for the milestones
 * the next call writes. Unchanged while a goal runs or nothing is suggested.
 */
export function takeSuggestedGoal(o: SessionStatus, now: number): SessionStatus {
  const text = o.suggestedGoal
  if (text === null || hasRunningGoal(o)) return o
  const set = setTypedGoal(o, text, now)

  return set.goal === null ? o : { ...set, goal: { ...set.goal, source: 'inferred' }, suggestedGoal: null }
}

/** Dismiss on the suggested goal: it goes, and is kept with the removed goals so the call may not suggest it again. */
export function dismissSuggestedGoal(o: SessionStatus): SessionStatus {
  const text = o.suggestedGoal
  if (text === null) return o
  const removedGoals = [...o.removedGoals.filter(k => k !== nameKey(text)), nameKey(text)]

  return { ...o, suggestedGoal: null, removedGoals: removedGoals.slice(-REMOVED_KEPT) }
}
