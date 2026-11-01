import type { SubjectStatus } from '../types'
import { NL, OPEN_STATUSES, STATUSES } from './status-limits'
import type { OpenStatus } from './status-limits'

/** One line of the Status call's answer. */
export type Op =
  | { kind: 'none' }
  | { kind: 'new'; status: OpenStatus; name: string; text: string }
  | { kind: 'set'; ref: string; status: OpenStatus; text: string }
  | { kind: 'done'; ref: string; text: string }
  | { kind: 'drop'; ref: string; why: string; into: string | null }
  | { kind: 'was'; ref: string; text: string }
  | { kind: 'head'; title: string; description: string }
  /** `ref` is a running child's id or an open ask's id. `subject` may name a milestone. */
  | { kind: 'link'; ref: string; subject: string }
  /** A goal proposed from the person's own words, with the milestones it needs. Never a change to the goal. */
  | { kind: 'goal'; text: string; milestones: { status: SubjectStatus; name: string }[] }
  | { kind: 'milestone'; status: SubjectStatus; name: string; text: string }
  /** `milestone` is null for work the goal does not need. */
  | { kind: 'serves'; subject: string; milestone: string | null }

/** What the Status call answered: nothing to change, or the changes to make. */
export type StatusAnswer = { kind: 'unchanged' } | { kind: 'ops'; ops: Op[] }

const LINE =
  /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK|GOAL|MILESTONE|SERVES)\s*(?::\s*(.*))?$/i

function fields(value: string): string[] {
  return value.split('|').map(f => f.trim())
}

function openStatus(s: string | undefined): OpenStatus | null {
  return OPEN_STATUSES.find(o => o === s?.toLowerCase()) ?? null
}

function anyStatus(s: string | undefined): SubjectStatus | null {
  return STATUSES.find(o => o === s?.toLowerCase()) ?? null
}

/** A proposal's milestones, as `status name; status name`. A milestone with no known status is left out. */
function proposedMilestones(value: string | undefined): { status: SubjectStatus; name: string }[] {
  return (value ?? '').split(';').flatMap(part => {
    const m = /^\s*(\S+)\s+(.+?)\s*$/.exec(part)
    const status = anyStatus(m?.[1])
    return status && m?.[2] ? [{ status, name: m[2] }] : []
  })
}

function opOf(key: string, f: string[]): Op | null {
  if (key === 'NOCHANGE' || key === 'UNCHANGED') return { kind: 'none' }
  if (key === 'NEW') {
    const status = openStatus(f[0])

    return status && f[1] ? { kind: 'new', status, name: f[1], text: f[2] ?? '' } : null
  }
  if (key === 'SET') {
    const isDone = f[1]?.toLowerCase() === 'done'
    if (f[0] && isDone) return { kind: 'done', ref: f[0], text: f[2] ?? '' }
    const status = openStatus(f[1])

    return f[0] && status ? { kind: 'set', ref: f[0], status, text: f[2] ?? '' } : null
  }
  if (key === 'DONE') return f[0] ? { kind: 'done', ref: f[0], text: f[1] ?? '' } : null
  if (key === 'DROP') {
    const into = (f[2] ?? '').replace(/^INTO\s+/i, '').trim()

    return f[0] ? { kind: 'drop', ref: f[0], why: f[1] ?? '', into: into || null } : null
  }
  if (key === 'WAS') return f[0] && f[1] ? { kind: 'was', ref: f[0], text: f[1] } : null
  if (key === 'HEAD') return f[0] ? { kind: 'head', title: f[0], description: f[1] ?? '' } : null
  if (key === 'LINK') return f[0] && f[1] ? { kind: 'link', ref: f[0], subject: f[1] } : null
  if (key === 'GOAL') return f[0] ? { kind: 'goal', text: f[0], milestones: proposedMilestones(f[1]) } : null
  if (key === 'MILESTONE') {
    const status = anyStatus(f[0])

    return status && f[1] ? { kind: 'milestone', status, name: f[1], text: f[2] ?? '' } : null
  }
  if (key === 'SERVES') {
    const isNone = f[1] === '-' || f[1]?.toLowerCase() === 'none'

    return f[0] && f[1] ? { kind: 'serves', subject: f[0], milestone: isNone ? null : f[1] } : null
  }

  return null
}

/**
 * Parses the Status call's answer. Null when it is empty, or when any line is not an operation: an answer that
 * holds prose has more than once corrected itself partway, and applying any of it could apply the wrong half.
 */
export function parseStatus(text: string | null): StatusAnswer | null {
  const ops: Op[] = []
  for (const raw of (text ?? '').split(NL)) {
    const line = raw.trim()
    if (line === '') continue
    const m = LINE.exec(line)
    const op = m ? opOf(m[1]!.toUpperCase().replace(' ', ''), fields(m[2] ?? '')) : null
    if (op === null) return null
    ops.push(op)
  }
  if (ops.length === 0) return null

  return ops.every(o => o.kind === 'none') ? { kind: 'unchanged' } : { kind: 'ops', ops }
}

/**
 * Asks the Status call through `ask`, and once more when the answer holds prose, as `parseStatus` refuses it. A
 * call that gives no text is not asked again. Returns the first answer and the one to apply, which are the same when
 * the call was asked once.
 */
export async function askStatus<T extends { text: string | null }>(
  ask: () => Promise<T>,
): Promise<{ first: T; last: T }> {
  const first = await ask()
  const holdsProse = first.text !== null && parseStatus(first.text) === null

  return { first, last: holdsProse ? await ask() : first }
}
