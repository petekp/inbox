import type { SessionStatus, Subject } from '../types'
import { NL } from './ledger-prompt'
import type { Op, StatusAnswer, StatusRetry } from './status'
import { idleSubjects } from './status-children'
import { findSubject } from './status-limits'
import { applyStatus } from './status-ops'
import type { StatusCallInput } from './status-prompt'
import { nextGoalAsk } from './status-prompt-goal'
import { answersNextGoal, isNextGoalAsked, isNextGoalDeclined } from './status-suggest'

/**
 * Whether `op` answers for `s` when applied to `last`: it sets, closes, drops or gives a was line for it, repeats its
 * name in a NEW line, or links a known child or an open ask to it. A line names the subject `applyOps` finds for it.
 */
function isLineFor(op: Op, s: Subject, last: SessionStatus | null, askIds: ReadonlySet<string>): boolean {
  const names = (ref: string) => findSubject(last?.subjects ?? [], ref)?.id === s.id
  if (op.kind === 'set' || op.kind === 'done' || op.kind === 'drop' || op.kind === 'was') return names(op.ref)
  if (op.kind === 'new') return names(op.name)
  const isLinkable = (ref: string) => askIds.has(ref) || (last?.children ?? []).some(c => c.id === ref)
  if (op.kind === 'link') return isLinkable(op.ref) && names(op.subject)

  return false
}

/**
 * The retry for an answer to the Status call that read `input` through `prompt`, or null when the answer left nothing
 * out. It asks once more for a line for each subject in <idle> the answer did not answer, and for the next goal when no
 * goal runs and none is suggested after the answer, as when the answer met the goal, and the answer gave none. It does
 * not ask for the next goal while the call's last `SUGGEST: -` judged the same work.
 */
export function statusRetry(input: StatusCallInput, prompt: string) {
  return (answer: StatusAnswer, text: string): StatusRetry | null => {
    const ops = answer.kind === 'ops' ? answer.ops : []
    const askIds = new Set(input.asks.map(a => a.id))
    const isAnswered = (s: Subject) => ops.some(op => isLineFor(op, s, input.last, askIds))
    const unanswered = idleSubjects(input.last, input.asks, input.now).filter(s => !isAnswered(s))
    const after = applyStatus(input.last, answer, input.now, askIds)
    const isNextGoalMissing =
      isNextGoalAsked(after) && !answersNextGoal(answer) && !(after && isNextGoalDeclined(after, askIds))
    if (unanswered.length === 0 && !isNextGoalMissing) return null
    const idleAsk = `Your answer has no line for these subjects in <idle>: ${unanswered.map(s => `${s.id} ${s.name}`).join(', ')}. Write one line for each: DONE when its work is finished, DROP with why when it was left behind, or SET to keep it, working when this exchange works on it, or waits-on-other with what it still waits on outside the session.`
    const goalAsk = `After your answer no goal runs and none is suggested, and your answer has no GOAL or SUGGEST line. ${nextGoalAsk(after)}`

    return {
      prompt: [
        prompt,
        `<your-answer>${NL}${text}${NL}</your-answer>`,
        ...(unanswered.length > 0 ? [idleAsk] : []),
        ...(isNextGoalMissing ? [goalAsk] : []),
        'Your other lines stand. Answer with only the lines asked for here.',
      ].join(NL),
      keeps: op =>
        (isNextGoalMissing && (op.kind === 'goal' || op.kind === 'suggest')) ||
        unanswered.some(s => isLineFor(op, s, input.last, askIds)),
    }
  }
}
