import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { CLAUDE_CODE } from '../hooks/model-text'
import { statusSystem } from '../hooks/status-prompt'
import { GOAL_PARTS } from '../hooks/status-prompt-goal'
import type { GoalPartId } from '../hooks/status-prompt-goal'
import { systemText } from '../hooks/ledger-prompt'
import { CODEX } from '../codex/src/texts'
import { run } from '../codex/src/run'
import { codexAsk, MODEL } from '../codex/src/update'
import { claude, CLAUDE_MODEL } from './claude-model'
import { codexCli } from './codex-cli'
import { BudgetError, provenance, resultsPath, runCount, runJobs, writeResults } from './harness'
import type { Job, Run } from './harness'
import { factsText } from './status-facts'
import { JUDGE_CHECKS, judgePrompt, mistakeKind, pageMistakes, parseJudgeAnswer } from './status-judge'
import type { JudgePageSet, JudgeVerdict } from './status-judge'
import { judgeSystemText } from './status-judge-text'
import { LIMITS, runReplay } from './status-replay'
import type { Agent, CallAnswer, ModelCall, Replay } from './status-replay'
import { REPLAYS } from './status-replays'
import { blockingFailures, gradeReplay } from './status-grade'
import { holdFailures, knownFailing, layerTests, printLayers, reasks, stepName, unjudgedTargets } from './status-report'
import type { GradedCase, ReplayRun, StepRecord } from './status-report'

type RunRecord = Run & ReplayRun

const ROOT = process.env.INBOX_EVAL_ROOT ?? process.cwd()
const JUDGE_MODEL = 'opus'
const JUDGE_EFFORT = 'high'
/** The most Status calls one run makes, both models together. A run that would pass it stops with no grade. */
const STATUS_CALLS_MAX = 200
/** A call that fails before the model answers is tried this many more times, from the same prompt. */
const CALL_RETRIES = 2
const CALL_RETRY_WAIT_MS = 10_000

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    runs: { type: 'string' },
    replay: { type: 'string' },
    judge: { type: 'boolean', default: false },
    'judge-pages': { type: 'string' },
    'judge-set': { type: 'string' },
    without: { type: 'string' },
    out: { type: 'string' },
  },
})

const AGENTS: Record<string, Agent[]> = { both: ['claude', 'codex'], claude: ['claude'], codex: ['codex'] }
const agents = AGENTS[values.agent]
if (!agents) throw new Error(`Unknown --agent ${values.agent}. Use claude, codex or both.`)
const wanted = values.replay?.split(',')
const unknown = (wanted ?? []).filter(n => !REPLAYS.some(r => r.name === n))
if (unknown.length > 0) throw new Error(`Unknown --replay ${unknown.join(', ')}`)
const replays = REPLAYS.filter(r => !wanted || wanted.includes(r.name))
const without = (values.without?.split(',') ?? []) as GoalPartId[]
const unknownParts = without.filter(id => !(id in GOAL_PARTS))
if (unknownParts.length > 0)
  throw new Error(`Unknown --without ${unknownParts.join(', ')}. Use ${Object.keys(GOAL_PARTS).join(', ')}.`)
/** The Status call's system text: the shipped one, or a copy without the goal rules `--without` names. */
const statusSystemText = statusSystem(without)
const judgeSets = values['judge-set'] === undefined ? [1, 2] : [Number(values['judge-set'])]
if (!judgeSets.every(n => n === 1 || n === 2))
  throw new Error(`Unknown --judge-set ${values['judge-set']}. Use 1 or 2.`)

const judgeSystem = judgeSystemText(ROOT)
const isJudgeWritten = judgeSystem !== '' && !judgeSystem.startsWith('PLACEHOLDER')
const isJudging = values.judge || values['judge-pages'] !== undefined
if (isJudging && !isJudgeWritten)
  throw new Error("The judge's instructions in evals/status-judge/ are still a placeholder.")

const about = provenance(
  values['judge-pages'] !== undefined ? 'status-judge' : 'status',
  { claude: 'claude', codex: codexCli },
  {
    'status systemText': statusSystemText,
    'systemText claude': systemText(CLAUDE_CODE),
    'systemText codex': systemText(CODEX),
    judge: judgeSystem,
    models: JSON.stringify({ claude: CLAUDE_MODEL, codex: MODEL, judge: JUDGE_MODEL, judgeEffort: JUDGE_EFFORT }),
    runner: readFileSync(process.argv[1]!, 'utf8'),
  },
)
const path = resultsPath(values.out, about)

async function judge(
  input: Parameters<typeof judgePrompt>[0],
): Promise<{ answer: string | null; verdicts: JudgeVerdict[] | null }> {
  const { text } = await claude(judgePrompt(input), judgeSystem, JUDGE_MODEL, JUDGE_EFFORT)
  if (text === null) throw new Error('the judge gave no answer')

  return { answer: text, verdicts: parseJudgeAnswer(text) }
}

if (values['judge-pages'] !== undefined) await checkJudge(values['judge-pages'])

/** Judges every page in the chosen sets, once, and prints each wrong verdict. Exits 0 only when every page was called right. */
async function checkJudge(dir: string): Promise<never> {
  const sets = judgeSets.map(n => JSON.parse(readFileSync(join(dir, `set-${n}.json`), 'utf8')) as JudgePageSet)
  type PageRun = Run & { set: number; answer: string | null; mistakes: string[] }
  const jobs: Job<PageRun>[] = sets.flatMap(s =>
    s.pages.map(page => {
      const base = {
        agent: 'judge',
        name: page.id,
        run: 0,
        model: null,
        requested: JUDGE_MODEL,
        attempts: 1,
        earlier: [],
        durationMs: 0,
        set: s.set,
      }
      return {
        go: async () => {
          const { answer, verdicts } = await judge(page)
          const mistakes = pageMistakes(page, verdicts)
          return { ...base, answer, mistakes, error: null, failed: mistakes }
        },
        unrun: (error: string) => ({ ...base, answer: null, mistakes: [], error, failed: [] }),
      }
    }),
  )
  const { results, stopped } = await runJobs(jobs, so => writeResults(path, about, so))
  writeResults(path, about, results, stopped)
  for (const s of sets) {
    const mine = results.filter(r => r.set === s.set)
    const right = mine.filter(r => !r.error && r.mistakes.length === 0)
    console.log(`Set ${s.set}: ${right.length} of ${s.pages.length} pages called right`)
    for (const r of mine.filter(x => x.error || x.mistakes.length > 0)) {
      const page = s.pages.find(p => p.id === r.name)!
      const why = r.error ?? r.mistakes.map(m => mistakeKind(page, m)).join('; ')
      console.log(`  x ${r.name}: ${why}`)
    }
  }
  console.log(`Results: ${path}`)
  const isRight =
    results.length === sets.reduce((n, s) => n + s.pages.length, 0) &&
    results.every(r => !r.error && r.mistakes.length === 0)
  process.exit(stopped !== null ? 3 : isRight ? 0 : 1)
}

const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
// Without auth.json, codexAsk runs the model in the person's own Codex home, where it reads their AGENTS.md.
if (agents.includes('codex') && !existsSync(join(codexHome, 'auth.json')))
  throw new Error(`The Codex runs need a Codex sign-in in ${join(codexHome, 'auth.json')}, not the keyring`)
const codexData = mkdtempSync(join(tmpdir(), 'inbox-eval-'))
const askCodex = codexAsk(run, codexCli, codexData, codexHome)

let statusCalls = 0
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The agent's model call. A call that gives nothing before the host's time limit failed outside the model, so it is
 * tried again from the same prompt, and then throws, so the run cannot be graded. One past the limit is the host's to
 * drop. Each Status call, a re-ask or a retry included, counts toward `STATUS_CALLS_MAX`.
 */
function modelCall(agent: Agent): ModelCall {
  const once = async (prompt: string, system: string): Promise<CallAnswer> => {
    const started = Date.now()
    const answer =
      agent === 'codex'
        ? { text: await askCodex(prompt, system), model: null, outputTokens: null }
        : await claude(prompt, system)
    const isWithinTime = Date.now() - started <= LIMITS[agent].ms
    if (answer.text === null && isWithinTime) throw new Error(`${agent} gave no answer`)

    return answer
  }

  return async (prompt, system, kind) => {
    for (let tries = 0; ; tries++) {
      if (kind === 'status' && ++statusCalls > STATUS_CALLS_MAX)
        throw new BudgetError(`the run reached ${STATUS_CALLS_MAX} Status calls`)
      try {
        return await once(prompt, system)
      } catch (e) {
        if (tries >= CALL_RETRIES) throw e
        await wait(CALL_RETRY_WAIT_MS * (tries + 1))
      }
    }
  }
}

async function once(agent: Agent, replay: Replay, n: number): Promise<RunRecord> {
  const steps = await runReplay(replay, { agent, ask: modelCall(agent), system: statusSystemText })
  const graded = gradeReplay(replay, steps)
  const records: StepRecord[] = []
  let previous: string | null = null
  for (const [i, s] of steps.entries()) {
    const record: StepRecord = {
      label: s.label,
      page: s.text,
      calls: s.calls,
      isStatusFailed: s.isStatusFailed,
      rules: graded[i]!,
    }
    if (values.judge && replay.steps[i]!.checkpoint) {
      record.judge = await judge({ page: s.text, previous, facts: factsText(s.facts) })
      previous = s.text
    }
    records.push(record)
  }
  const failed = records.flatMap((r, i) =>
    blockingFailures(r.rules).map(x => `${stepName(replay, i)} ${x.rule}: ${x.failures.join('; ')}`),
  )

  return { ...job(agent, replay, n), error: null, failed, attempts: 1, earlier: [], durationMs: 0, steps: records }
}

function job(agent: Agent, replay: Replay, n: number) {
  return { agent, name: replay.name, run: n, model: null, requested: agent === 'codex' ? MODEL : CLAUDE_MODEL }
}

/** A replay's runs per model, or a short case's, unless `--runs` sets one count for every case. */
const runsOf = (replay: Replay) => (values.runs !== undefined ? runCount(values.runs) : replay.isShort ? 5 : 3)
const jobs: Job<RunRecord>[] = agents.flatMap(agent =>
  replays.flatMap(replay =>
    Array.from({ length: runsOf(replay) }, (_, n) => ({
      go: () => once(agent, replay, n),
      unrun: (error: string): RunRecord => ({
        ...job(agent, replay, n),
        error,
        failed: [],
        attempts: 1,
        earlier: [],
        durationMs: 0,
        steps: [],
      }),
    })),
  ),
)
const { results, stopped } = await runJobs(jobs, so => writeResults(path, about, so), 0)
writeResults(path, about, results, stopped)
rmSync(codexData, { recursive: true, force: true })

const ungraded = agents.flatMap(agent =>
  replays.flatMap(replay => {
    const mine = results.filter(r => r.agent === agent && r.name === replay.name)
    const graded = mine.filter(r => !r.error).length
    if (graded === runsOf(replay)) return []
    return [
      `${agent} ${replay.name}: ${graded} of ${runsOf(replay)} runs could be graded`,
      ...mine.flatMap(r => (r.error ? [`  ${r.error}`] : [])),
    ]
  }),
)
const cases: GradedCase[] = replays.map(replay => ({
  replay,
  runs: results.filter(r => r.name === replay.name && !r.error),
}))
const tests = layerTests(cases, agents, values.judge)
for (const line of layerLines(tests)) console.log(line)
const isBlocked = tests.some(isBlocking)
const holds = holdFailures(cases)
console.log(`code holds: ${holds.length === 0 ? 'none failed' : `${holds.length} failed`}`)
for (const h of holds) console.log(`  x ${h}`)
const known = knownFailing(cases)
if (known.length > 0) console.log(`known failing: ${known.join('; ')}`)
const unjudged = unjudgedTargets(cases, values.judge)
if (unjudged.length > 0) console.log(`needs --judge: ${unjudged.join(', ')}`)
for (const agent of agents) {
  const r = reasks(cases, agent)
  console.log(`${agent} re-asked ${r.reasked} of ${r.calls} Status calls for a readable answer`)
}
console.log('A target counts a failure on any piece; counting only the pieces its step changes is not built.')
for (const u of ungraded) console.log(`not graded: ${u}`)
console.log(`Status calls: ${Math.min(statusCalls, STATUS_CALLS_MAX)} of ${STATUS_CALLS_MAX}`)
if (stopped !== null) console.log(`Stopped: ${stopped}`)
console.log(`Results: ${path}${about.isDirty ? ' (the tree had uncommitted changes)' : ''}`)
const isOverBudget = statusCalls > STATUS_CALLS_MAX
const isFailed = isBlocked || holds.length > 0
process.exit(isOverBudget ? 2 : stopped !== null ? 3 : isFailed ? 1 : ungraded.length > 0 ? 2 : 0)
