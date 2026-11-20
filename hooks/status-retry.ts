import type { Subject } from '../types'
import { NL } from './ledger-prompt'
import type { Op, StatusAnswer, StatusRetry } from './status'
import { idleSubjects } from './status-children'
import { clipWords, NAME_KEPT, nameKey } from './status-limits'
import { applyStatus } from './status-ops'
import type { StatusCallInput } from './status-prompt'
import { nextGoalAsk } from './status-prompt-goal'
import { answersNextGoal, isNextGoalAsked } from './status-suggest'

/** Whether `op` closes `s` or sets where it stands, naming it by its id or its name. */
function isLineFor(op: Op, s: Subject): boolean {
  if (op.kind !== 'set' && op.kind !== 'done' && op.kind !== 'drop') return false

  return op.ref.toLowerCase() === s.id || nameKey(clipWords(op.ref, NAME_KEPT)) === nameKey(s.name)
}

/**
 * The retry for an answer to the Status call that read `input` through `prompt`, or null when the answer left nothing
 * out. It asks once more for a line for each subject in <idle> the answer did not answer, and for the next goal when no
 * goal runs and none is suggested after the answer, as when the answer met the goal, and the answer gave none.
 */
export function statusRetry(input: StatusCallInput, prompt: string) {
  return (answer: StatusAnswer, text: string): StatusRetry | null => {
    const ops = answer.kind === 'ops' ? answer.ops : []
    const unanswered = idleSubjects(input.last, input.asks, input.now).filter(s => !ops.some(op => isLineFor(op, s)))
    const after = applyStatus(input.last, answer, input.now, new Set(input.asks.map(a => a.id)))
    const isNextGoalMissing = isNextGoalAsked(after) && !answersNextGoal(answer)
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
        (isNextGoalMissing && (op.kind === 'goal' || op.kind === 'suggest')) || unanswered.some(s => isLineFor(op, s)),
    }
  }
}
