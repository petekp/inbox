import { askStatus, parseStatus } from './status'
import { statusPrompt, statusMidTurnPrompt, statusCatchUpPrompt, hostStatusSystem } from './status-prompt'
import type { StatusCallInput } from './status-prompt'
import { failedStatus, appliedStatus, isStatusCallCurrent } from './session-status'
import type { ClientId } from './clients'
import type { Exchange, Session, SessionStatus, HostTask } from '../types'
import type { Ask, UpdateHost, CallKind } from './session-host'
import { heardCall, withCall } from './call-record'
import type { HeardCall } from './call-record'

/**
 * What a Status call reads as its exchange: a reply's exchange, the running turn's work so far, or a whole
 * conversation for a catch-up.
 */
export type StatusExchange =
  | { kind: 'reply'; exchange: Exchange }
  | { kind: 'mid-turn'; turn: Pick<Session['turn'], 'person' | 'trigger' | 'activity'> }
  | { kind: 'catch-up'; conversation: string }

type StatusCallKind = StatusExchange['kind']

/** The prompt that asks for the changes `read` makes to the Status, asks and task list in `input`. */
export function statusCallPrompt(input: StatusCallInput, read: StatusExchange): string {
  switch (read.kind) {
    case 'reply':
      return statusPrompt(input, read.exchange)
    case 'mid-turn':
      return statusMidTurnPrompt(input, read.turn)
    case 'catch-up':
      return statusCatchUpPrompt(input, read.conversation)
  }
}

/** A Status call: what it reads as its exchange, and the model call that sends its prompt with the host's Status system text. */
export type StatusCall = { exchange: StatusExchange; ask: Ask }

type StatusHost<S extends Session> = Pick<
  UpdateHost<S>,
  'now' | 'read' | 'update' | 'ask' | 'inOrder' | 'records' | 'names'
>

/** One model call of a Status call. An answer that holds prose is asked once more, so a call makes one or two. */
type StatusAttempt = {
  /** The model the host asked for, and the one that answered. Null when the host does not say. */
  model: string | null
  answeredBy: string | null
  /** The raw answer, or null with the error when there was none. */
  answer: string | null
  error: string | null
  ms: number
}

/** A reader refuses a record of another version. */
export const STATUS_RECORD_VERSION = 1

/** A next build's record of one Status call, so that a Status can be traced to the call that wrote it. */
export type StatusRecord = {
  version: typeof STATUS_RECORD_VERSION
  host: ClientId
  session: string
  at: number
  system: string
  prompt: string
  /**
   * What the prompt was built from, so `statusCallPrompt` builds it again. `input.last` is the Status the call
   * read, with its children, and `exchange.kind` says which call it was.
   */
  input: StatusCallInput
  exchange: StatusExchange
  attempts: StatusAttempt[]
  isParsed: boolean
  /** False when the update the call followed was gone by the time it answered, so nothing was written. */
  isWritten: boolean
  /** The saved Status just before the answer was applied, and just after. */
  before: SessionStatus | null
  after: SessionStatus | null
}

/** The file calls a record needs. `list` gives a folder's entry names, and none when it is missing. */
export type RecordFiles = {
  write(path: string, text: string): Promise<void>
  list(folder: string): Promise<string[]>
  removeFiles(paths: string[]): Promise<void>
  /** Removes a folder that is empty. */
  removeFolder(path: string): Promise<void>
}

/** A next build's folder of Status call records, one folder per session and one file per call. */
export type StatusRecords = { host: ClientId; folder: string; session: string; files: RecordFiles }

export const RECORDS_PER_SESSION = 100
/** How long after its last Status call a session's records are dropped. */
export const RECORDS_KEPT_MS = 14 * 24 * 60 * 60_000
/** How often a process looks for sessions whose records are past `RECORDS_KEPT_MS`. */
const RECORDS_SWEEP_MS = 60 * 60_000
const RECORD_NAME = /^(\d{13})-[a-z-]+\.jsonl$/
const sweptAt = new Map<string, number>()

/** A session's folder name: its id, with anything that could leave the records folder replaced. */
function recordsFolderName(session: string): string {
  return session.replace(/[^A-Za-z0-9_-]/g, '_') || '_'
}

/** A record's file name: the call's start time, which sorts the session's records oldest first, and its kind. */
export function recordFileName(at: number, kind: StatusCallKind): string {
  return `${String(at).padStart(13, '0')}-${kind}.jsonl`
}

/**
 * Writes `record` as one JSON line in a file of its own, then drops the session's oldest records past
 * `RECORDS_PER_SESSION`, and the records of sessions whose last call is older than `RECORDS_KEPT_MS`.
 */
export async function writeStatusRecord(records: StatusRecords, record: StatusRecord): Promise<void> {
  const { files, folder } = records
  const own = `${folder}/${recordsFolderName(records.session)}`
  await files.write(`${own}/${recordFileName(record.at, record.exchange.kind)}`, `${JSON.stringify(record)}\n`)
  const names = (await files.list(own)).filter(n => RECORD_NAME.test(n)).sort()
  const past = names.slice(0, Math.max(0, names.length - RECORDS_PER_SESSION))
  if (past.length > 0) await files.removeFiles(past.map(n => `${own}/${n}`))
  if (record.at - (sweptAt.get(folder) ?? -Infinity) < RECORDS_SWEEP_MS) return
  sweptAt.set(folder, record.at)
  for (const session of await files.list(folder)) {
    const theirs = `${folder}/${session}`
    if (theirs === own) continue
    const kept = (await files.list(theirs)).filter(n => RECORD_NAME.test(n))
    const lastAt = Math.max(...kept.map(n => Number(RECORD_NAME.exec(n)![1])))
    if (record.at - lastAt < RECORDS_KEPT_MS) continue
    if (kept.length > 0) await files.removeFiles(kept.map(n => `${theirs}/${n}`))
    await files.removeFolder(theirs).catch(() => undefined)
  }
}

/** A Status call record's account of one call the host heard. */
function attemptOf({ text, report, thrown, ms }: HeardCall): StatusAttempt {
  return {
    model: report?.model ?? null,
    answeredBy: report?.answeredBy ?? null,
    answer: text,
    error: text === null ? (thrown ?? report?.error ?? 'no answer, and the host gave no reason') : null,
    ms,
  }
}

/**
 * Runs the Status call on the Status and asks in `s`, and writes its answer, or saves why it wrote nothing. An
 * answer that holds prose is asked once more. `appliedAfter` drops the write as `appliedStatus` does, and skips the
 * call when `s` already shows it would be dropped. With
 * `records`, it then writes the call's record in the background, and drops a failed write.
 */
export async function askAndWriteStatus<S extends Session>(
  host: Pick<StatusHost<S>, 'now' | 'update' | 'records' | 'names'>,
  s: S,
  call: StatusCall,
  tasks: HostTask[],
  appliedAfter: number,
): Promise<void> {
  if (!isStatusCallCurrent(s, appliedAfter)) return
  const input = { last: s.ledger.overview, asks: s.ledger.items, tasks, now: await host.now() }
  const prompt = statusCallPrompt(input, call.exchange)
  const system = hostStatusSystem(host.names)
  const heards: { kind: CallKind; heard: HeardCall }[] = []
  const { last } = await askStatus(async () => {
    const kind = { call: 'status', reads: call.exchange.kind, isRetry: heards.length > 0 } as const
    const heard = await heardCall(call.ask, prompt, system, kind, () => host.now())
    heards.push({ kind, heard })
    return heard
  })
  const attempts = heards.map(h => attemptOf(h.heard))
  const answer = last.text === null ? null : parseStatus(last.text)
  const now = await host.now()
  let before: SessionStatus | null = null
  let isWritten = false
  const noted = (current: S) =>
    heards.reduce(
      (x, h) => withCall(x, h.kind, h.heard, h.heard.text !== null && parseStatus(h.heard.text) !== null, now),
      current,
    )
  const after = await host.update(current => {
    const x = noted(current)
    before = x.ledger.overview
    isWritten = isStatusCallCurrent(x, appliedAfter)
    const readSetAt = input.last?.goal?.setAt ?? null
    return answer === null
      ? failedStatus(x, last.text, appliedAfter, now)
      : appliedStatus(x, answer, appliedAfter, now, readSetAt, call.exchange.kind === 'catch-up')
  })
  if (!host.records) return
  const record: StatusRecord = {
    version: STATUS_RECORD_VERSION,
    host: host.records.host,
    session: host.records.session,
    at: input.now,
    system,
    prompt,
    input,
    exchange: call.exchange,
    attempts,
    isParsed: answer !== null,
    isWritten,
    before,
    after: after.ledger.overview,
  }
  void writeStatusRecord(host.records, record).catch(() => undefined)
}

/**
 * Runs the Status call on the running turn's work so far, once the session's earlier Status calls have finished.
 * A host calls it after `claimedStatusRefresh` claimed the call. A turn that ended meanwhile is left to the call after
 * its reply.
 */
export function refreshStatus<S extends Session>(host: StatusHost<S>): Promise<void> {
  return host.inOrder(async () => {
    const s = await host.read()
    if (!s.presence.isTurnRunning) return
    const { person, trigger, activity } = s.turn
    const call: StatusCall = { exchange: { kind: 'mid-turn', turn: { person, trigger, activity } }, ask: host.ask }
    await askAndWriteStatus(host, s, call, s.hostTasks, s.presence.turnsApplied)
  })
}
