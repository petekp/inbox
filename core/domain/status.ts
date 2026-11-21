import type { SubjectStatus } from '../../types'
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
  /** A goal the call sets from the session's work, with the milestones it needs. Code applies it only when it may. */
  | { kind: 'goal'; text: string; milestones: GoalMilestone[] }
  /** Clears an inferred goal the session's work has left, when no next goal is clear. */
  | { kind: 'retire'; why: string }
  | { kind: 'milestone'; status: SubjectStatus; name: string; text: string }
  /** `milestone` is null for work the goal does not need. */
  | { kind: 'serves'; subject: string; milestone: string | null }
  /** Names the queued milestone the work takes up after the one under way. */
  | { kind: 'next'; ref: string }
  /** The goal offered to the person while none runs, or null for none. */
  | { kind: 'suggest'; text: string | null }

/** A milestone as a GOAL line writes it: its status, its name, and where it stands, which is empty when the line gives none. */
type GoalMilestone = { status: SubjectStatus; name: string; text: string }

/** What the Status call answered: nothing to change, or the changes to make. */
export type StatusAnswer = { kind: 'unchanged' } | { kind: 'ops'; ops: Op[] }

const LINE =
  /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|HEAD|LINK|GOAL|RETIRE|MILESTONE|SERVES|NEXT|SUGGEST)\s*(?::\s*(.*))?$/i

function fields(value: string): string[] {
  return value.split('|').map(f => f.trim())
}

/** A status word as the model writes it, with spaces and underscores read as hyphens and the close forms of waits-on-other read as it. */
function statusWord(s: string | undefined): string | undefined {
  const word = s?.toLowerCase().replace(/[\s_]+/g, '-')

  return word !== undefined && /^(waits?|waiting)-on-others?$/.test(word) ? 'waits-on-other' : word
}

function openStatus(s: string | undefined): OpenStatus | null {
  return OPEN_STATUSES.find(o => o === statusWord(s)) ?? null
}

function anyStatus(s: string | undefined): SubjectStatus | null {
  return STATUSES.find(o => o === statusWord(s)) ?? null
}

/**
 * A GOAL line's milestones, as `status name: where it stands; status name`, where it stands being optional. A milestone
 * with no known status is left out.
 */
function goalMilestones(value: string | undefined): GoalMilestone[] {
  return (value ?? '').split(';').flatMap(part => {
    const m = /^\s*(\S+)\s+(.+?)(?::\s*(.*?))?\s*$/.exec(part)
    const status = anyStatus(m?.[1])
    return status && m?.[2] ? [{ status, name: m[2], text: m[3] ?? '' }] : []
  })
}

function opOf(key: string, f: string[]): Op | null {
  if (key === 'NOCHANGE' || key === 'UNCHANGED') return { kind: 'none' }
  if (key === 'NEW') {
    const status = openStatus(f[0])

    return status && f[1] ? { kind: 'new', status, name: f[1], text: f[2] ?? '' } : null
  }
  if (key === 'SET') {
    const isDone = statusWord(f[1]) === 'done'
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
  if (key === 'GOAL') return f[0] ? { kind: 'goal', text: f[0], milestones: goalMilestones(f[1]) } : null
  if (key === 'RETIRE') return { kind: 'retire', why: f[0] ?? '' }
  if (key === 'MILESTONE') {
    const status = anyStatus(f[0])

    return status && f[1] ? { kind: 'milestone', status, name: f[1], text: f[2] ?? '' } : null
  }
  if (key === 'SERVES') {
    const isNone = f[1] === '-' || f[1]?.toLowerCase() === 'none'

    return f[0] && f[1] ? { kind: 'serves', subject: f[0], milestone: isNone ? null : f[1] } : null
  }
  if (key === 'NEXT') return f[0] ? { kind: 'next', ref: f[0] } : null
  if (key === 'SUGGEST') {
    const isNone = f[0] === '-' || f[0]?.toLowerCase() === 'none'

    return f[0] ? { kind: 'suggest', text: isNone ? null : f[0] } : null
  }

  return null
}

/** The ref of a line that sets where a subject stands, so a later such line for the same subject replaces it. */
function standingRef(op: Op): string | null {
  return op.kind === 'set' || op.kind === 'done' || op.kind === 'drop' ? op.ref.toLowerCase() : null
}

/**
 * What the answer says after it takes lines back. A NO CHANGE line cancels every line before it, and of several lines
 * that set one subject's standing, only the last counts. A NEW and a DONE for the same name both stay, since writing
 * both is how work that started and finished in one exchange is reported.
 */
function afterRetractions(ops: Op[]): Op[] {
  const lastNone = ops.findLastIndex(o => o.kind === 'none')
  const kept = ops.slice(lastNone + 1)
  const lastStanding = new Map(kept.flatMap((o, n) => (standingRef(o) === null ? [] : [[standingRef(o)!, n] as const])))

  return kept.filter((o, n) => standingRef(o) === null || lastStanding.get(standingRef(o)!) === n)
}

/**
 * Parses the Status call's answer. A line that is not an operation is left out, so a stray line of prose does not
 * throw away the lines around it. Lines the answer takes back are left out too. Null when no line is an operation.
 */
export function parseStatus(text: string | null): StatusAnswer | null {
  const all = (text ?? '').split(NL).flatMap(raw => {
    const m = LINE.exec(raw.trim())
    const op = m ? opOf(m[1]!.toUpperCase().replace(' ', ''), fields(m[2] ?? '')) : null
    return op === null ? [] : [op]
  })
  if (all.length === 0) return null
  const ops = afterRetractions(all)

  return ops.length === 0 ? { kind: 'unchanged' } : { kind: 'ops', ops }
}

/** The prompt that asks the Status call once more about what its answer left out, and which lines of the second answer to add. */
export type StatusRetry = { prompt: string; keeps: (op: Op) => boolean }

/**
 * The answer to apply after a retry: every line of `first`, and the lines of `retry` that `keeps` takes, so a retry
 * that answers only what it was asked keeps the lines the first answer wrote.
 */
export function withRetryLines(
  first: StatusAnswer,
  retry: StatusAnswer | null,
  keeps: (op: Op) => boolean,
): StatusAnswer {
  const added = retry?.kind === 'ops' ? retry.ops.filter(keeps) : []
  if (added.length === 0) return first

  return { kind: 'ops', ops: [...(first.kind === 'ops' ? first.ops : []), ...added] }
}

/**
 * Asks the Status call through `ask`, and once more when the answer holds no operation, as `parseStatus` refuses it.
 * When `retryFor` gives a retry for an answer that parses, the call is asked once more with its prompt, and the lines
 * of the second answer it keeps are added to the first. A call that gives no text is not asked again. Returns the
 * answer to apply, null when none parsed, and the last call's result.
 */
export async function askStatus<T extends { text: string | null }>(
  ask: (prompt: string | null) => Promise<T>,
  retryFor: (answer: StatusAnswer, text: string) => StatusRetry | null = () => null,
): Promise<{ answer: StatusAnswer | null; last: T }> {
  const first = await ask(null)
  if (first.text === null) return { answer: null, last: first }
  const answer = parseStatus(first.text)
  if (answer === null) {
    const again = await ask(null)
    return { answer: parseStatus(again.text), last: again }
  }
  const retry = retryFor(answer, first.text)
  if (retry === null) return { answer, last: first }
  const again = await ask(retry.prompt)

  return { answer: withRetryLines(answer, parseStatus(again.text), retry.keeps), last: again }
}
