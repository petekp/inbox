/**
 * Grades the runs in Status results files again from their recorded answers, with the current rules and the release
 * report's layers, bar and code holds. It makes no model call and runs no judge, so judge checks are left out. A run
 * whose replay changed since it was recorded is reported and skipped.
 *
 * Usage: node status-regrade.mjs <results.json>...
 */
import { readFileSync } from 'node:fs'

import { gradeReplay } from './status-grade'
import { runReplay } from './status-replay'
import type { Agent, CallLog, ModelCall } from './status-replay'
import { REPLAYS } from './status-replays'
import { holdFailures, isBlocking, knownFailing, layerLines, layerTests } from './status-report'
import type { GradedCase, ReplayRun } from './status-report'

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

const graded: ReplayRun[] = []
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
  const rules = gradeReplay(replay, steps)
  graded.push({
    agent: run.agent,
    name: run.name,
    run: run.run,
    error: null,
    steps: steps.map((s, i) => ({
      label: s.label,
      page: s.text,
      calls: s.calls,
      isStatusFailed: s.isStatusFailed,
      rules: rules[i]!,
    })),
  })
}

const cases: GradedCase[] = REPLAYS.map(replay => ({
  replay,
  runs: graded.filter(r => r.name === replay.name),
})).filter(c => c.runs.length > 0)
const agents = [...new Set(graded.map(r => r.agent as Agent))]
const tests = layerTests(cases, agents, false)
for (const line of layerLines(tests)) console.log(line)
const holds = holdFailures(cases)
console.log(`code holds: ${holds.length === 0 ? 'none failed' : `${holds.length} failed`}`)
for (const h of holds) console.log(`  x ${h}`)
const known = knownFailing(cases)
if (known.length > 0) console.log(`known failing: ${known.join('; ')}`)
console.log(tests.some(isBlocking) || holds.length > 0 ? 'blocked' : 'passes')
