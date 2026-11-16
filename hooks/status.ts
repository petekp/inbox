import { NL } from './status-limits'

/** One line of the Status call's answer. */
export type Op =
  | { kind: 'none' }
  | { kind: 'head'; title: string; description: string }
  | { kind: 'link'; ref: string; taskId: string }
  | { kind: 'goal'; text: string }
  /** Clears an inferred goal the session's work has left, when no next goal is clear. */
  | { kind: 'retire'; why: string }

/** What the Status call answered: nothing to change, or the changes to make. */
export type StatusAnswer = { kind: 'unchanged' } | { kind: 'ops'; ops: Op[] }

const LINE =
  /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK|GOAL|RETIRE|MILESTONE|SERVES)\s*(?::\s*(.*))?$/i
const IGNORED = new Set(['NEW', 'SET', 'DONE', 'DROP', 'WAS', 'MILESTONE', 'SERVES'])

function fields(value: string): string[] {
  return value.split('|').map(f => f.trim())
}

function opOf(key: string, f: string[]): Op | null {
  if (key === 'NOCHANGE' || key === 'UNCHANGED') return { kind: 'none' }
  if (key === 'HEAD') return f[0] ? { kind: 'head', title: f[0], description: f[1] ?? '' } : null
  if (key === 'LINK') return f[0] && f[1] ? { kind: 'link', ref: f[0], taskId: f[1] } : null
  if (key === 'GOAL') return f[0] ? { kind: 'goal', text: f[0] } : null
  if (key === 'RETIRE') return { kind: 'retire', why: f[0] ?? '' }

  return null
}

/** Parses Status updates; legacy subject and milestone lines are ignored as unchanged input. */
export function parseStatus(text: string | null): StatusAnswer | null {
  let ignoredLegacy = false
  const ops = (text ?? '').split(NL).flatMap(raw => {
    const m = LINE.exec(raw.trim())
    if (!m) return []
    const key = m[1]!.toUpperCase().replace(' ', '')
    if (IGNORED.has(key)) {
      ignoredLegacy = true
      return []
    }
    const op = opOf(key, fields(m[2] ?? ''))

    return op === null ? [] : [op]
  })
  if (ops.length === 0) return ignoredLegacy ? { kind: 'unchanged' } : null

  return ops.every(o => o.kind === 'none') ? { kind: 'unchanged' } : { kind: 'ops', ops }
}

/** Asks again only when a reply contains no recognized Status line, not when it contains ignored legacy lines. */
export async function askStatus<T extends { text: string | null }>(
  ask: () => Promise<T>,
): Promise<{ first: T; last: T }> {
  const first = await ask()
  const isUnreadable = first.text !== null && parseStatus(first.text) === null

  return { first, last: isUnreadable ? await ask() : first }
}
