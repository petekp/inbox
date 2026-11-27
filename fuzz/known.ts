import type { Case } from './case'
import { CODEX_SEEDS } from './seeds-codex'
import { MOD_SEEDS, SEEDS } from './seeds'

/**
 * Failures of generated cases that an open issue already describes, by look, rule and what the failure's detail holds:
 * one of `details`, where a list stands for a detail that holds every text in it, as a cut's text and its box. A run
 * that finds only these passes, so a fixed-seed run fails only on something new.
 */
const KNOWN: { issue: number; look: Case['look'] | 'codex' | 'mod'; rule: string; details: (string | string[])[] }[] = [
  { issue: 811, look: 'herdr', rule: 'cut', details: ['"✓ Copied'] },
  {
    issue: 827,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Send"', 'in its box panel '],
      ['"Cancel"', 'in its box panel '],
      ['"Discard"', 'in its box panel '],
      ['"Sending…"', 'in its box status '],
    ],
  },
  {
    issue: 927,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Reply"', 'in its box panel '],
      ['"Explain"', 'in its box panel '],
    ],
  },
  { issue: 950, look: 'herdr', rule: 'cut', details: [['"Not applied', 'in its box status above ']] },
  {
    issue: 997,
    look: 'herdr',
    rule: 'vanish',
    details: [
      ['the status "', 'came at 0.10'],
      ['the status "', 'nothing came in its place'],
      ['the line "', ' thread ', 'came at 0.10'],
    ],
  },
  { issue: 998, look: 'herdr', rule: 'vanish', details: [['the age "', 'nothing came in its place']] },
  { issue: 999, look: 'herdr', rule: 'vanish', details: [['the line "', '" in pr:', 'nothing came in its place']] },
  {
    issue: 1000,
    look: 'herdr',
    rule: 'vanish',
    details: [
      ['the mark "◆" in s', 'nothing came in its place'],
      ['the mark "◆" in m', 'nothing came in its place'],
      ['the button "View question" in ', 'nothing came in its place'],
      ['what it waits on "', 'nothing came in its place'],
    ],
  },
  { issue: 833, look: 'herdr', rule: 'connector-gap', details: ['in space '] },
]

/** The open issue a failure is already filed as, or null when it is new. */
export function knownIssueOf(f: { look: string; rule: string; detail: string }): number | null {
  const open = new Set([...SEEDS, ...CODEX_SEEDS, ...MOD_SEEDS].filter(s => s.isOpen).map(s => s.issue))
  const k = KNOWN.find(
    k =>
      open.has(k.issue) &&
      k.look === f.look &&
      k.rule === f.rule &&
      k.details.some(d => (typeof d === 'string' ? [d] : d).every(part => f.detail.includes(part))),
  )
  return k?.issue ?? null
}

/**
 * A seed's failures, less those that an open issue other than the seed's own already describes, as when a seed's moves
 * also show a cut another issue tracks, and those issues.
 */
export function ownFailures<F extends { rule: string; detail: string }>(
  look: string,
  issue: number,
  failures: F[],
): { own: F[]; others: number[] } {
  const others = new Set<number>()
  const own = failures.filter(f => {
    const known = knownIssueOf({ look, rule: f.rule, detail: f.detail })
    if (known === null || known === issue) return true
    others.add(known)
    return false
  })

  return { own, others: [...others] }
}

/** How a seed's verdict names the open issues its other failures belong to. */
export const apartFrom = (others: number[]): string =>
  others.length === 0 ? '' : `, apart from ${others.map(n => `#${n}`).join(', ')}`
