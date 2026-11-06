import type { SessionStatus } from '../types'
import { NL } from './ledger-prompt'
import { goalLeftFor } from './status-goal-ops'
import { MILESTONES_MAX, MILESTONES_MIN, NAME_WORDS, TEXT_WORDS } from './status-limits'
import { duration } from './text'

/** The mark on a milestone line that no subject serves. */
const NO_WORK_LINKED = 'no work linked'

/** The lines the Status call writes for the goal, after the lines it writes for subjects. */
export const GOAL_LINES = `GOAL: outcome | status name; status name
RETIRE: why the goal no longer fits the work
MILESTONE: status | name | where it stands
SERVES: subject id or name | milestone id or name, or - when the goal does not need it
GOAL sets the goal, with ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, in order, each written as its status, then its name: GOAL: 2.5 in the store | done Bug fixed; working Release built; queued Store review. It holds no date or time. RETIRE clears the goal and sets none. SET, DONE, DROP, WAS and LINK take a milestone's id as they take a subject's.`

/** The input blocks the goal adds, as the system text describes them. */
export const GOAL_INPUT = `- <goal>: the outcome the session's work is for, when one is set. It says (typed) when the person typed it, (met) when every milestone is done, (just set) when the person just typed it, so its milestones still belong to the goal before it, and (no work for 2h) once none of its linked work is open and nothing has moved it for a while, so the work has left it.
- <milestones>: the outcomes the goal needs, one per line: id | status | name | where it stands. A line ends with | ${NO_WORK_LINKED} when no subject serves it.
- <removed>: goals the person removed, as their key words, one per line
- While a goal is set, each line in <subjects> ends with the milestone the subject serves, - when the goal does not need it, or ? when it is not linked yet.`

/**
 * The goal's rules, each a separate part, so a copy of the system text without one can test whether a case needs it.
 * The parts read in this order.
 */
export const GOAL_PARTS = {
  'goal-when-clear': `Write GOAL when no goal is set, or when <goal> says met, once the session's work shows the one outcome it is for. The person may name it, or the open subjects and the agent's plan for them may lead to it. Never write GOAL from a summary of work that already finished.`,
  'goal-finish-line': `Write GOAL only for an outcome with a finish line, one someone could check as met or not, such as "2.5 in the store" or "the import ready to demo". A direction is not a goal: "make search faster", "every item should earn its place" or "keep the list tidy" get no GOAL.`,
  'goal-wait': `When the next goal is not clear, write no GOAL and wait. Chat, one small fix, a few unrelated small asks, or wrapping up the met goal do not show a goal. A met goal stays on the page until the next one is set.`,
  'goal-not-again': `Never write the goal in <goal> or a goal in <removed> again, in the same words or in other words. A goal the person removed stays removed until they type it.`,
  'goal-typed-kept': `A goal marked (typed) is the person's. Never reword, replace or retire it before it is met. Never write the goal into the head, a subject or a milestone.`,
  'goal-outcome-happened': `When the exchange shows the goal's outcome happened, as when the release it names shipped or the feature it names merged, write DONE for each milestone still open, with where it ended, so the goal is met. Never leave a milestone open for an outcome that already happened.`,
  'goal-work-left': `When the session's work no longer moves a goal that is not typed forward, as when the person moved on to other work and the goal's open subjects went stale, close those subjects with DONE or DROP, then write GOAL for the outcome the work is for now, or RETIRE when none is clear. A goal marked no work for a while has been left: write GOAL or RETIRE for it, even when a milestone is still queued. Never replace a goal while its work is still open.`,
  'milestones-are-outcomes': `A milestone is an outcome the goal needs, never a task or a step: "Fix merged", not "Merge the fix". Never name a milestone after a subject. Its name is a label of at most ${NAME_WORDS} words, and where it stands is at most ${TEXT_WORDS} words, with the same rules as a subject's. Move a milestone by its id with SET, DONE, DROP and WAS, as you move a subject, and only when where it stands changed. Code closes a milestone once all the work linked to it is done: when part of it still has work left, write SET to open it again, and NEW for that work. Write MILESTONE for an outcome the goal now needs that no milestone covers. Never write a count: code counts what is done.`,
  'milestone-no-work': `A milestone marked ${NO_WORK_LINKED} has no subject serving it. Write SERVES for a subject whose work is part of its outcome, one under - included, DONE when the exchange shows it done, or DROP when the goal no longer needs it. When no open subject is part of it, link nothing: an empty milestone is never a reason to link other work to it.`,
  'milestones-for-new-goal': `When <goal> says it was just set, its milestones belong to the goal before it, and each one your answer does not name goes. For each one the new goal still needs, write MILESTONE again with its name, status and text. Write MILESTONE for each outcome it needs that none covers, so the goal has ${MILESTONES_MIN} to ${MILESTONES_MAX}.`,
  'serves-every-subject': `While a goal is set, write SERVES for each subject marked ? in <subjects> and for each NEW subject, even when nothing else changed, naming the milestone its work is part of, or - when the goal does not need it. With GOAL, write SERVES for every open subject, naming the new milestones. Change a link only when what the work is for changed, or when a subject under - turns out to be part of a milestone. Write LINK with a milestone id for an ask that holds up the milestone itself, not one subject.`,
  'serves-in-outcome': `A subject serves a milestone only when finishing it is part of that milestone's named outcome, as a crash fix is part of "Launch crash fixed" and a store listing is part of "2.5 published". Work that merely goes on while a milestone is open is not part of it, and a broad name such as "Cleanup done" or "Fixes landed" is not a home for whatever comes later: write - for that work, even when nothing else serves the goal.`,
} as const

export type GoalPartId = keyof typeof GOAL_PARTS

/** The goal's rules, as the list of rules in the system text, leaving out the parts in `without`. */
export function goalRules(without: readonly GoalPartId[] = []): string {
  return (Object.keys(GOAL_PARTS) as GoalPartId[])
    .filter(id => !without.includes(id))
    .map(id => `- ${GOAL_PARTS[id]}`)
    .join(NL)
}

/** The goal's input blocks at `now`: the goal and its milestones, and the removed goals. */
export function goalBlocks(o: SessionStatus | null, now: number): string[] {
  if (o === null) return []
  const g = o.goal
  const left = goalLeftFor(o, now)
  const marks = g
    ? [
        ...(g.source === 'typed' ? ['typed'] : []),
        ...(g.isAwaitingMilestones ? ['just set'] : g.metAt != null ? ['met'] : []),
        ...(left === null ? [] : [`no work for ${duration(left)}`]),
      ]
    : []
  const state = marks.length > 0 ? ` (${marks.join(', ')})` : ''
  const served = new Set(Object.values(o.serves))
  const milestones = o.milestones
    .filter(m => m.status !== 'dropped')
    .map(m => {
      const isUnserved = m.status !== 'done' && !served.has(m.id)
      return `${m.id} | ${m.status} | ${m.name} | ${m.text || '-'}${isUnserved ? ` | ${NO_WORK_LINKED}` : ''}`
    })
  const block = (tag: string, body: string) => `<${tag}>${NL}${body}${NL}</${tag}>`

  return [
    ...(g ? [block('goal', `${g.text}${state}`)] : []),
    ...(g && milestones.length > 0 ? [block('milestones', milestones.join(NL))] : []),
    ...(o.removedGoals.length > 0 ? [block('removed', o.removedGoals.join(NL))] : []),
  ]
}
