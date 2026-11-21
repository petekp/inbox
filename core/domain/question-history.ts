import type { Closed, Earlier, Session } from '../../types'
import type { AnswerDoc } from './earlier-answers'
import { OVERTAKEN_OUTCOMES } from './ledger-close'

/**
 * The question history: one file per session in a folder every host shares, written only by that session's host. It
 * holds the answers the person gave, which `core/domain/earlier-answers.ts` searches when a question is added, and for each
 * one the earlier answer its row matched, which the report in `scripts/earlier-answers-report.mjs` reads.
 */
const HISTORY_VERSION = 1

/** A question the person answered. `isAfterReply` marks an update close that followed a reply they typed. */
type HistoryQuestion = {
  id: string
  ask: string
  options: string[]
  askedAt: number | null
  answer: string
  answeredAt: number
  how: 'answered' | 'update'
  isAfterReply: boolean
  earlier: Earlier | null
  isAnsweredWithEarlier: boolean
}

/** `created` is when the host first wrote the file, so the oldest file's tells when the history began. */
export type HistoryFile = {
  version: typeof HISTORY_VERSION
  host: string
  session: string
  repo: string | null
  created: number
  savedAt: number
  questions: HistoryQuestion[]
}

export type HistoryHost = 'claude-code' | 'codex' | 'omp'

const DAY_MS = 24 * 60 * 60_000
/** How long an answer stays in the history. */
const HISTORY_KEEP_MS = 180 * DAY_MS
/** How long after the history began the rows draw no earlier answer: the week that gives the baseline. */
export const BASELINE_MS = 7 * DAY_MS
/**
 * How long after the history began the `record` answer lists no earlier answers: the baseline week and the two weeks
 * that `scripts/earlier-answers-report.mjs` measures the row's line over. An agent that closes a repeat before it
 * reaches a row would change those weeks.
 */
export const ROW_MEASUREMENT_MS = 21 * DAY_MS

/** An update close that is not an answer: the forms the ledger prompt gives a close of work done or overtaken. */
const NOT_AN_ANSWER = new RegExp(`^(?:done:|fix sent for |(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES}))`, 'i')

export function historyFileName(host: HistoryHost, session: string): string {
  return `${host}-${session.replace(/[^\w.-]/g, '_')}.json`
}

/** Whether a close is an answer the person gave, as the history keeps it. */
function isAnswer(c: Closed): c is Closed & { how: 'answered' | 'update' } {
  if (c.kind !== 'question') return false
  if (c.how === 'answered') return true

  return c.how === 'update' && !NOT_AN_ANSWER.test(c.outcome.trim())
}

const keyOf = (q: { id: string; askedAt: number | null }) => `${q.id}@${q.askedAt ?? ''}`

const sameAnswer = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * `previous` with the session's answered questions merged in. An answer whose question is open again leaves, and so
 * does one older than `HISTORY_KEEP_MS`.
 */
export function questionHistory(
  previous: HistoryFile | null,
  s: Session,
  place: { host: HistoryHost; session: string; repo: string | null },
  now: number,
): HistoryFile {
  const answered = s.ledger.closed.filter(isAnswer).map((c): HistoryQuestion => ({
    id: c.id,
    ask: c.ask,
    options: c.item?.options ?? [],
    askedAt: c.item?.at ?? null,
    answer: c.outcome,
    answeredAt: c.at,
    how: c.how,
    isAfterReply: c.how === 'update' && s.lastActions[c.id]?.action === 'type',
    earlier: c.item?.earlier ?? null,
    isAnsweredWithEarlier: c.item?.earlier ? sameAnswer(c.outcome, c.item.earlier.answer) : false,
  }))
  const open = new Set(s.ledger.items.map(i => keyOf({ id: i.id, askedAt: i.at })))
  const byKey = new Map((previous?.questions ?? []).map(q => [keyOf(q), q]))
  for (const q of answered) byKey.set(keyOf(q), q)
  const questions = [...byKey.values()]
    .filter(q => !open.has(keyOf(q)) && now - q.answeredAt <= HISTORY_KEEP_MS)
    .sort((a, b) => a.answeredAt - b.answeredAt)

  return {
    version: HISTORY_VERSION,
    host: place.host,
    session: place.session,
    repo: place.repo ?? previous?.repo ?? null,
    created: previous?.created ?? now,
    savedAt: now,
    questions,
  }
}

/** Whether the session's answers differ from what its history file holds, so the file needs writing. */
export function isHistoryChanged(previous: HistoryFile | null, next: HistoryFile): boolean {
  if (!previous) return next.questions.length > 0
  const said = (f: HistoryFile) => JSON.stringify([f.repo, f.questions])

  return said(previous) !== said(next)
}

/** A history file as this build reads it, or null when it is not one. */
export function upgradeHistoryFile(raw: unknown): HistoryFile | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Partial<HistoryFile>
  if (f.version !== HISTORY_VERSION || !Array.isArray(f.questions) || typeof f.session !== 'string') return null

  return f as HistoryFile
}

/**
 * Every answer the files hold from the last `HISTORY_KEEP_MS`, as the search ranks them. A file keeps an older answer
 * until its session writes it again, and no host deletes a file.
 */
export function historyDocs(files: readonly HistoryFile[], now: number): AnswerDoc[] {
  return files.flatMap(f =>
    f.questions
      .filter(q => now - q.answeredAt <= HISTORY_KEEP_MS)
      .map(q => ({
        key: answerKey(f.host, f.session, q.id),
        ask: q.ask,
        answer: q.answer,
        at: q.answeredAt,
        repo: f.repo,
      })),
  )
}

export function answerKey(host: string, session: string, id: string): string {
  return `${host}:${session}:${id}`
}

/** When the history began: the oldest file's `created`, or `now` when there is none. */
export function historyStart(files: readonly HistoryFile[], now: number): number {
  return files.reduce((start, f) => Math.min(start, f.created), now)
}

/** Whether a match found now is drawn: once the baseline week since the history began has passed. */
export function isEarlierShown(start: number, now: number): boolean {
  return now - start >= BASELINE_MS
}

/** The inbox's state folder: `$XDG_STATE_HOME/inbox`, else `~/.local/state/inbox`. Null with neither. */
export function inboxStateFolder(env: Readonly<Record<string, string | undefined>>): string | null {
  const state = env.XDG_STATE_HOME?.trim() || (env.HOME?.trim() ? `${env.HOME.trim()}/.local/state` : '')

  return state ? `${state.replace(/\/+$/, '')}/inbox` : null
}

/** The history folder: `$XDG_STATE_HOME/inbox/questions`, else `~/.local/state/inbox/questions`. Null with neither. */
export function historyFolder(env: Readonly<Record<string, string | undefined>>): string | null {
  const inbox = inboxStateFolder(env)

  return inbox ? `${inbox}/questions` : null
}
