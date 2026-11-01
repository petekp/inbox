/**
 * The Status suite's pass bar. A release run may block falsely with a chance of at most 0.05, split across four
 * families of tests. Within a family each test gets an equal share. Every test is an exact binomial: it blocks when
 * the failures it saw would be that unlikely at its tolerance.
 */

/** Each family's share of the 0.05 chance that a release run blocks with every rate at its tolerance. */
export const FAMILY_ALPHA = { replay: 0.033, short: 0.007, spread: 0.007, judge: 0.003 } as const

export type Family = keyof typeof FAMILY_ALPHA

/** The failure rate each kind of test allows. */
export const TOLERANCE = { modelRule: 0.1, missedProposal: 0.2, judgeCheck: 0.15 } as const

function choose(n: number, k: number): number {
  let c = 1
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i

  return c
}

/** The chance of at least `k` failures in `n` tries at rate `p`. */
export function atLeast(k: number, n: number, p: number): number {
  let sum = 0
  for (let i = Math.max(0, k); i <= n; i++) sum += choose(n, i) * p ** i * (1 - p) ** (n - i)

  return sum
}

/** The fewest failures in `n` tries that block at tolerance `p0` and chance `alpha`. `n + 1` when none can. */
export function blockAt(n: number, p0: number, alpha: number): number {
  for (let k = 0; k <= n; k++) if (atLeast(k, n, p0) <= alpha) return k

  return n + 1
}

/** The chance each of a family's `tests` tests may block falsely. */
export const alphaPerTest = (family: Family, tests: number) => FAMILY_ALPHA[family] / Math.max(1, tests)

/** The two-sided 95% Clopper-Pearson interval for `k` failures in `n` tries. */
export function interval(k: number, n: number): [number, number] {
  const solve = (isAbove: (p: number) => boolean) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (isAbove(mid)) hi = mid
      else lo = mid
    }
    return (lo + hi) / 2
  }
  if (n === 0) return [0, 1]
  const low = k === 0 ? 0 : solve(p => atLeast(k, n, p) >= 0.025)
  const high = k === n ? 1 : solve(p => 1 - atLeast(k + 1, n, p) <= 0.025)

  return [low, high]
}
