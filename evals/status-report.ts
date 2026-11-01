import { alphaPerTest, blockAt, interval, TOLERANCE } from './status-bar'
import type { Family } from './status-bar'
import { tally } from './status-grade'
import { JUDGE_CHECKS } from './status-judge'
import type { JudgeVerdict } from './status-judge'
import type { Agent, Replay, StepResult } from './status-replay'
import { RULES } from './status-rules'
import type { RuleResult } from './status-rules'

export type StepRecord = {
  label: string
  page: string
  calls: StepResult['calls']
  isStatusFailed: boolean
  rules: RuleResult[]
  judge?: { answer: string | null; verdicts: JudgeVerdict[] | null }
}

/** One run of a case, as the report reads it. The runner's records hold more. */
export type ReplayRun = { agent: string; name: string; run: number; error: string | null; steps: StepRecord[] }

/** A case and the runs of it that could be graded. */
export type GradedCase = { replay: Replay; runs: ReplayRun[] }

/** One test of the pass bar: a share of failures, which blocks at `blocksAt` failures or more. */
export type LayerTest = { family: Family; name: string; failures: number; n: number; p0: number; blocksAt: number }

type Tally = 'pass' | 'fail' | null

const RULE_IDS = new Set(RULES.map(r => r.id))
const JUDGE_ONLY = new Set<string>(JUDGE_CHECKS.map(c => c.id).filter(id => !RULE_IDS.has(id)))
const FAMILIES: Family[] = ['replay', 'short', 'spread', 'judge']

/** A step as the replay tables in `docs/status-replays.md` name it: by its call's number, or by its label. */
export function stepName(replay: Replay, i: number): string {
  const step = replay.steps[i]!

  return step.call ? `step ${replay.steps.slice(0, i + 1).filter(s => s.call).length}` : `"${step.label}"`
}

function toleranceOf(id: string): number {
  if (id === 'proposal-when-stated') return TOLERANCE.missedProposal

  return JUDGE_ONLY.has(id) ? TOLERANCE.judgeCheck : TOLERANCE.modelRule
}

/** A judge check at one checkpoint, counted once: a failure the run's checkpoint before also had is carried. */
function judgeTally(run: ReplayRun, i: number, check: string): Tally {
  const verdictAt = (n: number) => run.steps[n]?.judge?.verdicts?.find(v => v.check === check)?.verdict ?? null
  const verdict = verdictAt(i)
  if (verdict !== 'fail') return verdict === 'pass' ? 'pass' : null
  let before = i - 1
  while (before >= 0 && !run.steps[before]!.judge?.verdicts) before--

  return before >= 0 && verdictAt(before) === 'fail' ? null : 'fail'
}

function tallyOf(run: ReplayRun, i: number, id: string): Tally {
  if (JUDGE_ONLY.has(id)) return judgeTally(run, i, id)
  const r = run.steps[i]?.rules.find(x => x.rule === id)

  return r ? tally(r) : null
}

/** The step targets no run could grade, because they are judge checks and the run had no judge. */
export function unjudgedTargets(cases: GradedCase[], isJudged: boolean): string[] {
  if (isJudged) return []

  return cases.flatMap(({ replay }) =>
    replay.steps.flatMap((step, i) =>
      (step.targets ?? []).filter(t => JUDGE_ONLY.has(t)).map(t => `${replay.name} ${stepName(replay, i)} ${t}`),
    ),
  )
}

/**
 * Every test of the four layers. A replay step's target pools both models' runs; a short case's is judged per model.
 * The spread layer pools each rule over a model's whole run, and the judge layer each check over its checkpoints.
 * Rules that wait on a change not built yet, and code holds, are in no layer.
 */
export function layerTests(cases: GradedCase[], agents: Agent[], isJudged: boolean): LayerTest[] {
  const isWaiting = (id: string) => RULES.find(r => r.id === id)?.until !== undefined
  const drafts: { family: Family; name: string; id: string; tallies: Tally[] }[] = []
  for (const { replay, runs } of cases)
    for (const [i, step] of replay.steps.entries())
      for (const t of step.targets ?? []) {
        if (isWaiting(t) || (JUDGE_ONLY.has(t) && !isJudged)) continue
        const name = `${replay.name} ${stepName(replay, i)} ${t}`
        const groups = replay.isShort ? agents.map(a => runs.filter(r => r.agent === a)) : [runs]
        for (const [g, group] of groups.entries())
          drafts.push({
            family: replay.isShort ? 'short' : 'replay',
            name: replay.isShort ? `${agents[g]} ${name}` : name,
            id: t,
            tallies: group.map(r => tallyOf(r, i, t)),
          })
      }
  for (const agent of agents) {
    const mine = cases.flatMap(c => c.runs.filter(r => r.agent === agent))
    for (const rule of RULES.filter(r => !r.isHold && r.until === undefined))
      drafts.push({
        family: 'spread',
        name: `${agent} ${rule.id}`,
        id: rule.id,
        tallies: mine.flatMap(r => r.steps.map((_, i) => tallyOf(r, i, rule.id))),
      })
    if (!isJudged) continue
    for (const check of JUDGE_CHECKS)
      drafts.push({
        family: 'judge',
        name: `${agent} ${check.id}`,
        id: check.id,
        tallies: mine.flatMap(r => r.steps.map((_, i) => judgeTally(r, i, check.id))),
      })
  }

  return drafts.map(d => {
    const n = d.tallies.filter(t => t !== null).length
    const p0 = d.family === 'judge' ? TOLERANCE.judgeCheck : toleranceOf(d.id)
    const alpha = alphaPerTest(d.family, drafts.filter(x => x.family === d.family).length)

    return {
      family: d.family,
      name: d.name,
      failures: d.tallies.filter(t => t === 'fail').length,
      n,
      p0,
      blocksAt: blockAt(n, p0, alpha),
    }
  })
}

export const isBlocking = (t: LayerTest) => t.failures >= t.blocksAt

/** Each code hold that failed, in any run at any step. Any one blocks. */
export function holdFailures(cases: GradedCase[]): string[] {
  return cases.flatMap(({ replay, runs }) =>
    runs.flatMap(run =>
      run.steps.flatMap((s, i) =>
        s.rules
          .filter(r => r.isHold && r.failures.length > 0)
          .map(
            r =>
              `${run.agent} ${replay.name} run ${run.run} ${stepName(replay, i)} ${r.rule}: ${r.failures.join('; ')}`,
          ),
      ),
    ),
  )
}

/** The rules that wait on a change not built yet and failed somewhere, with what they wait on. */
export function knownFailing(cases: GradedCase[]): string[] {
  const failed = new Set(
    cases.flatMap(c => c.runs.flatMap(r => r.steps.flatMap(s => s.rules.filter(x => x.until && x.failures.length)))),
  )

  return [...new Set([...failed].map(r => `${r.rule}, until ${r.until}`))]
}

/** How many of each model's Status calls the host had to ask again for a readable answer. Counted toward no bar. */
export function reasks(cases: GradedCase[], agent: Agent): { reasked: number; calls: number } {
  const calls = cases.flatMap(c =>
    c.runs.filter(r => r.agent === agent).flatMap(r => r.steps.flatMap(s => s.calls.filter(x => x.kind === 'status'))),
  )

  return { reasked: calls.filter(c => c.answers.length > 1).length, calls: calls.length }
}

const share = (x: number) => x.toFixed(2)

/** Every test by layer, one line each: its failures, `n`, 95% interval and blocking count. */
export function layerLines(tests: LayerTest[]): string[] {
  return FAMILIES.flatMap(family => {
    const mine = tests.filter(t => t.family === family)
    if (mine.length === 0) return []
    return [
      `${family}: ${mine.length} tests`,
      ...mine.map(t => {
        const [low, high] = interval(t.failures, t.n)
        const mark = isBlocking(t) ? 'x ' : t.n > 0 && t.failures / t.n > t.p0 ? 'for reading' : 'ok'
        const blocks = t.blocksAt > t.n ? 'cannot block' : `blocks at ${t.blocksAt}`
        return `  ${mark} ${t.name}: ${t.failures} of ${t.n} (95%: ${share(low)}-${share(high)}, p0 ${t.p0}), ${blocks}`
      }),
    ]
  })
}
