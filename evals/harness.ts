import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** The repo: `scripts/eval.sh` names it, since the runners run as bundles in a temporary folder. */
const ROOT = process.env.INBOX_EVAL_ROOT ?? process.cwd()
/** Calls that fail before a model answers are tried this many more times, after a wait that grows each time. */
const RETRIES = 2
const RETRY_WAIT_MS = 10_000
const PARALLEL = 6

export type Run = {
  agent: string
  name: string
  run: number
  /** The model that answered, as the agent reported it. Null when the agent does not say, as Codex does not. */
  model: string | null
  /** The model the runner asked for. */
  requested: string
  /** Why the run could not be graded: the call failed, timed out, or answered with nothing. */
  error: string | null
  failed: string[]
  attempts: number
  /** Each earlier attempt that could not be graded, as its full record. */
  earlier: object[]
  durationMs: number
}

/** A run that found the session could reach more than the stand-in inbox. The whole run stops, with no retry. */
export class IsolationError extends Error {}

/** A run that would pass its ceiling of model calls. The whole run stops, with no retry, and has no grade. */
export class BudgetError extends Error {}

/**
 * Throws for an unknown case name, for a selection with no cases, and for a check whose pattern is not a valid
 * regular expression, so a typo fails before any model call.
 */
export function selectCases<C extends { name: string; checks: object[] }>(all: C[], names: string | undefined): C[] {
  const wanted = names?.split(',') ?? all.map(c => c.name)
  const unknown = wanted.filter(n => !all.some(c => c.name === n))
  if (unknown.length > 0) throw new Error(`Unknown --case ${unknown.join(', ')}`)
  const chosen = all.filter(c => wanted.includes(c.name))
  if (chosen.length === 0) throw new Error('No cases to run')
  for (const c of chosen)
    for (const check of c.checks)
      for (const value of Object.values(check).flatMap(v => (v && typeof v === 'object' ? Object.values(v) : [v])))
        if (typeof value === 'string') {
          try {
            new RegExp(value, 'i')
          } catch (e) {
            throw new Error(`${c.name}: ${String(e)}`)
          }
        }

  return chosen
}

/**
 * The cases in every JSON file of `folder`, each a list of cases or one case, and the files' text for the results file
 * to hash. Files are read in name order, so a folder always gives the same cases in the same order, and the same hash.
 */
export function readCases<C>(folder: string): { cases: C[]; text: string } {
  const texts = readdirSync(folder)
    .filter(name => name.endsWith('.json'))
    .toSorted()
    .map(name => readFileSync(join(folder, name), 'utf8'))

  return {
    cases: texts.flatMap(text => {
      const data = JSON.parse(text)
      return Array.isArray(data) ? data : [data]
    }),
    text: texts.join(''),
  }
}

export function runCount(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`--runs must be a positive whole number, not ${value}`)

  return n
}

function git(args: string[]): string {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim()
}

function version(cli: string): string | null {
  try {
    return execFileSync(cli, ['--version'], { encoding: 'utf8', timeout: 30_000 }).trim()
  } catch {
    return null
  }
}

export type Provenance = {
  commit: string
  isDirty: boolean
  /** `git diff HEAD` and the untracked files, when the tree had changes. */
  changes: string | null
  date: string
  suite: string
  args: string[]
  clis: Record<string, string | null>
  /**
   * A SHA-256 of each text the models read, the cases, the models asked for, and the bundled runner, which holds the
   * prompt building and the grading, so two runs can be compared without the commit.
   */
  texts: Record<string, string>
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** Call it before any model call, so it describes the tree the run started from. */
export function provenance(suite: string, clis: Record<string, string>, texts: Record<string, string>): Provenance {
  const status = git(['status', '--porcelain'])
  const untracked = status
    .split('\n')
    .filter(l => l.startsWith('?? '))
    .map(l => l.slice(3))

  return {
    commit: git(['rev-parse', 'HEAD']),
    isDirty: status !== '',
    changes: status === '' ? null : `${git(['diff', 'HEAD'])}\n\nUntracked: ${untracked.join(', ') || 'none'}`,
    date: new Date().toISOString(),
    suite,
    args: process.argv.slice(2),
    clis: Object.fromEntries(Object.entries(clis).map(([name, cli]) => [name, version(cli)])),
    texts: Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, sha256(text)])),
  }
}

/** `unrun` builds the result for a run that could not be graded, from why. */
export type Job<R extends Run> = { go: () => Promise<R>; unrun: (error: string) => R }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Runs each job, `PARALLEL` at a time, and retries one whose call failed up to `retries` times. A job that throws
 * becomes a run that could not be graded. An `IsolationError` or `BudgetError` is never retried: it starts no more
 * jobs, and its message is returned as `stopped`. `onResult` gets every result so far each time one lands, so a run cut short keeps them.
 */
export async function runJobs<R extends Run>(
  jobs: Job<R>[],
  onResult: (results: R[]) => void,
  retries = RETRIES,
): Promise<{ results: R[]; stopped: string | null }> {
  const results: R[] = []
  let stopped: string | null = null
  let next = 0
  const attempt = async (job: Job<R>): Promise<R> => {
    const started = Date.now()
    try {
      return { ...(await job.go()), durationMs: Date.now() - started }
    } catch (e) {
      if (e instanceof IsolationError || e instanceof BudgetError) throw e
      return job.unrun(`the runner threw: ${String(e)}`)
    }
  }
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < jobs.length && stopped === null) {
        const job = jobs[next++]!
        try {
          let r = await attempt(job)
          const earlier: object[] = []
          for (let tries = 1; r.error && tries <= retries && stopped === null; tries++) {
            await wait(RETRY_WAIT_MS * tries)
            if (stopped !== null) break
            earlier.push(r)
            r = await attempt(job)
          }
          results.push({ ...r, attempts: earlier.length + 1, earlier })
        } catch (e) {
          stopped = String(e)
          results.push(job.unrun(`stopped the run: ${String(e)}`))
        }
        onResult(results)
      }
    }),
  )

  return { results, stopped }
}

/**
 * The runs of earlier results files, for the rerun rule: a red case's rerun is judged on both runs together. Throws when
 * a file's model-read texts or cases differ from this run's, since its runs would then test something else.
 */
export function earlierRuns<R extends Run>(paths: string | undefined, about: Provenance, out: string): R[] {
  if (!paths) return []

  return paths.split(',').flatMap(path => {
    if (resolve(path) === resolve(out))
      throw new Error(`--with ${path} is also this run's --out, which would replace it`)
    const earlier: Provenance & { results: R[] } = JSON.parse(readFileSync(path, 'utf8'))
    const changed = [
      ...Object.keys(about.texts).filter(k => earlier.texts?.[k] !== about.texts[k]),
      ...Object.keys(about.clis)
        .filter(k => earlier.clis?.[k] !== about.clis[k])
        .map(k => `the ${k} CLI`),
    ]
    if (earlier.suite !== about.suite || changed.length > 0)
      throw new Error(
        `--with ${path} tested other text: ${earlier.suite === about.suite ? changed.join(', ') : 'another suite'}`,
      )

    return earlier.results
  })
}

/** Where a run's results go: `--out`, or a new file in `evals/results/`, which Git ignores. */
export function resultsPath(out: string | undefined, about: Provenance): string {
  return out ?? join(ROOT, 'evals', 'results', `${about.suite}-${about.date.replaceAll(':', '-')}.json`)
}

export function writeResults(path: string, about: Provenance, results: unknown[], stopped: string | null = null) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ ...about, stopped, results }, null, 1))
}

/** A case's pass count from a run long enough to judge later runs by, keyed `<agent> <case>`. */
export type Baseline = { passed: number; runs: number; commit: string; date: string; models: string[] }
export type Baselines = Record<string, Baseline>

const BASELINES = join(ROOT, 'evals', 'baselines.json')
/**
 * A later run is below a baseline when a pass count that low would happen less often than this by chance. At 0.05, a
 * 20 of 20 baseline flagged 6 of 8, which a case passing 95% of the time scores in 6% of runs.
 */
const BELOW = 0.01

export function readBaselines(suite: string): Baselines {
  if (!existsSync(BASELINES)) return {}
  const all: Record<string, Baselines> = JSON.parse(readFileSync(BASELINES, 'utf8'))

  return all[suite] ?? {}
}

/** The fewest graded runs a baseline is set from. */
const BASELINE_RUNS = 20

/**
 * Saves the counts of the selected cases as their baselines, replacing each one's earlier baseline. A case with fewer
 * than `BASELINE_RUNS` runs, or with a run that could not be graded, keeps its earlier baseline. Returns why each such
 * case was skipped.
 */
export function writeBaselines(suite: string, about: Provenance, results: Run[], names: string[]): string[] {
  const all: Record<string, Baselines> = existsSync(BASELINES) ? JSON.parse(readFileSync(BASELINES, 'utf8')) : {}
  const mine = { ...all[suite] }
  const skipped: string[] = []
  for (const key of new Set(results.filter(r => names.includes(r.name)).map(r => `${r.agent} ${r.name}`))) {
    const runs = results.filter(r => `${r.agent} ${r.name}` === key)
    if (runs.some(r => r.error !== null)) {
      skipped.push(`${key}: a run could not be graded`)
      continue
    }
    if (runs.length < BASELINE_RUNS) {
      skipped.push(`${key}: ${runs.length} runs, fewer than ${BASELINE_RUNS}`)
      continue
    }
    mine[key] = {
      passed: runs.filter(r => !r.error && r.failed.length === 0).length,
      runs: runs.length,
      commit: about.commit,
      date: about.date,
      models: [...new Set(runs.map(modelOf))],
    }
  }
  writeFileSync(BASELINES, `${JSON.stringify({ ...all, [suite]: mine }, null, 2)}\n`)

  return skipped
}

const modelOf = (r: Run) => r.model ?? `${r.requested} (requested)`

/** P(X <= passed) for X ~ Binomial(runs, rate), summed in logs so a long run does not underflow to 0. */
function chanceOfAtMost(passed: number, runs: number, rate: number): number {
  let sum = 0
  let logTerm = runs * Math.log(1 - rate)
  for (let k = 0; k <= passed; k++) {
    sum += Math.exp(logTerm)
    logTerm += Math.log(runs - k) - Math.log(k + 1) + Math.log(rate) - Math.log(1 - rate)
  }

  return Math.min(1, sum)
}

/**
 * Whether a pass count is unlikely under the baseline's rate. The rate is smoothed, (passed + 1) / (runs + 2), so a
 * baseline of 20 of 20 does not flag every later miss.
 */
export function isBelowBaseline(passed: number, runs: number, b: Baseline): boolean {
  const rate = (b.passed + 1) / (b.runs + 2)

  return chanceOfAtMost(passed, runs, rate) < BELOW
}

export type Verdict = 'pass' | 'fail' | 'not run'

/**
 * Prints each case's result and returns the run's verdict: 'fail' when a graded case failed, else 'not run' when a
 * case had a run that could not be graded, else 'pass'. A case with such a run passes or fails on nothing: its failed
 * calls say nothing about the text under test.
 */
export function report<C extends { name: string; min?: Partial<Record<string, number>> }>(
  agents: string[],
  cases: C[],
  results: Run[],
  /** The runs each case needs graded. Runs from `--with` count, so a rerun can make up an earlier failed call. */
  runs: number,
  min: number,
  baselines: Baselines,
  extra: (agent: string, c: C, mine: Run[]) => string = () => '',
): Verdict {
  let isFailing = false
  let isUnrun = false
  for (const agent of agents)
    for (const c of cases) {
      const mine = results.filter(r => r.agent === agent && r.name === c.name)
      const unrun = mine.filter(r => r.error)
      const graded = mine.filter(r => !r.error)
      const passed = graded.filter(r => r.failed.length === 0).length
      const reported = [...new Set(mine.map(r => r.model).filter(Boolean))]
      const models = reported.length > 0 ? reported.join(', ') : `requested ${mine[0]?.requested ?? 'unknown model'}`
      const note = extra(agent, c, mine)
      if (graded.length < runs) {
        isUnrun = true
        const why =
          mine.length === 0
            ? 'no run finished'
            : `${unrun.length} of ${mine.length} runs could not be graded, so ${graded.length} of the ${runs} needed were; of those, ${passed} passed (${models})${note}`
        console.log(`  ? ${agent} ${c.name}: not run, ${why}`)
        for (const r of unrun) console.log(`       ${r.error}`)
        continue
      }
      const stored = baselines[`${agent} ${c.name}`]
      const isSameModel = stored !== undefined && graded.every(r => stored.models.includes(modelOf(r)))
      const baseline = isSameModel ? stored : undefined
      const isBelow = baseline !== undefined && isBelowBaseline(passed, graded.length, baseline)
      const isPass = passed / graded.length >= (c.min?.[agent] ?? min) && !isBelow
      if (!isPass) isFailing = true
      const against = baseline
        ? `, baseline ${baseline.passed} of ${baseline.runs}${isBelow ? ': below it' : ''}`
        : stored
          ? `, baseline from ${stored.models.join(', ')} not compared`
          : ''
      const ungraded = unrun.length > 0 ? `, ${unrun.length} more could not be graded` : ''
      console.log(
        `${isPass ? '  ok' : '  x '} ${agent} ${c.name}: ${passed} of ${graded.length}${ungraded} (${models})${against}${note}`,
      )
      if (!isPass) for (const r of graded) if (r.failed.length > 0) console.log(`       ${r.failed.join('; ')}`)
    }

  return isFailing ? 'fail' : isUnrun ? 'not run' : 'pass'
}

/**
 * Prints why the run stopped and where its results are, saves the baselines when asked and the run can set them, and
 * exits: 0 passed, 1 a case failed, 2 a case could not be graded, 3 the run stopped.
 */
export function finish(
  about: Provenance,
  path: string,
  results: Run[],
  stopped: string | null,
  verdict: Verdict,
  isSettingBaseline: boolean,
  names: string[],
): never {
  if (stopped !== null) console.log(`Stopped: ${stopped}`)
  console.log(`Results: ${path}${about.isDirty ? ' (the tree had uncommitted changes)' : ''}`)
  if (isSettingBaseline) {
    const unfit = stopped !== null ? 'the run stopped' : about.isDirty ? 'the tree had uncommitted changes' : null
    if (unfit) console.log(`Saved no baselines: ${unfit}.`)
    else {
      const skipped = writeBaselines(about.suite, about, results, names)
      console.log('Saved the baselines of the cases selected.')
      for (const why of skipped) console.log(`  No baseline for ${why}.`)
    }
  }
  process.exit(stopped !== null ? 3 : verdict === 'pass' ? 0 : verdict === 'fail' ? 1 : 2)
}
