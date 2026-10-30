import { parseReply } from './ledger'
import { askStatus, parseStatus } from './status'
import {
  buildPrompt,
  STATUS_SYSTEM,
  statusCatchUpPrompt,
  statusMidTurnPrompt,
  statusPrompt,
  systemText,
  transcriptCatchUpPrompt,
} from './model-text'
import type { Host, StatusCallInput } from './model-text'
import { fetchTracked, fixCheckEffect, isPrFixPress, isPrPress, pressRowId, PR_FIX_LABELS, splitLinked } from './pr-tab'
import type { GhRun, PrFixPress, PrPress } from './pr-tab'
import {
  doneWake,
  finishedResult,
  localLast,
  markSentToAgent,
  pendingResult,
  recordPress,
  refuseDoneNotification,
  runLocalEffects,
  runSends,
  withDeliveryId,
  withLasts,
  withResult,
  withUnconfirmed,
} from './presses'
import type { AnswerMessage, Effect, EffectHost, RowPress } from './presses'
import {
  applied,
  parsedReply,
  appliedCatchUp,
  appliedStatus,
  completedAttempt,
  failedStatus,
  needsCatchUp,
  pressOn,
  withFetchedPrs,
  withHolds,
} from './session'
import type { Pressed, SendOutcome, Session } from './session'
import type { Holds } from './view'
import type { ClientId } from './clients'
import type { Exchange, HostTask, LastAction, SessionStatus, RowNote } from '../types'

type Exclusive<T> = { acquired: true; value: T } | { acquired: false }

/** Keys that at most one run holds at a time in this process. */
export function exclusiveKeys(): {
  /** Runs `fn` unless a run already holds `key`. The hold ends when `fn` settles. */
  run<T>(key: string, fn: () => Promise<T>): Promise<Exclusive<T>>
  isHeld(key: string): boolean
} {
  const held = new Set<string>()

  return {
    run: async (key, fn) => {
      if (held.has(key)) return { acquired: false }
      held.add(key)
      try {
        return { acquired: true, value: await fn() }
      } finally {
        held.delete(key)
      }
    },
    isHeld: key => held.has(key),
  }
}

/** Keys whose runs go one after another in this process, each starting when the one before it has settled. */
export function orderedKeys(): { run<T>(key: string, fn: () => Promise<T>): Promise<T> } {
  const tails = new Map<string, Promise<unknown>>()

  return {
    run: (key, fn) => {
      const result = (tails.get(key) ?? Promise.resolve()).then(fn)
      const tail = result.catch(() => undefined)
      tails.set(key, tail)
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key)
      })

      return result
    },
  }
}

/**
 * What a host knows about one model call besides its answer: the model it asked for, the model that answered when
 * the host says, and why the call gave no answer.
 */
export type CallReport = { model: string; answeredBy?: string; error?: string }

/** Calls the inbox model with `system` as its system text. Null when the call fails. `report` hears about the call. */
export type Ask = (prompt: string, system: string, report?: (r: CallReport) => void) => Promise<string | null>

/** Everything a host supplies to run one session. A function here takes the members it uses. */
export type SessionHost<S extends Session> = {
  now(): number | Promise<number>
  read(): Promise<S>
  /** Changes the session under its lock. An external effect, such as a delivery, runs outside a change. */
  update(change: (s: S) => S | Promise<S>): Promise<S>
  /** Runs `fn` unless another run holds the session's per-reply update. */
  exclusive<T>(fn: () => Promise<T>): Promise<Exclusive<T>>
  /** Calls the inbox model, once for the ledger and once for the Status. Null when a call fails. */
  ask: Ask
  /** Sends a message to the agent as if the person typed it. Runs outside a change, so it may change the session itself. */
  deliver(s: S, text: string, deliveryId: string): Promise<SendOutcome>
  /** True when `deliver` returns only once the message runs, which can be a whole turn later. Until then its press reads Queued. */
  isDeliveryHeldUntilRun?: boolean
  /** Throws when `deliver` could not start. Run before a sent record is saved, so a message that cannot go leaves no record. */
  prepare?(s: S): Promise<void>
  /** Opens a link or path, or copies text. Returns why it could not, or null. */
  perform(s: S, effect: Extract<Effect, { kind: 'open' | 'copy' }>): Promise<string | null>
  /** Fetches the session's PRs, and resolves once that fetch ends. A failed fetch resolves too, since each PR's own error says why. */
  refreshPrs(): Promise<void>
  gh: {
    /** The gh to run, or null when none starts. */
    find(): Promise<string | null>
    /** Drops the gh `find` kept, so the next call looks again. */
    forget(): void
    /** Runs gh for the session. `onUnstartable` is called when a run cannot start. */
    run(s: S, bin: string, onUnstartable: () => void): GhRun
    /** Reports whether gh was found. */
    noteMissing(isMissing: boolean): void
  }
  /** How long a closed row stays settled before the agent is told about it. */
  settleWindowMs: number
  /** A new id for a delivery. */
  newId(): string
  /** The message an answer press sends, when the agent reads answers in its own form. */
  answerMessage?: AnswerMessage
  /** The absolute path of the page template for a comparison, in the host's own folder. */
  comparePage: string
}

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

/** A Status call: what it reads as its exchange, and the model call that sends its prompt with `STATUS_SYSTEM`. */
export type StatusCall = { exchange: StatusExchange; ask: Ask }

/** What a host's catch-up found: the model's answer to apply, or why there is none. */
export type CatchUpReply =
  /**
   * `source` is the text the answer may quote code blocks from, or null when the model read the conversation itself.
   * `statusCall` is null when the host has nothing for the Status call to read, so it writes no Status.
   */
  | { kind: 'reply'; text: string; source: string | null; statusCall: StatusCall | null }
  /** The model gave no answer. */
  | { kind: 'failed' }
  /** There is no conversation to read, so the pending exchanges run instead. */
  | { kind: 'unreadable' }

export type UpdateHost<S extends Session> = Pick<SessionHost<S>, 'now' | 'read' | 'update' | 'exclusive' | 'ask'> & {
  /** The host's names, which the ledger call's system text uses. */
  names: Host
  /**
   * Has the inbox model read the whole conversation, and returns its answer for `runUpdates` to apply. Absent when
   * the host cannot read the conversation.
   */
  catchUp?(s: S): Promise<CatchUpReply>
  /**
   * Runs `fn` once the session's earlier Status calls have finished, so each reads the Status the one before
   * wrote. The wait is for Status calls only: the lock and the ledger calls never queue behind it.
   */
  inOrder<T>(fn: () => Promise<T>): Promise<T>
  /**
   * Keeps the Status calls running after `runUpdates` returns, so the next update starts at once. Absent: `runUpdates`
   * returns only once they have finished, as a Codex update process must stay alive until its calls end.
   */
  background?(statuses: Promise<void>): void
  /** Where a next build keeps a record of each Status call. A release build passes none, and records nothing. */
  records?: StatusRecords
}

type StatusHost<S extends Session> = Pick<UpdateHost<S>, 'now' | 'read' | 'update' | 'ask' | 'inOrder' | 'records'>

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

/** Sends `prompt` once, and notes what the host says of the call. */
async function attempt(
  host: Pick<StatusHost<Session>, 'now'>,
  ask: Ask,
  prompt: string,
): Promise<StatusAttempt & { text: string | null }> {
  const heard: { report?: CallReport; thrown?: string } = {}
  const startedAt = await host.now()
  const text = await ask(prompt, STATUS_SYSTEM, r => (heard.report = r)).catch((err: unknown) => {
    heard.thrown = err instanceof Error ? err.message : String(err)
    return null
  })

  return {
    text,
    model: heard.report?.model ?? null,
    answeredBy: heard.report?.answeredBy ?? null,
    answer: text,
    error: text === null ? (heard.thrown ?? heard.report?.error ?? 'no answer, and the host gave no reason') : null,
    ms: (await host.now()) - startedAt,
  }
}

/**
 * Runs the Status call on the Status and asks in `s`, and writes its answer, or saves why it wrote nothing. An
 * answer that holds prose is asked once more. `appliedAfter` drops the write as `appliedStatus` does. With
 * `records`, it then writes the call's record in the background, and drops a failed write.
 */
async function askAndWriteStatus<S extends Session>(
  host: Pick<StatusHost<S>, 'now' | 'update' | 'records'>,
  s: S,
  call: StatusCall,
  tasks: HostTask[],
  appliedAfter: number,
): Promise<void> {
  const input = { last: s.ledger.overview, asks: s.ledger.items, tasks, now: await host.now() }
  const prompt = statusCallPrompt(input, call.exchange)
  const attempts: StatusAttempt[] = []
  const { last } = await askStatus(async () => {
    const { text, ...made } = await attempt(host, call.ask, prompt)
    attempts.push(made)
    return { text }
  })
  const answer = last.text === null ? null : parseStatus(last.text)
  const now = await host.now()
  let before: SessionStatus | null = null
  let isWritten = false
  const after = await host.update(x => {
    before = x.ledger.overview
    isWritten = x.presence.turnsApplied >= appliedAfter
    return answer === null ? failedStatus(x, last.text, appliedAfter, now) : appliedStatus(x, answer, appliedAfter, now)
  })
  if (!host.records) return
  const record: StatusRecord = {
    version: STATUS_RECORD_VERSION,
    host: host.records.host,
    session: host.records.session,
    at: input.now,
    system: STATUS_SYSTEM,
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

/**
 * Asks the model to catch the ledger up over `conversation`, for a host that reads the conversation as text. A null
 * or empty `conversation` is unreadable. `screen` is what the person sees of the inbox.
 */
export async function askOverConversation(
  ask: Ask,
  names: Host,
  s: Session,
  screen: string,
  conversation: string | null,
): Promise<CatchUpReply> {
  if (!conversation) return { kind: 'unreadable' }
  const text = await ask(transcriptCatchUpPrompt(s.ledger, screen, conversation), systemText(names)).catch(() => null)

  return text === null
    ? { kind: 'failed' }
    : {
        kind: 'reply',
        text,
        source: conversation,
        statusCall: { exchange: { kind: 'catch-up', conversation }, ask },
      }
}

export async function reconcileUpdateStatus<S extends Session>(
  host: Pick<UpdateHost<S>, 'read' | 'update' | 'exclusive'>,
): Promise<S> {
  const state = await host.read()
  if (!state.presence.isUpdating) return state
  const checked = await host.exclusive(() =>
    host.update(current =>
      current.presence.isUpdating
        ? {
            ...current,
            presence: {
              ...current.presence,
              isUpdating: false,
              ledgerState: current.pending.length > 0 ? 'failed' : current.presence.ledgerState,
            },
          }
        : current,
    ),
  )
  return checked.acquired ? checked.value : state
}

/**
 * Runs the update for the session while this process holds the update lock: a catch-up over the whole conversation
 * when `needsCatchUp` says the ledger may have missed a turn and the host can read the conversation, otherwise the
 * pending exchanges, oldest first. An update started meanwhile finds the lock held and exits, so the work is read
 * again after the lock is released.
 *
 * Each update runs the ledger call first and applies its answer at once. Then the Status call runs, with the
 * Status as it stands once the earlier Status calls have written theirs, and its answer is written in a second
 * change. Status calls run one after another, apart from the lock and from `isUpdating`: no ledger call waits for
 * one. With `background`, `runUpdates` returns when the ledger work is done; without it, once every Status call has
 * finished.
 *
 * A catch-up that fails ends the run, and the next update tries it again. A conversation that cannot be read is not
 * tried again in this run. A ledger call that fails skips the Status call.
 */
export async function runUpdates<S extends Session>(host: UpdateHost<S>): Promise<void> {
  let canCatchUp = host.catchUp !== undefined
  const wantsCatchUp = (s: S) => canCatchUp && needsCatchUp(s)
  const hasWork = (s: S) => s.pending.length > 0 || wantsCatchUp(s)
  const writing: Promise<void>[] = []
  /** Runs the Status call for an applied update, once the session's earlier Status calls have finished. */
  const writeStatus = (after: S, call: StatusCall, tasks: HostTask[]) =>
    host.inOrder(async () => askAndWriteStatus(host, await host.read(), call, tasks, after.presence.turnsApplied))
  const followUp = (run: Promise<void>) => {
    const settled = run.catch(() => undefined)
    if (host.background) host.background(settled)
    else writing.push(settled)
  }
  try {
    while (hasWork(await host.read())) {
      const held = await host.exclusive(async () => {
        try {
          for (;;) {
            const s = await host.update(x => ({ ...x, presence: { ...x.presence, isUpdating: hasWork(x) } }))
            if (!hasWork(s)) break
            if (wantsCatchUp(s)) {
              const reply = await host.catchUp!(s).catch((): CatchUpReply => ({ kind: 'failed' }))
              if (reply.kind === 'unreadable') {
                canCatchUp = false
                continue
              }
              const parsed = reply.kind === 'reply' ? parseReply(reply.text, reply.source) : null
              const at = await host.now()
              const after = await host.update(x => appliedCatchUp(x, s, parsed, at))
              if (!parsed) return 'stop' as const
              if (reply.kind === 'reply' && reply.statusCall)
                followUp(writeStatus(after, reply.statusCall, s.hostTasks))
              continue
            }
            const next = s.pending[0]!
            const promptAt = await host.now()
            const reply = await host.ask(buildPrompt(s.ledger, next.ex), systemText(host.names)).catch(() => null)
            const parsed = parsedReply(next.ex, reply)
            let isApplied = false as boolean
            const after = await host.update(async x => {
              isApplied = false
              if (x.pending[0]?.turnsStarted !== next.turnsStarted || x.pending[0].ex.turn !== next.ex.turn) return x
              isApplied = parsed !== null

              return applied(x, parsed, await host.now(), promptAt)
            })
            if (isApplied)
              followUp(
                writeStatus(after, { exchange: { kind: 'reply', exchange: next.ex }, ask: host.ask }, next.ex.tasks),
              )
            if (after.pending[0]?.failed && !next.failed) return 'stop' as const
          }
        } finally {
          await host.update(x => ({ ...x, presence: { ...x.presence, isUpdating: false } }))
        }
      })
      if (!held.acquired || held.value === 'stop') return
    }
  } finally {
    await Promise.all(writing)
  }
}

type WakeHost<S extends Session> = Pick<
  SessionHost<S>,
  'now' | 'read' | 'update' | 'deliver' | 'prepare' | 'settleWindowMs' | 'newId' | 'isDeliveryHeldUntilRun'
>

/**
 * Tells the agent about rows closed with Done once their settle window has passed and no main-agent turn runs. A
 * refused message marks those rows with why, so they read "Not sent" and offer Undo. `current` is the session when the
 * host has just read it.
 */
export async function wakeForDone<S extends Session>(host: WakeHost<S>, current?: S): Promise<void> {
  const check = async (s: S) =>
    doneWake(s.ledger, {
      now: await host.now(),
      windowMs: host.settleWindowMs,
      isTurnRunning: s.presence.isTurnRunning,
    })
  if (!(await check(current ?? (await host.read())))) return
  let attempt: { deliveryId: string; text: string } | null = null
  await host.update(async s => {
    // A host may run the change again on a newer session, which can have nothing left to send.
    attempt = null
    const wake = await check(s)
    if (!wake) return s
    await host.prepare?.(s)
    const deliveryId = host.newId()
    attempt = { deliveryId, text: wake.text }
    const lastActions = { ...s.lastActions }
    for (const closed of s.ledger.closed) {
      if (!wake.ids.includes(closed.id)) continue
      const previous = lastActions[closed.id]
      const last =
        previous?.kind === 'mark' && previous.action === 'done' && previous.at === closed.at
          ? previous
          : recordPress('mark', 'done', 'Done', { now: closed.at, turnsStarted: s.presence.turnsStarted })
      lastActions[closed.id] = {
        ...last,
        delivery: { state: host.isDeliveryHeldUntilRun ? 'queued' : 'unconfirmed', message: wake.text, id: deliveryId },
      }
    }
    const next: S = {
      ...s,
      ledger: markSentToAgent(s.ledger, wake.ids, deliveryId),
      lastActions,
      sent: [
        ...s.sent,
        {
          text: wake.text,
          press: { id: wake.ids[0]!, action: 'done' },
          at: await host.now(),
          row: wake.ids[0]!,
          queuedId: null,
          pressedAt: null,
          deliveryId,
          phase: 'attempting',
        },
      ],
    }

    return next
  })
  const sending = attempt as { deliveryId: string; text: string } | null
  if (!sending) return
  const outcome = await host.deliver(await host.read(), sending.text, sending.deliveryId)
  await host.update(s => {
    const after = completedAttempt(s, sending.deliveryId, outcome)

    return outcome.state === 'rejected'
      ? { ...after, ledger: refuseDoneNotification(after.ledger, sending.deliveryId, outcome.reason) }
      : after
  })
}

export type PressOutcome = {
  copy: { text: string; name: string } | null
  error: string | null
  note: RowNote['note'] | null
  /** The delivery may or may not have reached the agent. */
  isUnconfirmed: boolean
  /** The message was refused, and the pressed row still reads that failure, since no later press replaced it. */
  isRowFailed: boolean
  /** The press closed a row with Done. Call `wakeForDone` once the settle window has passed. */
  wakesForDone: boolean
}

type PressHost<S extends Session> = Pick<
  SessionHost<S>,
  | 'now'
  | 'read'
  | 'update'
  | 'deliver'
  | 'perform'
  | 'refreshPrs'
  | 'newId'
  | 'isDeliveryHeldUntilRun'
  | 'answerMessage'
  | 'comparePage'
  | 'settleWindowMs'
>

/** A fix press's check of the PR: the row's last press before it, and when its "Refreshing" result began. */
type PrFixCheck = { rowId: string; before: LastAction | undefined; pendingAt: number; pressId: string }

/** The row's last press as it was before the check, while the row still holds the check's result. */
function withoutCheck<S extends Session>(s: S, check: PrFixCheck | null): S {
  const result = check ? s.lastActions[check.rowId]?.result : undefined
  if (!check || result?.at !== check.pendingAt || result.pressId !== check.pressId) return s
  const { [check.rowId]: _check, ...rest } = s.lastActions

  return { ...s, lastActions: check.before ? { ...rest, [check.rowId]: check.before } : rest }
}

/**
 * Reads the PR from GitHub before a fix press sends, while the row reads "Refreshing PR #12…". `stale` when the saved
 * view already shows no problem. `unread` when the refresh did not read the PR, which the row's result then says.
 * Otherwise the check, for the press to apply on the refreshed view.
 */
async function checkPrFirst<S extends Session>(
  host: PressHost<S>,
  p: PrFixPress,
  rowId: string,
  pressId: string,
  holds: Holds,
): Promise<'stale' | 'unread' | PrFixCheck> {
  const checking: { check?: PrFixCheck } = {}
  await host.update(async saved => {
    delete checking.check
    const s = withHolds(saved, holds)
    const at = await host.now()
    const pr = s.prViews.views[p.ref]
    if (!pr || 'stale' in pressOn(s, p, at, { settleWindowMs: host.settleWindowMs, holds }, host)) return s
    const before = s.lastActions[rowId]
    const pending = pendingResult([fixCheckEffect(pr)], at, pressId)
    checking.check = { rowId, before, pendingAt: at, pressId }

    return {
      ...s,
      lastActions: {
        ...s.lastActions,
        [rowId]: localLast(before, { action: p.action, text: PR_FIX_LABELS[p.action] }, pending),
      },
    }
  })
  const check = checking.check
  if (!check) return 'stale'
  await host.refreshPrs()
  let isRead = false
  await host.update(async s => {
    const pr = s.prViews.views[p.ref]
    isRead = pr?.fetchedAt !== undefined && pr.fetchedAt >= check.pendingAt
    const pending = s.lastActions[rowId]?.result
    if (isRead || !pending) return s
    const failed = finishedResult(pending, [pr?.error ?? 'gh could not read it'], await host.now())

    return { ...s, lastActions: withResult(s.lastActions, rowId, check.pendingAt, failed) }
  })

  return isRead ? check : 'unread'
}

/** A press that is saved, with what it still runs. */
type StartedPress = {
  /** The effects the press runs. Null when it was stale or could not be saved, so it runs nothing. */
  effects: Effect[] | null
  /** Delivers the press's message, outside the session's lock, then runs its opens and copies. */
  finish(): Promise<PressOutcome>
}

/**
 * Applies and saves a press. When it sends a message, the sent record is saved with it. A look can update its own
 * drawing before `finish` delivers, since a host's delivery can run the host's own handlers before it returns. `holds`
 * are the reply holds the look draws the rows with, so a press whose button draws as out sends nothing.
 */
export async function startPress<S extends Session>(
  host: PressHost<S>,
  p: RowPress | PrPress,
  isStale: boolean,
  holds: Holds,
): Promise<StartedPress> {
  const rowId = pressRowId(p)
  const localPressId = host.newId()
  let isUnconfirmed = false
  let isRowFailed = false
  let copy: PressOutcome['copy'] = null
  let error: string | null = null
  let note: PressOutcome['note'] = isStale ? 'stale' : null
  const pressed: { r?: Pressed; at?: number; deliveryId?: string } = {}
  const effectHost: EffectHost = {
    now: host.now,
    deliveryId: () => pressed.deliveryId ?? host.newId(),
    perform: async e => {
      if (e.kind === 'refresh-prs') {
        await host.refreshPrs()
        return null
      }
      if (e.kind === 'copy') copy = { text: e.text, name: e.name }
      return host.perform(await host.read(), e)
    },
    send: async (e, deliveryId) => {
      try {
        const outcome = await host.deliver(await host.read(), e.text, deliveryId)
        await host.update(s => completedAttempt(s, deliveryId, outcome))
        return outcome.state === 'accepted' ? { state: 'accepted' as const } : outcome
      } catch (err) {
        return { state: 'unconfirmed' as const, reason: err instanceof Error ? err.message : String(err) }
      }
    },
    saveLasts: async f => (await host.update(s => ({ ...s, lastActions: f(s.lastActions) }))).lastActions,
    saveLedger: async f => {
      await host.update(s => ({ ...s, ledger: f(s.ledger) }))
    },
  }
  const check =
    isPrPress(p) && isPrFixPress(p) && !isStale
      ? await checkPrFirst(host, p, rowId, localPressId, holds).catch((err: unknown) => {
          error = `Not sent: ${err instanceof Error ? err.message : String(err)}`
          return 'unread' as const
        })
      : null
  if (check === 'stale' || check === 'unread')
    return {
      effects: null,
      finish: async () => ({
        copy,
        error,
        note: check === 'stale' ? 'stale' : null,
        isUnconfirmed,
        isRowFailed,
        wakesForDone: false,
      }),
    }
  await host
    .update(async saved => {
      // A host may run the change again on a newer session, where the press can be stale.
      note = isStale ? 'stale' : null
      Object.assign(pressed, { r: undefined, at: undefined, deliveryId: undefined })
      const s = withoutCheck(withHolds(saved, holds), check)
      if (note) return s
      // Read under the lock, so the press is timed after every write that landed before it.
      const at = await host.now()
      const r = pressOn(s, p, at, { settleWindowMs: host.settleWindowMs, holds }, host, localPressId)
      if ('stale' in r) {
        note = 'stale'
        return s
      }
      const firstSend = r.effects.find(e => e.kind === 'send')
      const deliveryId = firstSend ? host.newId() : undefined
      const pressLasts =
        firstSend && deliveryId
          ? withDeliveryId(r.lasts, Object.keys(r.lasts), at, firstSend.text, deliveryId)
          : r.lasts
      const next: S = {
        ...s,
        ledger: r.ledger,
        lastActions: withLasts(s.lastActions, pressLasts, r.drop),
        told: r.reopenedId ? { ...s.told, closed: s.told.closed.filter(id => id !== r.reopenedId) } : s.told,
      }
      Object.assign(pressed, { r, at, deliveryId })
      if (!firstSend || !deliveryId) return next

      return {
        ...next,
        lastActions: host.isDeliveryHeldUntilRun
          ? next.lastActions
          : withUnconfirmed(next.lastActions, firstSend.text, at, deliveryId),
        sent: [
          ...next.sent,
          {
            text: firstSend.text,
            press: firstSend.by,
            at: await host.now(),
            row: rowId,
            queuedId: null,
            pressedAt: at,
            deliveryId,
            phase: 'attempting',
          },
        ],
      }
    })
    .catch((err: unknown) => {
      pressed.r = undefined
      error = `Not sent: ${err instanceof Error ? err.message : String(err)}`
    })
  const r = pressed.r
  const at = pressed.at
  if (!r || at === undefined)
    return {
      effects: null,
      finish: async () => ({ copy, error, note, isUnconfirmed, isRowFailed, wakesForDone: false }),
    }

  return {
    effects: r.effects,
    finish: async () => {
      try {
        const failed = await runSends(effectHost, r.effects, rowId, Object.keys(r.lasts), at)
        if (failed?.state === 'rejected') {
          error = `Not sent: ${failed.reason}`
          isRowFailed = failed.isRowFailed
        }
        if (failed?.state === 'unconfirmed') isUnconfirmed = true
      } catch {
        isUnconfirmed = true
      }
      await runLocalEffects(effectHost, r.effects, rowId, r.lasts[rowId]?.result)

      return { copy, error, note, isUnconfirmed, isRowFailed, wakesForDone: !isPrPress(p) && p.action === 'done' }
    },
  }
}

/** Applies a press and runs it: `startPress`, then its `finish`. */
export async function press<S extends Session>(
  host: PressHost<S>,
  p: RowPress | PrPress,
  isStale: boolean,
  holds: Holds,
): Promise<PressOutcome> {
  return (await startPress(host, p, isStale, holds)).finish()
}

const PRS_REFRESH_MS = 120_000
const NEW_PR_FETCH_MS = 15_000

/**
 * True when the PRs are due for a fetch: none was fetched yet, the last is old, or, once `NEW_PR_FETCH_MS` has passed
 * since the last, a new tracked PR waits for its first or the agent replied since, as after a push that fixed a PR.
 */
export function isPrFetchDue(s: Session, lastFetchedAt: number | undefined, now: number): boolean {
  if (lastFetchedAt === undefined) return true
  const hasNewPr = splitLinked(s.prViews, s.ledger).tracked.some(ref => !(ref in s.prViews.views))
  const hasReplySince = (s.presence.lastReplyAt ?? 0) > lastFetchedAt

  return (
    now - lastFetchedAt >= PRS_REFRESH_MS || ((hasNewPr || hasReplySince) && now - lastFetchedAt >= NEW_PR_FETCH_MS)
  )
}

/** Which sessions have a PR fetch running, and when each last ended. */
export function prFetchTracker(now: () => number): {
  isFetching(id: string): boolean
  /**
   * Runs `fetch` when no fetch is running for `id` and `isPrFetchDue` says the PRs are due. Returns the run, which
   * never rejects, or null when nothing started.
   */
  fetchWhenDue(id: string, s: Session, fetch: () => Promise<void>): Promise<void> | null
  /**
   * Runs `fetch` as a press asks: now, or once the fetch running for `id` ends, since that fetch may have read the PRs
   * before the press. Presses during one running fetch share the fetch after it. Returns the run, which never rejects.
   */
  fetchNow(id: string, fetch: () => Promise<void>): Promise<void>
} {
  const running = new Map<string, Promise<void>>()
  const following = new Map<string, Promise<void>>()
  const endedAt = new Map<string, number>()
  const start = (id: string, fetch: () => Promise<void>) => {
    const run = fetch()
      .catch(() => undefined)
      .finally(() => {
        endedAt.set(id, now())
        running.delete(id)
      })
    running.set(id, run)

    return run
  }

  return {
    isFetching: id => running.has(id),
    fetchWhenDue: (id, s, fetch) =>
      running.has(id) || !isPrFetchDue(s, endedAt.get(id), now()) ? null : start(id, fetch),
    fetchNow: (id, fetch) => {
      const current = running.get(id)
      if (!current) return start(id, fetch)
      const next =
        following.get(id) ??
        current.then(() => {
          following.delete(id)
          return running.get(id) ?? start(id, fetch)
        })
      following.set(id, next)

      return next
    },
  }
}

/**
 * Fetches the PRs the session tracks and merges them in. `findsBranchPr` also looks up the current branch's PR.
 * Returns without fetching when gh cannot start.
 */
export async function fetchPrs<S extends Session>(
  host: Pick<SessionHost<S>, 'now' | 'read' | 'update' | 'gh'>,
  findsBranchPr: boolean,
): Promise<void> {
  const s = await host.read()
  const bin = await host.gh.find()
  host.gh.noteMissing(bin === null)
  if (bin === null) return
  let sawUnstartable = false
  const fetchWith = (path: string) =>
    fetchTracked(
      host.gh.run(s, path, () => {
        sawUnstartable = true
      }),
      s.prViews,
      s.ledger,
      findsBranchPr,
      () => host.now(),
    )
  let fetch = await fetchWith(bin)
  if (sawUnstartable) {
    host.gh.forget()
    const refound = await host.gh.find()
    host.gh.noteMissing(refound === null)
    if (refound === null) return
    if (refound !== bin) fetch = await fetchWith(refound)
  }
  const { views: fetched, branchRef, isGhSignedOut } = fetch
  await host.update(cur => withFetchedPrs(cur, fetched, branchRef, isGhSignedOut))
}
