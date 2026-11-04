import type { Ask, CallReport } from './session-host'
import type { CallFailure, CallKind, Session } from '../types'

/** How much of a host's reason a failure keeps. */
const ERROR_CHARS = 500

/**
 * What the host gave for one model call: its answer or null, its report, the error it threw, and how long it ran.
 * A host that asked through no `Ask`, as for a fork, builds it from what its own call gave.
 */
export type HeardCall = { text: string | null; report: CallReport | null; thrown: string | null; ms: number }

/** Sends one model call through `ask`, and notes what the host reports of it. */
export async function heardCall(
  ask: Ask,
  prompt: string,
  system: string,
  kind: CallKind,
  now: () => number | Promise<number>,
): Promise<HeardCall> {
  let report: CallReport | null = null
  let thrown: string | null = null
  const startedAt = await now()
  const text = await ask(prompt, system, kind, r => (report = r)).catch((err: unknown) => {
    thrown = err instanceof Error ? err.message : String(err)
    return null
  })

  return { text, report, thrown, ms: (await now()) - startedAt }
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

/**
 * The session with one model call noted in its call's record. A call with no usable answer becomes the record's
 * `lastFailure` and clears its `recoveredAt`. A usable answer sets `recoveredAt` when a failure is saved and no call
 * has answered since, and otherwise leaves the session as it was.
 */
export function withCall<S extends Session>(s: S, kind: CallKind, heard: HeardCall, isParsed: boolean, at: number): S {
  const record = s.callFailures[kind.call]
  const failure = failureOf(kind, heard, isParsed, at)
  const isRecovery = !failure && record.lastFailure !== null && record.recoveredAt === null
  if (!failure && !isRecovery) return s
  const next = failure ? { lastFailure: failure, recoveredAt: null } : { ...record, recoveredAt: at }

  return { ...s, callFailures: { ...s.callFailures, [kind.call]: next } }
}
