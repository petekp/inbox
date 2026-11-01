import type { SessionStatus } from '../types'
import { NL } from './ledger-prompt'
import { MILESTONES_MAX, MILESTONES_MIN, NAME_WORDS, TEXT_WORDS } from './status-limits'

/** The lines the Status call writes for the goal, after the lines it writes for subjects. */
export const GOAL_LINES = `GOAL: outcome | status name; status name
MILESTONE: status | name | where it stands
SERVES: subject id or name | milestone id or name, or - when the goal does not need it
GOAL proposes one outcome with ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, in order, each written as its status, then its name: GOAL: 2.5 in the store | done Bug fixed; working Release built; queued Store review. It holds no date or time. SET, DONE, DROP, WAS and LINK take a milestone's id as they take a subject's.`

/** The input blocks the goal adds, as the system text describes them. */
export const GOAL_INPUT = `- <goal>: the outcome the person set for the work, when one is set. It says when the goal is met, and when it was just set, so its milestones still belong to the goal before it.
- <milestones>: the outcomes the goal needs, one per line: id | status | name | where it stands
- <proposed>: a goal you proposed that the person has not answered yet: outcome | its milestones
- <declined>: goals the person declined, as their key words, one per line
- While a goal is set, each line in <subjects> ends with the milestone the subject serves, - when the goal does not need it, or ? when it is not linked yet.`

/**
 * The goal's rules, each a separate part, so a copy of the system text without one can test whether a case needs it.
 * The parts read in this order.
 */
export const GOAL_PARTS = {
  'goal-from-person': `Write GOAL only from what the person wrote in <person>, or in a catch-up, the person's own messages in <conversation>. Never propose from the agent's words in <reply>, <activity> or <tasks>, even when the agent writes "Goal:" or sums up the work.`,
  'goal-finish-line': `Write GOAL only for an outcome with a finish line, one someone could check as met or not, such as "2.5 in the store" or "the import ready to demo". A direction is not a goal: "make search faster", "every item should earn its place" or "keep the list tidy" get no GOAL.`,
  'goal-not-again': `Never propose the goal in <goal>, a goal in <proposed>, or a goal in <declined> again, in the same words or in other words. A goal the person declined stays declined until they state it again as new work.`,
  'goal-belongs-to-person': `The goal belongs to the person. GOAL only proposes: the person uses it, edits it or declines it. Never write GOAL to reword or update the goal in <goal>, and never write the goal into the head, a subject or a milestone.`,
  'milestones-are-outcomes': `A milestone is an outcome the goal needs, never a task or a step: "Fix merged", not "Merge the fix". Its name is a label of at most ${NAME_WORDS} words, and where it stands is at most ${TEXT_WORDS} words, with the same rules as a subject's. Move a milestone by its id with SET, DONE, DROP and WAS, as you move a subject, and only when where it stands changed. Write MILESTONE for an outcome the goal now needs that no milestone covers. Never write a count: code counts what is done.`,
  'milestones-for-new-goal': `When <goal> says it was just set, its milestones belong to the goal before it, and each one your answer does not name goes. For each one the new goal still needs, write MILESTONE again with its name, status and text. Write MILESTONE for each outcome it needs that none covers, so the goal has ${MILESTONES_MIN} to ${MILESTONES_MAX}.`,
  'serves-every-subject': `While a goal is set, write SERVES for each subject marked ? in <subjects> and for each NEW subject, even when nothing else changed, naming the milestone its work moves forward, or - when the goal does not need it. Change a link only when what the work is for changed. Write LINK with a milestone id for an ask that holds up the milestone itself, not one subject.`,
} as const

export type GoalPartId = keyof typeof GOAL_PARTS

/** The goal's rules, as the list of rules in the system text, leaving out the parts in `without`. */
export function goalRules(without: readonly GoalPartId[] = []): string {
  return (Object.keys(GOAL_PARTS) as GoalPartId[])
    .filter(id => !without.includes(id))
    .map(id => `- ${GOAL_PARTS[id]}`)
    .join(NL)
}

/** The goal's input blocks: the goal and its milestones, a proposal waiting for the person, and the declined goals. */
export function goalBlocks(o: SessionStatus | null): string[] {
  if (o === null) return []
  const g = o.goal
  const state = g?.isAwaitingMilestones ? ' (just set)' : g?.metAt != null ? ' (met)' : ''
  const milestones = o.milestones
    .filter(m => m.status !== 'dropped')
    .map(m => `${m.id} | ${m.status} | ${m.name} | ${m.text || '-'}`)
  const p = o.proposedGoal
  const block = (tag: string, body: string) => `<${tag}>${NL}${body}${NL}</${tag}>`

  return [
    ...(g ? [block('goal', `${g.text}${state}`)] : []),
    ...(g && milestones.length > 0 ? [block('milestones', milestones.join(NL))] : []),
    ...(p ? [block('proposed', `${p.text} | ${p.milestones.map(m => `${m.status} ${m.name}`).join('; ')}`)] : []),
    ...(o.declinedGoals.length > 0 ? [block('declined', o.declinedGoals.join(NL))] : []),
  ]
}
