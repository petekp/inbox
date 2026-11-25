import type { GoalRefusal, SessionStatus } from '../../types'
import { NL } from './ledger-prompt'
import { goalLeftFor, heldSubjects, lastProgressAt } from './status-goal-gate'
import { isOpen, MILESTONE_SUBJECTS, MILESTONES_MAX, MILESTONES_MIN } from './status-limits'
import { hasRunningGoal, isNextGoalAsked } from './status-suggest'
import { duration } from './text'

/** The mark on a milestone line that no subject serves. */
const NO_WORK_LINKED = 'no work linked'
/** The mark on the milestone line the work takes up after the one under way. */
const NEXT_MARK = 'next'
/** The mark on a milestone line `tooBigMilestones` names, with how many subjects serve it and how many milestones the goal has room for. */
const tooBigMark = (count: number, room: number) => `too big, ${count} subjects, room for ${room}`

/**
 * What the `<next-goal>` block asks while no goal runs and none is suggested. After a met goal it asks for the outcome
 * the finished work leads to as well as the open work.
 */
export function nextGoalAsk(o: SessionStatus | null): string {
  if (o?.goal?.metAt == null)
    return `No goal runs and none is suggested. What is the work for next? Write GOAL when the goal is clear. Else judge only the subjects open after this exchange, and SUGGEST an outcome they clearly lead to: one open fix leads to shipping it. Write SUGGEST: - when no subject is open, when the open subjects are unrelated pieces with no shared outcome, or when no outcome is clear.`

  return `The goal is met, and no next goal is suggested. What is the work for next? Write GOAL when the next goal is clear. Else SUGGEST the next outcome with a finish line: shipping or releasing what the met goal built, when that is still to come, or the outcome the subjects open after this exchange, or the next step an item in <asks> offers, clearly lead to: one open fix leads to shipping it. Write SUGGEST: - when no such outcome is clear.`
}

/** The lines the Status call writes for the goal, after the lines it writes for subjects. */
export const GOAL_LINES = `GOAL: outcome | status name: where it stands; status name: where it stands
RETIRE: why the goal no longer fits the work
SUGGEST: outcome, or - for none
MILESTONE: status | name | where it stands
NEXT: milestone id or name
SERVES: subject id or name | milestone id or name, or - when the goal does not need it
GOAL sets the goal, with ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, in order, each written as its status, its name, then where it stands: GOAL: 2.5 in the store | done Bug fixed: crash gone; working Release built: build signed; queued Store review: after the build. It holds no date or time. RETIRE clears the goal and sets none. SET, DONE, DROP, WAS and LINK take a milestone's id as they take a subject's.`

/** The input blocks the goal adds, as the system text describes them. */
export const GOAL_INPUT = `- <goal>: the outcome the session's work is for, when one is set. It says (typed) when the person typed it, (met) when every milestone is done, (just set) when the person just typed it or took the suggestion, so the milestones shown still belong to the goal before it, and (no work for 2h) once none of its work is open and nothing has moved it for that long. A second line says when code refused the last answer's GOAL or RETIRE line, and why. Fix the cause before writing that line again.
- <milestones>: the outcomes the goal needs, in the plan's order, one per line: id | status | name | where it stands, then its marks: ${NEXT_MARK} on the queued milestone the work takes up next, ${NO_WORK_LINKED} when no subject serves it, and ${tooBigMark(9, 2)} when it holds too much work for one outcome and the goal can take 2 more milestones.
- <removed>: goals the person removed, as their key words, one per line
- <suggested>: the goal offered to the person, while no goal is set or the goal is met
- <next-goal>: there when no goal runs and none is suggested, to ask for the next goal
- While a goal is set, each line in <subjects> ends with the milestone the subject serves, - when the goal does not need it, or ? when it is not linked yet.`

/**
 * The goal's rules, each a separate part, so a copy of the system text without one can test whether a case needs it.
 * The parts read in this order.
 */
export const GOAL_PARTS = {
  'goal-when-clear': `Write GOAL when no goal is set, or <goal> says met, once the work shows the one outcome it is for. The person may name it, or the open subjects and the agent's plan lead to it, as when the agent says what outcome the person set or an ask's reason names the outcome its work serves. Check this on every exchange against <subjects> and <asks>, so an exchange that is only chat does not hide a goal the open work shows. Never write GOAL from a summary of finished work.`,
  'goal-finish-line': `A goal has a finish line someone could check, such as "2.5 in the store" or "the import ready to demo". A direction, such as "make search faster" or "keep the list tidy", gets no GOAL.`,
  'goal-wait': `When the next goal is not clear, write no GOAL and wait. Chat, one small fix, a few unrelated small asks, or wrapping up the met goal do not show one. A met goal stays until the next is set.`,
  'goal-suggest': `While no goal runs, or <goal> says met, and the next goal is not clear enough for GOAL, keep one suggested goal, which the person sets with one press. It is the outcome the open work most likely leads to, with a finish line, written as GOAL writes a goal, with no milestones. After a met goal, it is the next outcome the finished work leads to, such as shipping what the goal built. Check it on every exchange, as for GOAL. Write SUGGEST when <suggested> no longer fits and an outcome does, SUGGEST: - when it no longer fits and none does, and nothing while it fits. When <next-goal> is there, answer it as it asks, even after NO CHANGE. Never make a suggestion up from chat, and never let one hold back GOAL. Never suggest the goal in <goal> or a goal in <removed>.`,
  'goal-not-again': `Never write the goal in <goal> or a goal in <removed> again, in any words. A removed goal stays removed until the person types it.`,
  'goal-typed-kept': `A goal marked (typed) is the person's: never reword, replace or retire it before it is met. Never write the goal into the head, a subject or a milestone.`,
  'goal-outcome-happened': `When the exchange shows the goal's outcome happened, as when its release shipped or its feature merged, write DONE for each open milestone, so the goal is met, and GOAL when the next goal is clear. Never RETIRE a goal whose outcome happened.`,
  'goal-work-left': `When the work no longer moves a goal that is not typed, as when the person moved on and its subjects went stale, close those subjects with DONE or DROP, then write GOAL for what the work is for now, or RETIRE when nothing is clear. A goal marked (no work for …) has been left, whatever its milestones say: write RETIRE in the same answer, or GOAL when the work shows the next goal. Never replace a goal while its work is open, unless the person changed its outcome, as by cutting part of it. Then write GOAL for the new outcome, name each milestone it keeps again in the same words, and write SERVES to - for the work of each one it leaves out. When a milestone is cut and the goal's words still hold, DROP that milestone instead. New work or an added outcome is a MILESTONE line, never a new goal.`,
  'milestones-are-outcomes': `A milestone is an outcome the goal needs, never a task or a step: "Fix merged", not "Merge the fix". The milestones cover every outcome the goal names, a release or version included: "Offline sync in 3.1" needs one for offline sync and one for 3.1 published. Never name a milestone after a subject. A milestone's name and where it stands follow a subject's rules. Code starts a milestone when its linked work starts and closes it when all that work is done. Judge a milestone by the outcome its name states, not by the state of its subjects. When the exchange shows that outcome happened, write DONE for it, even while a subject that serves it stays open for work that follows the outcome, such as applying a choice, a check not yet run or a test that broke after its work landed: "Icon style chosen" is done once the person picks a style, though the icons are still to draw. Write SET, DONE, DROP or WAS for one by its id when where it stands changed, and SET to open it again when part of it still has work left, with NEW for that work. Write MILESTONE for an outcome the goal now needs that none covers. Never write a count: code counts what is done.`,
  'next-milestone': `NEXT names the queued milestone the work takes up after the one under way. Write it when the plan changes which comes next, naming a milestone this answer adds by its name. Leave it out while the milestone marked ${NEXT_MARK} is right.`,
  'milestone-split': `A milestone marked too big holds more work than the person can read as one outcome: split it by theme. Write MILESTONE for each outcome its open subjects are for, such as "Status page polish", no more than the room the mark gives. Then write SERVES to move each open subject to its new milestone, or to - when the goal does not need it. Its done subjects stay with it. When none of its subjects is left open, write DONE for it, or DROP with why when none is done. A split changes milestones only, so it applies to a typed goal too.`,
  'milestone-no-work': `For a milestone marked ${NO_WORK_LINKED}, write SERVES for an open subject whose work is part of it, DONE when the exchange shows it done, or DROP when the goal no longer needs it. Never link other work just to fill it.`,
  'milestones-for-new-goal': `When <goal> says just set, the milestones shown belong to the goal before it, and each one your answer does not name goes. Write MILESTONE, with its status, name and where it stands, for each one the new goal keeps and each outcome it needs, so it has ${MILESTONES_MIN} to ${MILESTONES_MAX}.`,
  'serves-every-subject': `While a goal is set, write SERVES for each subject marked ? in <subjects> and each NEW subject, even when nothing else changed: the milestone its work is part of, or - when the goal does not need it. With GOAL, write SERVES for every open subject. Change a link only when what the work is for changed, or a subject under - turns out to be part of a milestone. Write LINK with a milestone id for an ask that holds up the milestone itself.`,
  'serves-in-outcome': `A subject serves a milestone only when finishing it is part of that milestone's named outcome, as a crash fix is part of "Launch crash fixed". Work that only happens while a milestone is open is not, and a broad name such as "Fixes landed" is no home for whatever comes later: write - for it, even when nothing else serves the goal.`,
} as const

export type GoalPartId = keyof typeof GOAL_PARTS

/** The goal's rules, as the list of rules in the system text, leaving out the parts in `without`. */
export function goalRules(without: readonly GoalPartId[] = []): string {
  return (Object.keys(GOAL_PARTS) as GoalPartId[])
    .filter(id => !without.includes(id))
    .map(id => `- ${GOAL_PARTS[id]}`)
    .join(NL)
}

/** The line that says why the last GOAL or RETIRE line was refused, or null while the reason no longer holds. */
function refusedLine(o: SessionStatus, now: number): string | null {
  const r = o.goalRefused
  const g = o.goal
  if (r === null || g === null) return null
  const line = r.line.toUpperCase()
  const texts: Record<GoalRefusal['why'], () => string | null> = {
    typed: () => 'the person typed this goal, so it is theirs until it is met.',
    met: () => 'the goal is met. It stays until GOAL sets the next one.',
    'work-open': () => {
      const open = heldSubjects(o).filter(isOpen)
      const unplaced = open.filter(s => r.unplaced?.includes(s.id))
      const revise =
        r.line === 'goal'
          ? " When the person cut part of the goal's outcome, write GOAL for the new outcome instead: name again in the same words each milestone it keeps, and write SERVES to - for the work of each milestone it leaves out."
          : ''
      if (unplaced.length > 0)
        return `it leaves this open work with no open milestone: ${unplaced.map(s => s.name).join(', ')}. If the person cut that work's milestone, write GOAL again with ${unplaced.map(s => `SERVES: ${s.id} | -`).join(' and ')} in the same answer. If that work is done, write DONE for it, then GOAL again. Else keep the goal and write no GOAL.`
      return open.length === 0
        ? null
        : `the goal's work is still open: ${open.map(s => s.name).join(', ')}. In the same answer, close that work with DONE or DROP, or write SERVES to - for work the goal does not need, then write ${line} again.${revise}`
    },
    moved: () =>
      goalLeftFor(o, now) !== null
        ? null
        : `the work has not left the goal: it moved ${duration(now - lastProgressAt(o, g))} ago. When its outcome happened, write DONE for each open milestone instead, so it is met. Else write ${line} once this line says no work for a time.`,
    'no-work': () =>
      "no open subject is outside the goal, so there is no work for a new one. Write NEW for the new goal's work in the same answer.",
    restates: () => 'it restates the goal, the goal before it, or a removed goal.',
    'few-milestones': () => `a goal needs ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones.`,
  }
  const text = texts[r.why]()

  return text === null ? null : `${line} refused: ${text}`
}

/**
 * The open milestones the call is asked to split, each with how many subjects serve it, open or done: more than
 * `MILESTONE_SUBJECTS`, at least two of them open, so a split moves more than one piece of work, while the goal has room
 * for another milestone. None while a typed goal waits for its milestones, which still belong to the goal before it.
 */
export function tooBigMilestones(o: SessionStatus | null): Map<string, number> {
  const g = o?.goal
  if (!o || !g || g.isAwaitingMilestones) return new Map()
  const kept = o.milestones.filter(m => m.status !== 'dropped')
  const serving = (id: string) => o.subjects.filter(s => s.status !== 'dropped' && o.serves[s.id] === id)
  if (kept.length >= MILESTONES_MAX) return new Map()

  return new Map(
    kept.flatMap(m => {
      const work = serving(m.id)
      const hasWorkToSplit = work.filter(isOpen).length >= 2
      return isOpen(m) && work.length > MILESTONE_SUBJECTS && hasWorkToSplit ? [[m.id, work.length] as const] : []
    }),
  )
}

/** The goal's input blocks at `now`: the goal and its milestones, the removed goals and the suggested goal. */
export function goalBlocks(o: SessionStatus | null, now: number): string[] {
  const ask = isNextGoalAsked(o) ? [`<next-goal>${NL}${nextGoalAsk(o)}${NL}</next-goal>`] : []
  if (o === null) return ask
  const g = o.goal
  const left = goalLeftFor(o, now)
  const refused = refusedLine(o, now)
  const marks = g
    ? [
        ...(g.source === 'typed' ? ['typed'] : []),
        ...(g.isAwaitingMilestones ? ['just set'] : g.metAt != null ? ['met'] : []),
        ...(left === null ? [] : [`no work for ${duration(left)}`]),
      ]
    : []
  const state = marks.length > 0 ? ` (${marks.join(', ')})` : ''
  const served = new Set(Object.values(o.serves))
  const next = g?.isAwaitingMilestones ? undefined : o.milestones.find(m => m.status === 'queued')
  const tooBig = tooBigMilestones(o)
  const room = MILESTONES_MAX - o.milestones.filter(m => m.status !== 'dropped').length
  const milestones = o.milestones
    .filter(m => m.status !== 'dropped')
    .map(m => {
      const isUnserved = m.status !== 'done' && !served.has(m.id)
      const serving = tooBig.get(m.id)
      const marks = [
        ...(m === next ? [NEXT_MARK] : []),
        ...(isUnserved ? [NO_WORK_LINKED] : []),
        ...(serving === undefined ? [] : [tooBigMark(serving, room)]),
      ]
      return [`${m.id} | ${m.status} | ${m.name} | ${m.text || '-'}`, ...marks].join(' | ')
    })
  const block = (tag: string, body: string) => `<${tag}>${NL}${body}${NL}</${tag}>`

  return [
    ...(g ? [block('goal', `${g.text}${state}${refused === null ? '' : `${NL}${refused}`}`)] : []),
    ...(g && milestones.length > 0 ? [block('milestones', milestones.join(NL))] : []),
    ...(o.removedGoals.length > 0 ? [block('removed', o.removedGoals.join(NL))] : []),
    ...(o.suggestedGoal !== null && !hasRunningGoal(o) ? [block('suggested', o.suggestedGoal)] : []),
    ...ask,
  ]
}
