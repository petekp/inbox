import { parseReply } from './reply-parse'
import { systemText, buildPrompt } from './ledger-prompt'
import { transcriptCatchUpPrompt } from './catch-up-text'
import type { Host } from './model-text'
import type { GhRun } from './pr-fetch'
import type { Effect } from './press-reducer'
import type { AnswerMessage } from './press-messages'
import { parsedReply, applied } from './session-turns'
import { needsCatchUp, appliedCatchUp } from './session-status'
import type { SendOutcome } from './session-presses'
import type { Session, HostTask } from '../types'
import { askAndWriteStatus } from './status-records'
import type { StatusCall, StatusRecords } from './status-records'
export { fetchPrs, isPrFetchDue } from './host-prs'
export { refreshStatus } from './status-records'
export type { StatusCall, StatusRecords, RecordFiles } from './status-records'
export { startPress, wakeForDone } from './host-press'

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
