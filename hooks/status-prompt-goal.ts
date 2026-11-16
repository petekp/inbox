import type { GoalRefusal, SessionStatus } from '../types'
import { NL } from './ledger-prompt'
import { goalLeftFor, heldSubjects, lastProgressAt } from './status-goal-gate'
import { isOpen, MILESTONE_SUBJECTS, MILESTONES_MAX, MILESTONES_MIN, NAME_WORDS, TEXT_WORDS } from './status-limits'
import { hasRunningGoal } from './status-suggest'
import { duration } from './text'

/** The mark on a milestone line that no subject serves. */
const NO_WORK_LINKED = 'no work linked'
/** The mark on the milestone line the work takes up after the one under way. */
const NEXT_MARK = 'next'
/** The mark on a milestone line `tooBigMilestones` names, with how many subjects serve it and how many milestones the goal has room for. */
const tooBigMark = (count: number, room: number) => `too big, ${count} subjects, room for ${room}`

/** The lines the Status call writes for the goal, after the lines it writes for subjects. */
export const GOAL_LINES = `GOAL: outcome | status name; status name
RETIRE: why the goal no longer fits the work
SUGGEST: outcome, or - for none
MILESTONE: status | name | where it stands
NEXT: milestone id or name
SERVES: subject id or name | milestone id or name, or - when the goal does not need it
GOAL sets the goal, with ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, in order, each written as its status, then its name: GOAL: 2.5 in the store | done Bug fixed; working Release built; queued Store review. It holds no date or time. RETIRE clears the goal and sets none. SET, DONE, DROP, WAS and LINK take a milestone's id as they take a subject's.`

/** The input blocks the goal adds, as the system text describes them. */
export const GOAL_INPUT = `- <goal>: the outcome the session's work is for, when one is set. It says (typed) when the person typed it, (met) when every milestone is done, (just set) when the person just typed it or took the suggested goal, so its milestones still belong to the goal before it, and (no work for 2h), with the time, once none of its linked work is open and nothing has moved it for that long: the work has left it. A second line, when code did not apply the last answer's GOAL or RETIRE line, says which line and why. Fix the cause in this answer before writing that line again.
- <milestones>: the outcomes the goal needs, in the plan's order, one per line: id | status | name | where it stands. The queued milestone the work takes up next ends with | ${NEXT_MARK}. A line ends with | ${NO_WORK_LINKED} when no subject serves it, and with | ${tooBigMark(9, 2)} when more than ${MILESTONE_SUBJECTS} subjects serve it, open or done, two or more of them are open, and the goal has room for more milestones. Room for 2 means the goal can take 2 more.
- <removed>: goals the person removed, as their key words, one per line
- <suggested>: the goal offered to the person, while no goal is set or the goal is met
- While a goal is set, each line in <subjects> ends with the milestone the subject serves, - when the goal does not need it, or ? when it is not linked yet.`

/**
 * The goal's rules, each a separate part, so a copy of the system text without one can test whether a case needs it.
 * The parts read in this order.
 */
export const GOAL_PARTS = {
  'goal-when-clear': `Write GOAL when no goal is set, or when <goal> says met, once the session's work shows the one outcome it is for. The person may name it, or the open subjects and the agent's plan for them may lead to it. Check this on every exchange against <subjects> and <asks>, as for the head, so an exchange that is only chat does not hide a goal the open work already shows. The agent saying what outcome the person set for the work, or an ask's reason naming the outcome its work serves, shows it. Never write GOAL from a summary of work that already finished.`,
  'goal-finish-line': `Write GOAL only for an outcome with a finish line, one someone could check as met or not, such as "2.5 in the store" or "the import ready to demo". A direction is not a goal: "make search faster", "every item should earn its place" or "keep the list tidy" get no GOAL.`,
  'goal-wait': `When the next goal is not clear, write no GOAL and wait. Chat, one small fix, a few unrelated small asks, or wrapping up the met goal do not show a goal. A met goal stays on the page until the next one is set.`,
  'goal-suggest': `While no goal is set, or <goal> says met, and the next goal is not clear enough for GOAL, keep one suggested goal. The person sees it at once while no goal runs, and sets it with one press. It is the outcome the open work most likely leads to, with a finish line, written as GOAL writes a goal, with no milestones. Check this on every exchange against <subjects> and <asks>, as for GOAL, so an exchange that is only chat does not hide a suggestion the open work shows. Write SUGGEST when <suggested> is missing or no longer fits the work and an outcome fits, and SUGGEST: - when <suggested> no longer fits and no outcome does. Write no SUGGEST while <suggested> fits, or while <suggested> is missing and no outcome fits: never make one up from chat. A suggestion never holds back GOAL: when the goal is clear, write GOAL. Never suggest the goal in <goal> or a goal in <removed>.`,
  'goal-not-again': `Never write the goal in <goal> or a goal in <removed> again, in the same words or in other words. A goal the person removed stays removed until they type it.`,
  'goal-typed-kept': `A goal marked (typed) is the person's. Never reword, replace or retire it before it is met. Never write the goal into the head, a subject or a milestone.`,
  'goal-outcome-happened': `When the exchange shows the goal's outcome happened, as when the release it names shipped or the feature it names merged, write DONE for each milestone still open, with where it ended, so the goal is met, and GOAL when the next goal is clear. Never leave a milestone open for an outcome that already happened, and never RETIRE a goal whose outcome happened: RETIRE is for a goal the work left.`,
  'goal-work-left': `When the session's work no longer moves a goal that is not typed forward, as when the person moved on to other work and the goal's open subjects went stale, close those subjects with DONE or DROP, then write GOAL for the outcome the work is for now, or RETIRE when none is clear. When the line in <goal> ends with (no work for a time), the work has left the goal, whatever its milestones say: write RETIRE for it in the same answer as the subject lines, or GOAL when the work shows the next goal. Never replace a goal while its work is still open, unless the person says its outcome changed, as when they cut part of it. Then write GOAL for the new outcome, and name again in the same words each milestone it keeps, so that milestone's work moves with it. Write SERVES to - for the work of each milestone it leaves out. When a milestone is cut and the goal's text still holds, write DROP for that milestone instead. New work or an added outcome is a MILESTONE line, never a new goal.`,
  'milestones-are-outcomes': `A milestone is an outcome the goal needs, never a task or a step: "Fix merged", not "Merge the fix". Never name a milestone after a subject. Its name is a label of at most ${NAME_WORDS} words, and where it stands is at most ${TEXT_WORDS} words, with the same rules as a subject's. Move a milestone by its id with SET, DONE, DROP and WAS, as you move a subject, and only when where it stands changed. Code closes a milestone once all the work linked to it is done: when part of it still has work left, write SET to open it again, and NEW for that work. A done subject stays done: new work on the same outcome is a NEW subject, never that one set working again. Write MILESTONE for an outcome the goal now needs that no milestone covers. Never write a count: code counts what is done.`,
  'next-milestone': `NEXT names the queued milestone the work takes up after the one under way. Write it when the plan changes which comes next. Name a milestone this answer adds by its name, since it has no id yet. Leave it out when the milestone marked ${NEXT_MARK} in <milestones> is right.`,
  'milestone-split': `A milestone marked too big holds more work than the person can read as one outcome: split it by theme. Write MILESTONE for each outcome its open subjects are for, named by theme, such as "Status page polish" or "Herdr drawing fixed", and never more than the room the mark gives: code drops a MILESTONE line past it. Then write SERVES to move each of its open subjects to the new milestone its work is part of, or to - when the goal does not need it. Its done subjects stay with it and get no SERVES line. When the split leaves none of its subjects open, write DONE for it in the same answer, with where it ended, or DROP with why when none of them is done. A split changes milestones only, so it applies to a goal marked (typed) too, and the goal's words stay.`,
  'milestone-no-work': `A milestone marked ${NO_WORK_LINKED} has no subject serving it. Write SERVES for a subject whose work is part of its outcome, one under - included, DONE when the exchange shows it done, or DROP when the goal no longer needs it. When no open subject is part of it, link nothing: an empty milestone is never a reason to link other work to it.`,
  'milestones-for-new-goal': `When <goal> says it was just set, its milestones belong to the goal before it, and each one your answer does not name goes. For each one the new goal still needs, write MILESTONE again with its name, status and text. Write MILESTONE for each outcome it needs that none covers, so the goal has ${MILESTONES_MIN} to ${MILESTONES_MAX}.`,
  'serves-every-subject': `While a goal is set, write SERVES for each subject marked ? in <subjects> and for each NEW subject, even when nothing else changed, naming the milestone its work is part of, or - when the goal does not need it. With GOAL, write SERVES for every open subject, naming the new milestones. Change a link only when what the work is for changed, or when a subject under - turns out to be part of a milestone. Write LINK with a milestone id for an ask that holds up the milestone itself, not one subject.`,
  'serves-in-outcome': `A subject serves a milestone only when finishing it is part of that milestone's named outcome, as a crash fix is part of "Launch crash fixed" and a store listing is part of "2.5 published". Work that merely goes on while a milestone is open is not part of it, and a broad name such as "Cleanup done" or "Fixes landed" is not a home for whatever comes later: write - for that work, even when nothing else serves the goal. Work for a later version or release than the one a milestone names, as a 2.6 beta under "2.5 published", is never part of it: write - for it.`,
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
  if (o === null) return []
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
  ]
}
