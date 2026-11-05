import type { PrCheck, PrView } from '../types'

export function failingChecks(pr: PrView): PrCheck[] {
  return pr.checks.filter(c => c.bucket === 'fail')
}

export function cancelledChecks(pr: PrView): PrCheck[] {
  return pr.checks.filter(c => c.bucket === 'cancelled')
}

const ACTIONS_RUN_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)/

/** The GitHub Actions run a check's details link names, or null for a check another app ran. */
export function runOf(c: PrCheck): { repo: string; run: string } | null {
  const m = ACTIONS_RUN_URL.exec(c.url ?? '')

  return m ? { repo: m[1]!, run: m[2]! } : null
}

export function isSameRun(a: { repo: string; run: string }, b: { repo: string; run: string } | null): boolean {
  return b !== null && a.repo === b.repo && a.run === b.run
}

/**
 * The failing check that cancelled `c`, or null. A failing job cancels the other jobs of its run, and Fix on it runs
 * them again, so nothing on the cancelled one waits on the person.
 */
export function failedSibling(pr: PrView, c: PrCheck): PrCheck | null {
  const run = c.bucket === 'cancelled' ? runOf(c) : null

  return run ? (pr.checks.find(f => f.bucket === 'fail' && isSameRun(run, runOf(f))) ?? null) : null
}

/**
 * The checks that wait on the person, in the order the PR block lists them: failing, then cancelled. A check a failing
 * sibling cancelled waits on that sibling's Fix instead.
 */
export function blockingChecks(pr: PrView): PrCheck[] {
  return [...failingChecks(pr), ...cancelledChecks(pr).filter(c => !failedSibling(pr, c))]
}
