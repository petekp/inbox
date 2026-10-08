// Check tracking: each check's latest result, how a result changes (recorded,
// stale, left failing, dismissed, fix sent), and what the band, the pane and
// the Stop hook read from the results. Pure functions; the I/O stays in register.tsx.

import type { Check, CheckKind, Checks, Target } from '../types'
import { checkName, claimsIn, isTemporary, targetOfCommand } from './checks'
import type { Contradiction } from './checks'

export const NO_CHECKS: Checks = { results: [], repos: [] }

/** One check run that ended, with its folder (absolute) and repo already resolved. */
type Run = {
  name: string
  kind: CheckKind
  folder: string
  result: Check['result']
  summary: string
  command: string
  failures: string[]
  repo: string | null
  target: Target
}

/** The one identity rule: a check is known by its name, the folder it ran in and, when it narrows anything, its target. */
export function checkKey(check: Check): string {
  const { paths, filters } = check.target
  const key = `${check.folder ?? '.'}:${check.name}`

  return paths.length === 0 && filters.length === 0
    ? key
    : `${key}:${JSON.stringify([[...paths].sort(), [...filters].sort()])}`
}

/** Whether the folder `path` is, or contains, `inner`. */
export const contains = (path: string, inner: string) => inner === path || inner.startsWith(`${path}/`)

/**
 * Whether `run` covers `result`: it is the same check in the same folder, its
 * filters are none or the same ones, and its paths are none or contain every
 * path the result has (which must have some).
 */
function covers(run: Check, result: Check): boolean {
  if (run.name !== result.name || run.folder !== result.folder) return false
  const a = run.target
  const b = result.target
  const isSameFilters = a.filters.length === b.filters.length && a.filters.every(f => b.filters.includes(f))
  const hasPaths = b.paths.length > 0 && b.paths.every(q => a.paths.some(p => contains(p, q)))

  return (a.filters.length === 0 || isSameFilters) && (a.paths.length === 0 || hasPaths)
}

/**
 * Keeps each check's latest results. A pass or fail replaces every result it
 * covers; a check script that passes, such as check.sh, replaces every earlier
 * result in its folder.
 */
function recordCheck(results: Check[], check: Check): Check[] {
  const isAll = check.kind === 'all' && check.result === 'pass'

  return [...results.filter(c => !(covers(check, c) || (isAll && c.folder === check.folder))), check]
}

/**
 * Records the runs that ended at `at`. A run in a temporary folder says
 * nothing about the session's work, unless the session itself is in one.
 * The session's own folder, `root`, is saved as null.
 */
export function recorded(checks: Checks, runs: Run[], at: number, root: string): Checks {
  return {
    ...checks,
    results: runs
      .filter(r => !(isTemporary(r.folder) && !isTemporary(root)))
      .reduce(
        (all, r) =>
          recordCheck(all, {
            name: r.name,
            kind: r.kind,
            target: r.target,
            folder: r.folder === root ? null : r.folder,
            result: r.result,
            summary: r.summary,
            ranAt: at,
            command: r.command,
            failures: r.failures,
            repo: r.repo,
            isStale: false,
            isLeftFailing: false,
            isDismissed: false,
            isSentBack: false,
            fixSentAt: null,
          }),
        checks.results,
      ),
  }
}

/** Whether a result of this kind reads the file at `path`: Markdown matters only to a lint, a validation or a check script. */
function readsFile(kind: CheckKind, path: string): boolean {
  return ['lint', 'validate', 'all'].includes(kind) || !/\.md$/i.test(path)
}

/**
 * The files in `repo` changed at `paths`, relative to `repo`; null means git
 * could not tell, which makes every result there stale. Otherwise a result is
 * stale when a file it reads changed in its folder, `root` for the session's own.
 */
export function changed(checks: Checks, repo: string, paths: string[] | null, root: string): Checks {
  if (paths !== null && paths.length === 0) return checks
  const isStaleBy = (c: Check) => {
    if (paths === null) return true
    const folder = c.folder ?? root

    return paths.some(p => {
      const path = `${repo}/${p}`

      return readsFile(c.kind, p) && (path === folder || path.startsWith(`${folder}/`))
    })
  }

  return {
    ...checks,
    results: checks.results.map(c => (c.repo === repo && isStaleBy(c) ? { ...c, isStale: true } : c)),
  }
}

/** The session started in this repo, or Claude edited a file in it. */
export function addRepo(checks: Checks, repo: string): Checks {
  return checks.repos.includes(repo) ? checks : { ...checks, repos: [...checks.repos, repo] }
}

/** Drops the results from folders that are gone. */
export function pruned(checks: Checks, gone: ReadonlySet<string>): Checks {
  return { ...checks, results: checks.results.filter(c => !c.folder || !gone.has(c.folder)) }
}

/** Claude's turn ended: every failing result is now left failing. */
export function turnEnded(checks: Checks): Checks {
  return { ...checks, results: checks.results.map(c => (c.result === 'fail' ? { ...c, isLeftFailing: true } : c)) }
}

/** The person dismissed the check, whichever run it came from. */
export function dismissed(checks: Checks, check: Check): Checks {
  const key = checkKey(check)

  return { ...checks, results: checks.results.map(c => (checkKey(c) === key ? { ...c, isDismissed: true } : c)) }
}

/** The person asked Claude to fix the check's run at `at`. Matched by run, so a rerun recorded meanwhile keeps its own state. */
export function fixSent(checks: Checks, check: Check, at: number): Checks {
  const key = checkKey(check)

  return {
    ...checks,
    results: checks.results.map(c => (checkKey(c) === key && c.ranAt === check.ranAt ? { ...c, fixSentAt: at } : c)),
  }
}

/**
 * Results saved before a field existed get its default. A result from before
 * each one kept its repo never goes stale, and one from before targets takes
 * its target from its saved command. `root` is the session's folder.
 */
export function upgradeChecks(saved: Checks, root: string, home: string): Checks {
  return {
    // State saved before the session's repos were kept counted every result's repo.
    repos: saved.repos ?? [...new Set(saved.results.flatMap(r => (r.repo ? [r.repo] : [])))],
    // Results read as unknown, before run_check, say nothing about the work.
    results: saved.results
      .filter(r => (r.result as string) !== 'unknown')
      .map(r => ({
        ...r,
        repo: r.repo ?? null,
        isStale: r.isStale ?? false,
        command: r.command ?? '',
        target: r.target ?? targetOfCommand(r.command ?? '', r.folder ?? root, home),
        failures: r.failures ?? [],
        isLeftFailing: r.isLeftFailing ?? false,
        isDismissed: r.isDismissed ?? false,
        isSentBack: r.isSentBack ?? false,
        fixSentAt: r.fixSentAt ?? null,
      })),
  }
}

/**
 * Whether a result is the session's: it ran in one of the session's repos, or,
 * outside git, in the session's folder `root` or below it.
 */
function counts(checks: Checks, c: Check, root: string): boolean {
  if (c.repo !== null) return checks.repos.includes(c.repo)

  return c.folder === null || c.folder === root || c.folder.startsWith(`${root}/`)
}

/** What the Needs you tab lists: the session's results left failing and not dismissed, and how many of them wait on the person (no fix sent). */
export function needsYou(checks: Checks, root: string): { rows: Check[]; count: number } {
  const rows = checks.results.filter(c => counts(checks, c, root) && c.isLeftFailing && !c.isDismissed)

  return { rows, count: rows.filter(c => c.fixSentAt === null).length }
}

/** What the band shows from the session's results: the failing ones not dismissed, one line each, and the rest on the dim summary line. No result shows twice. */
export function bandLines(checks: Checks, root: string): { failing: Check[]; summary: Check[] } {
  const own = checks.results.filter(c => counts(checks, c, root))

  return {
    failing: own.filter(c => c.result === 'fail' && !c.isDismissed),
    summary: own.filter(c => c.result !== 'fail'),
  }
}

/** A contradicted claim, with the result it is about. */
type Contradicted = Contradiction & { check: Check }

/**
 * Each result that contradicts a success the reply claims, claim by claim:
 * every failure of that kind, or of a script that runs them all, latest
 * first, then the latest result of that kind if the files changed after it
 * ran. A later pass removes the failures it covers, so a failure still
 * recorded is one no later run cleared. A claim with no check of its kind is
 * left alone, since the check may have run in a way the mod cannot see.
 */
function* contradictions(reply: string, checks: Checks, root: string): Generator<Contradicted> {
  for (const { sentence, kind } of claimsIn(reply)) {
    const ofKind = checks.results.filter(c => c.kind === kind || c.kind === 'all').sort((a, b) => b.ranAt - a.ranAt)
    for (const failed of ofKind.filter(c => c.result === 'fail'))
      yield {
        claim: sentence,
        problem: `${checkName(failed, root)} failed when it last ran${failed.summary ? ` (${failed.summary})` : ''}`,
        check: failed,
      }
    const [latest] = ofKind
    if (latest && latest.result !== 'fail' && latest.isStale)
      yield { claim: sentence, problem: `the files changed after ${checkName(latest, root)} last ran`, check: latest }
  }
}

/**
 * The Stop hook's check: the first claim in the reply that the session's
 * results contradict and that has not yet sent Claude back, with that result
 * marked so it sends Claude back once.
 */
export function claimAgainst(
  checks: Checks,
  reply: string,
  root: string,
): { checks: Checks; claim: Contradiction | null } {
  const own = { ...checks, results: checks.results.filter(c => counts(checks, c, root)) }
  for (const { claim, problem, check } of contradictions(reply, own, root)) {
    if (check.isSentBack) continue
    const key = checkKey(check)

    return {
      checks: {
        ...checks,
        results: checks.results.map(c =>
          checkKey(c) === key && c.ranAt === check.ranAt ? { ...c, isSentBack: true } : c,
        ),
      },
      claim: { claim, problem },
    }
  }

  return { checks, claim: null }
}
