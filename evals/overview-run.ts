import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { CLAUDE_CODE, OVERVIEW_SYSTEM, systemText } from '../hooks/model-text'
import { CODEX } from '../codex/src/texts'
import { run } from '../codex/src/run'
import { codexAsk, MODEL } from '../codex/src/update'
import { claude, CLAUDE_MODEL } from './claude-model'
import { codexCli } from './codex-cli'
import { provenance, resultsPath, runCount, runJobs, writeResults } from './harness'
import type { Job, Run } from './harness'
import { factsText } from './overview-facts'
import { JUDGE_CHECKS, judgePrompt, mistakeKind, pageMistakes, parseJudgeAnswer } from './overview-judge'
import type { JudgePageSet, JudgeVerdict } from './overview-judge'
import { LIMITS, runReplay } from './overview-replay'
import type { Agent, ModelCall, Replay, StepResult } from './overview-replay'
import { REPLAYS } from './overview-replays'
import { gradeReplay, RULES } from './overview-rules'
import type { RuleResult } from './overview-rules'

const ROOT = process.env.INBOX_EVAL_ROOT ?? process.cwd()
const JUDGE_MODEL = 'opus'
const JUDGE_EFFORT = 'high'
/** A check passes at a step when it passes in at least this share of the runs. */
const PASS_SHARE = 2 / 3

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    runs: { type: 'string', default: '3' },
    replay: { type: 'string' },
    judge: { type: 'boolean', default: false },
    'judge-pages': { type: 'string' },
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

const judgeFile = readFileSync(join(ROOT, 'evals', 'overview-judge.md'), 'utf8')
const judgeSystem = judgeFile.split('\n---\n')[1]?.trim() ?? ''
const isJudgeWritten = judgeSystem !== '' && !judgeSystem.startsWith('PLACEHOLDER')
const isJudging = values.judge || values['judge-pages'] !== undefined
if (isJudging && !isJudgeWritten)
  throw new Error("The judge's instructions in evals/overview-judge.md are still a placeholder.")

const about = provenance(
  values['judge-pages'] !== undefined ? 'overview-judge' : 'overview',
  { claude: 'claude', codex: codexCli },
  {
    'overview systemText': OVERVIEW_SYSTEM,
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

/** Judges every page in both sets, once, and prints each wrong verdict. Exits 0 only when every page was called right. */
async function checkJudge(dir: string): Promise<never> {
  const sets = [1, 2].map(n => JSON.parse(readFileSync(join(dir, `set-${n}.json`), 'utf8')) as JudgePageSet)
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

/**
 * The agent's model call. A call that gives nothing before the host's time limit failed outside the model, so it
 * throws, and the harness runs the whole replay again. One past the limit is the host's to drop.
 */
function modelCall(agent: Agent): ModelCall {
  return async (prompt, system) => {
    const started = Date.now()
    const answer =
      agent === 'codex'
        ? { text: await askCodex(prompt, system), model: null, outputTokens: null }
        : await claude(prompt, system)
    const isWithinTime = Date.now() - started <= LIMITS[agent].ms
    if (answer.text === null && isWithinTime) throw new Error(`${agent} gave no answer`)

    return answer
  }
}

type StepRecord = {
  label: string
  page: string
  calls: StepResult['calls']
  isOverviewFailed: boolean
  rules: RuleResult[]
  judge?: { answer: string | null; verdicts: JudgeVerdict[] | null }
}

type ReplayRun = Run & { steps: StepRecord[] }

/**
 * A step as the replay tables in `docs/plans/overview.md` name it: by its call's number, or by its label when it
 * makes no call.
 */
function stepName(replay: Replay, i: number): string {
  const step = replay.steps[i]!

  return step.call ? `step ${replay.steps.slice(0, i + 1).filter(s => s.call).length}` : `"${step.label}"`
}

async function once(agent: Agent, replay: Replay, n: number): Promise<ReplayRun> {
  const steps = await runReplay(replay, { agent, ask: modelCall(agent) })
  const graded = gradeReplay(replay, steps)
  const records: StepRecord[] = []
  let previous: string | null = null
  for (const [i, s] of steps.entries()) {
    const record: StepRecord = {
      label: s.label,
      page: s.text,
      calls: s.calls,
      isOverviewFailed: s.isOverviewFailed,
      rules: graded[i]!,
    }
    if (values.judge && replay.steps[i]!.checkpoint) {
      record.judge = await judge({ page: s.text, previous, facts: factsText(s.facts) })
      previous = s.text
    }
    records.push(record)
  }
  const failed = records.flatMap((r, i) =>
    r.rules
      .filter(x => x.until === null && x.failures.length > 0)
      .map(x => `${stepName(replay, i)} ${x.rule}: ${x.failures.join('; ')}`),
  )

  return { ...job(agent, replay, n), error: null, failed, attempts: 1, earlier: [], durationMs: 0, steps: records }
}

function job(agent: Agent, replay: Replay, n: number) {
  return { agent, name: replay.name, run: n, model: null, requested: agent === 'codex' ? MODEL : CLAUDE_MODEL }
}

const runs = runCount(values.runs)
const jobs: Job<ReplayRun>[] = agents.flatMap(agent =>
  replays.flatMap(replay =>
    Array.from({ length: runs }, (_, n) => ({
      go: () => once(agent, replay, n),
      unrun: (error: string): ReplayRun => ({
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
const { results, stopped } = await runJobs(jobs, so => writeResults(path, about, so))
writeResults(path, about, results, stopped)
rmSync(codexData, { recursive: true, force: true })

/**
 * Prints each replay's checks that failed at a step in more runs than the pass bar allows, the checks that failed in
 * one run, the known failing rules, and which targeted steps reproduced their failure.
 */
function reportReplay(agent: Agent, replay: Replay): 'pass' | 'fail' | 'not run' {
  const mine = results.filter(r => r.agent === agent && r.name === replay.name)
  const graded = mine.filter(r => !r.error)
  if (graded.length < runs) {
    console.log(`  ? ${agent} ${replay.name}: not run, ${graded.length} of ${runs} runs could be graded`)
    for (const r of mine.filter(x => x.error)) console.log(`       ${r.error}`)
    return 'not run'
  }
  const needed = Math.ceil(runs * PASS_SHARE)
  const blocking: string[] = []
  const once: string[] = []
  const known = new Set<string>()
  const reproduced: string[] = []
  const missed: string[] = []
  const unjudged: string[] = []
  for (const [i, step] of replay.steps.entries()) {
    const failing = (id: string) =>
      graded.filter(r => {
        const s = r.steps[i]!
        const rule = s.rules.find(x => x.rule === id)
        const verdict = s.judge?.verdicts?.find(v => v.check === id)
        const isJudgeUnread = s.judge !== undefined && s.judge.verdicts === null
        return (
          (rule && rule.failures.length > 0) ||
          verdict?.verdict === 'fail' ||
          (isJudgeUnread && JUDGE_CHECKS.some(c => c.id === id))
        )
      }).length
    const ids = [...RULES.map(r => r.id), ...(values.judge && step.checkpoint ? JUDGE_CHECKS.map(c => c.id) : [])]
    for (const id of ids) {
      const fails = failing(id)
      const until = RULES.find(r => r.id === id)?.until
      if (fails === 0) continue
      if (until) known.add(`${id}, until ${until}`)
      else if (graded.length - fails < needed)
        blocking.push(`${stepName(replay, i)} ${id}: failed in ${fails} of ${graded.length}`)
      else once.push(`${stepName(replay, i)} ${id}: failed in ${fails} of ${graded.length}`)
    }
    for (const t of step.targets ?? []) {
      const isJudgeOnly = !RULES.some(r => r.id === t)
      const list = isJudgeOnly && !values.judge ? unjudged : failing(t) >= needed ? reproduced : missed
      list.push(`${stepName(replay, i)} ${t}`)
    }
  }
  console.log(`${blocking.length === 0 ? '  ok' : '  x '} ${agent} ${replay.name}: ${graded.length} runs`)
  for (const b of blocking) console.log(`       ${b}`)
  for (const o of once) console.log(`       for reading: ${o}`)
  if (known.size > 0) console.log(`       known failing: ${[...known].join('; ')}`)
  console.log(`       reproduced: ${reproduced.join(', ') || 'none'}`)
  console.log(`       not reproduced: ${missed.join(', ') || 'none'}`)
  if (unjudged.length > 0) console.log(`       needs --judge: ${unjudged.join(', ')}`)

  return blocking.length === 0 ? 'pass' : 'fail'
}

const verdicts = agents.flatMap(a => replays.map(r => reportReplay(a, r)))
if (stopped !== null) console.log(`Stopped: ${stopped}`)
console.log(`Results: ${path}${about.isDirty ? ' (the tree had uncommitted changes)' : ''}`)
process.exit(stopped !== null ? 3 : verdicts.includes('fail') ? 1 : verdicts.includes('not run') ? 2 : 0)
