import { parseStatus } from '../hooks/status'
import { startSession } from './status-replay'
import type { Replay, StepResult } from './status-replay'
import { RULES } from './status-rules'
import type { Reads, RuleContext, RuleResult } from './status-rules'

/** Whether the Status answer the host applied at this step wrote a change. */
function isAnswerWritten(result: StepResult): boolean {
  const call = result.calls.find(c => c.kind === 'status')

  return call !== undefined && call.overLimit === null && parseStatus(call.answers.at(-1) ?? null)?.kind === 'ops'
}

function isOpportunity(reads: Reads, { step, result }: RuleContext): boolean {
  if (step.call === undefined) return false
  const isFactsChanged = result.facts.changed.length > 0
  if (reads === 'quiet') return !isFactsChanged

  return isAnswerWritten(result) || (reads === 'facts' && isFactsChanged)
}

/** Runs every rule on one step. `previous` is what they found at the last step with a call. */
export function gradeStep(ctx: RuleContext, previous: RuleResult[] = []): RuleResult[] {
  return RULES.map(r => {
    const failures = r.failures(ctx)
    const keyOf = r.key ?? ((f: string) => f)
    const before = new Set((previous.find(p => p.rule === r.id)?.failures ?? []).map(keyOf))

    return {
      rule: r.id,
      property: r.property,
      failures,
      fresh: failures.filter(f => !before.has(keyOf(f))),
      isOpportunity: ctx.step.call !== undefined && (r.opportunity?.(ctx) ?? isOpportunity(r.reads, ctx)),
      until: r.until ?? null,
    }
  })
}

/** Runs every rule on each step of a replay's run, each step against the state the step before left. */
export function gradeReplay(replay: Replay, steps: StepResult[]): RuleResult[][] {
  const start = { overview: startSession(replay).ledger.overview, facts: { ...replay.start.facts, changed: [] } }
  let lastCalled: RuleResult[] = []

  return steps.map((result, n) => {
    const prev = steps[n - 1]
    const before = prev ? { overview: prev.session.ledger.overview, facts: prev.facts } : start
    const step = replay.steps[n]!
    const graded = gradeStep({ step, result, before }, lastCalled)
    if (step.call) lastCalled = graded
    return graded
  })
}

/** The failures that count against a run: every rule's but those that wait on a change not built yet. */
export function blockingFailures(results: RuleResult[]): RuleResult[] {
  return results.filter(r => r.until === null && r.failures.length > 0)
}

/**
 * How one rule at one step counts toward its rate: a fail when a failure first appears there, a pass when it could
 * have failed and didn't, and nothing when it could not newly fail or its only failures were already there.
 */
export function tally(r: RuleResult): 'pass' | 'fail' | null {
  if (!r.isOpportunity) return null
  if (r.fresh.length > 0) return 'fail'

  return r.failures.length > 0 ? null : 'pass'
}
