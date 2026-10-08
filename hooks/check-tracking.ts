// Check tracking: each check's latest result, how a result changes (recorded,
// stale, left failing, dismissed, fix sent), and what the band, the pane and
// the Stop hook read from the results. Pure functions; the I/O stays in register.tsx.

import type { Check, CheckKind, Checks } from '../types'
import { checkName, claimsIn, isTemporary } from './checks'
import type { Contradiction } from './checks'

export const NO_CHECKS: Checks = { results: [] }

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

/** What the Needs you tab lists: results left failing and not dismissed, and how many of them wait on the person (no fix sent). */
export function needsYou(checks: Checks): { rows: Check[]; count: number } {
  const rows = checks.results.filter(c => c.isLeftFailing && !c.isDismissed)

  return { rows, count: rows.filter(c => c.fixSentAt === null).length }
}

/** What the band shows: the failing results, one line each, and every result for the dim summary line. */
export function bandLines(checks: Checks): { failing: Check[]; summary: Check[] } {
  return { failing: checks.results.filter(c => c.result === 'fail'), summary: checks.results }
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
