import type { Ask, CallReport } from './session-host'
import type { CallAnswer, CallFailure, CallKind, Session } from '../types'

/** How much of a host's reason a failure keeps. */
const ERROR_CHARS = 500
/** How much of an answer `lastAnswers` keeps. Every save writes the whole session, so a runaway answer must not grow each write. */
export const ANSWER_CHARS = 4000

/**
 * What the host gave for one model call: its answer or null, its report, the error it threw, and how long it ran.
 * A host that asked through no `Ask`, as for a fork, builds it from what its own call gave.
 */
export type HeardCall = { text: string | null; report: CallReport | null; thrown: string | null; ms: number }

/** Sends one model call through `ask`, and notes what the host reports of it. The caller times the call. */
export async function askedCall(
  ask: Ask,
  prompt: string,
  system: string,
  kind: CallKind,
): Promise<Omit<HeardCall, 'ms'>> {
  let report: CallReport | null = null
  let thrown: string | null = null
  const text = await ask(prompt, system, kind, r => (report = r)).catch((err: unknown) => {
    thrown = err instanceof Error ? err.message : String(err)
    return null
  })

  return { text, report, thrown }
}

/** Sends one model call through `ask`, notes what the host reports of it, and times it with `now`. */
export async function heardCall(
  ask: Ask,
  prompt: string,
  system: string,
  kind: CallKind,
  now: () => number | Promise<number>,
): Promise<HeardCall> {
  const startedAt = await now()
  const asked = await askedCall(ask, prompt, system, kind)

  return { ...asked, ms: (await now()) - startedAt }
}

/** Why a call gave no usable answer, or null when it gave one. */
function failureOf(kind: CallKind, heard: HeardCall, isParsed: boolean, at: number): CallFailure | null {
  if (heard.text !== null && isParsed) return null
  const { report, thrown, text } = heard
  const reason = thrown ?? report?.error ?? null
  const cause: CallFailure['cause'] =
    text !== null ? 'unparseable' : thrown !== null ? 'error' : (report?.cause ?? (reason ? 'error' : 'no-reply'))

  return {
    at,
    call: kind.call,
    reads: kind.reads,
    isRetry: 'isRetry' in kind ? kind.isRetry : null,
    cause,
    model: report?.model ?? null,
    error: text === null && reason ? reason.slice(0, ERROR_CHARS) : null,
    answerChars: text === null ? null : text.length,
    ms: heard.ms,
    process: text === null ? (report?.process ?? null) : null,
  }
}

/** The answer `heard` gave, for `lastAnswers`, or null when it gave no text. */
function answerOf(kind: CallKind, heard: HeardCall, isParsed: boolean, at: number, turn: number): CallAnswer | null {
  if (heard.text === null) return null
  const { text } = heard

  return { at, turn, reads: kind.reads, isParsed, text: text.slice(0, ANSWER_CHARS), chars: text.length }
}

/**
 * The session with one model call noted: an answer with text becomes its call's entry in `lastAnswers`, and its
 * call's record in `callFailures` changes as follows. A call with no usable answer becomes the record's
 * `lastFailure` and clears its `recoveredAt`. A usable answer sets `recoveredAt` when a failure is saved and no call
 * has answered since, and otherwise leaves the record as it was. `turn` is the turn the call answered.
 */
export function withCall<S extends Session>(
  s: S,
  kind: CallKind,
  heard: HeardCall,
  isParsed: boolean,
  at: number,
  turn: number,
): S {
  const answer = answerOf(kind, heard, isParsed, at, turn)
  const answered = answer ? { ...s, lastAnswers: { ...s.lastAnswers, [kind.call]: answer } } : s
  const record = s.callFailures[kind.call]
  const failure = failureOf(kind, heard, isParsed, at)
  const isRecovery = !failure && record.lastFailure !== null && record.recoveredAt === null
  if (!failure && !isRecovery) return answered
  const next = failure ? { lastFailure: failure, recoveredAt: null } : { ...record, recoveredAt: at }

  return { ...answered, callFailures: { ...s.callFailures, [kind.call]: next } }
}
