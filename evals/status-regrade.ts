/**
 * Grades the runs in Status results files again with the current rules and pass bar, from their recorded answers.
 * It makes no model call. A run whose replay changed since it was recorded is reported and skipped.
 *
 * Usage: node status-regrade.mjs <results.json>...
 */
import { readFileSync } from 'node:fs'

import { alphaPerTest, blockAt, interval, TOLERANCE } from './status-bar'
import { gradeReplay, tally } from './status-grade'
import { runReplay } from './status-replay'
import type { Agent, CallLog, ModelCall } from './status-replay'
import { REPLAYS } from './status-replays'
import { RULES } from './status-rules'
import type { RuleResult } from './status-rules'

type RecordedRun = { agent: Agent; name: string; run: number; steps: { calls: CallLog[] }[] }

/** The recorded answers in the order the replay asks for them. A call the host dropped answers nothing. */
function recorded(run: RecordedRun): { ask: ModelCall; left: () => number } {
  const queue = run.steps.flatMap(s => s.calls.flatMap(c => (c.overLimit === null ? c.answers : [null])))

  return {
    ask: async () => {
      if (queue.length === 0) throw new Error('the record ran out of answers')
      return { text: queue.shift()! }
    },
    left: () => queue.length,
  }
}

const runs = process.argv
  .slice(2)
  .flatMap(path => (JSON.parse(readFileSync(path, 'utf8')) as { results: RecordedRun[] }).results)
  .filter(r => r.steps.length > 0)

const graded: { agent: Agent; name: string; steps: RuleResult[][] }[] = []
for (const run of runs) {
  const replay = REPLAYS.find(r => r.name === run.name)
  if (!replay) {
    console.log(`skipped ${run.agent} ${run.name} run ${run.run}: no such replay now`)
    continue
  }
  const { ask, left } = recorded(run)
  const steps = await runReplay(replay, { agent: run.agent, ask }).catch((e: Error) => e)
  if (steps instanceof Error || left() > 0 || steps.length !== run.steps.length) {
    console.log(`skipped ${run.agent} ${run.name} run ${run.run}: the replay asks differently than it was recorded`)
    continue
  }
  graded.push({ agent: run.agent, name: run.name, steps: gradeReplay(replay, steps) })
}

const spreadAlpha = alphaPerTest('spread', RULES.length * 2)
for (const agent of [...new Set(graded.map(g => g.agent))]) {
  const mine = graded.filter(g => g.agent === agent)
  console.log(`\n${agent}: ${mine.length} runs`)
  for (const rule of RULES) {
    const tallies = mine.flatMap(g => g.steps.map(s => tally(s.find(x => x.rule === rule.id)!)))
    const fails = tallies.filter(t => t === 'fail').length
    const n = tallies.filter(t => t !== null).length
    const raw = mine.flatMap(g => g.steps.map(s => s.find(x => x.rule === rule.id)!)).filter(r => r.failures.length > 0)
    if (n === 0 && raw.length === 0) continue
    const [low, high] = interval(fails, n)
    const at = blockAt(n, TOLERANCE.modelRule, spreadAlpha)
    const verdict = rule.until ? `known failing, until ${rule.until}` : fails >= at ? 'blocks' : 'passes'
    console.log(
      `  ${rule.id}: ${fails} of ${n} counted (95% ${low.toFixed(2)}-${high.toFixed(2)}), blocks at ${at > n ? 'never' : at}; ${raw.length} step-runs show a failure; ${verdict}`,
    )
  }
}
