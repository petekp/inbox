// Check tracking: each check's latest result, how a result changes (recorded,
// stale, left failing, dismissed, fix sent), and what the band, the pane and
// the Stop hook read from the results. Pure functions; the I/O stays in register.tsx.

import type { Check, CheckKind, Checks } from '../types'
import { checkName, claimsIn, isTemporary } from './checks'
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
}

/** The one identity rule: a check is known by its name and the folder it ran in. */
export function checkKey(check: Check): string {
  return `${check.folder ?? '.'}:${check.name}`
}

/**
 * Keeps each check's latest result in each folder. A check script that
 * passes, such as check.sh, replaces every earlier result in its folder.
 */
export function recordCheck(results: Check[], check: Check): Check[] {
  const isReplaced = (c: Check) =>
    c.folder === check.folder && (c.name === check.name || (check.kind === 'all' && check.result === 'pass'))

  return [...results.filter(c => !isReplaced(c)), check]
}

/** Marks the checks that ran in `repo` stale after its files changed. A Markdown-only change leaves tests, types and builds current. */
export function markStale(results: Check[], repo: string, isCodeChange: boolean): Check[] {
  return results.map(c =>
    c.repo === repo && (isCodeChange || ['lint', 'validate', 'all'].includes(c.kind)) ? { ...c, isStale: true } : c,
  )
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
            fixSentAt: null,
          }),
        checks.results,
      ),
  }
}

/**
 * The files in `repo` changed at `paths`; null means git could not tell,
 * which counts as a change to code. No paths change nothing.
 */
export function changed(checks: Checks, repo: string, paths: string[] | null): Checks {
  if (paths !== null && paths.length === 0) return checks
  const isCodeChange = paths === null || paths.some(p => !/\.md$/i.test(p))

  return { ...checks, results: markStale(checks.results, repo, isCodeChange) }
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

/** Results saved before a field existed get its default. A result from before each one kept its repo never goes stale. */
export function upgradeChecks(saved: Checks): Checks {
  return {
    repos: saved.repos ?? [],
    results: saved.results.map(r => ({
      ...r,
      repo: r.repo ?? null,
      isStale: r.isStale ?? false,
      command: r.command ?? '',
      failures: r.failures ?? [],
      isLeftFailing: r.isLeftFailing ?? false,
      isDismissed: r.isDismissed ?? false,
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

/**
 * The first success the reply claims that the latest check of that kind, or
 * of a script that runs them all, contradicts: it failed, or the files
 * changed after it ran. A claim with no check of its kind is left alone,
 * since the check may have run in a way the mod cannot see.
 */
export function contradictedClaim(reply: string, checks: Checks): Contradiction | null {
  for (const { sentence, kind } of claimsIn(reply)) {
    const latest = checks.results.filter(c => c.kind === kind || c.kind === 'all').sort((a, b) => b.ranAt - a.ranAt)[0]
    if (!latest) continue
    if (latest.result === 'fail')
      return {
        claim: sentence,
        problem: `${checkName(latest)} failed when it last ran${latest.summary ? ` (${latest.summary})` : ''}`,
      }
    if (latest.isStale) return { claim: sentence, problem: `the files changed after ${checkName(latest)} last ran` }
  }

  return null
}

/** The Stop hook's check: the first contradicted claim among the session's results. */
export function claimAgainst(checks: Checks, reply: string, root: string): Contradiction | null {
  return contradictedClaim(reply, { ...checks, results: checks.results.filter(c => counts(checks, c, root)) })
}
