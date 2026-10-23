import { parseReply } from './ledger'
import { parseOverview } from './overview'
import {
  buildPrompt,
  OVERVIEW_SYSTEM,
  overviewCatchUpPrompt,
  overviewPrompt,
  systemText,
  transcriptCatchUpPrompt,
} from './model-text'
import type { Host } from './model-text'
import { fetchTracked, prRowId, splitLinked } from './pr-tab'
import type { GhRun, PrPress } from './pr-tab'
import {
  doneWake,
  markSentToAgent,
  recordPress,
  refuseDoneNotification,
  runLocalEffects,
  runSends,
  withDeliveryId,
  withLasts,
  withUnconfirmed,
} from './presses'
import type { Effect, EffectHost, RowPress } from './presses'
import {
  applied,
  isReplyApplied,
  appliedCatchUp,
  appliedOverview,
  completedAttempt,
  needsCatchUp,
  pressOn,
  withFetchedPrs,
} from './session'
import type { Pressed, SendOutcome, Session } from './session'
import type { ReplyHolds } from './view'
import type { Overview, RowNote } from '../types'

export type Exclusive<T> = { acquired: true; value: T } | { acquired: false }

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

/** Calls the inbox model with `system` as its system text. Null when the call fails. */
export type Ask = (prompt: string, system: string) => Promise<string | null>

/** Everything a host supplies to run one session. A function here takes the members it uses. */
export type SessionHost<S extends Session> = {
  now(): number | Promise<number>
  read(): Promise<S>
  /** Changes the session under its lock. An external effect, such as a delivery, runs outside a change. */
  update(change: (s: S) => S | Promise<S>): Promise<S>
  /** Runs `fn` unless another run holds the session's per-reply update. */
  exclusive<T>(fn: () => Promise<T>): Promise<Exclusive<T>>
  /** Calls the inbox model, once for the ledger and once for the Overview. Null when a call fails. */
  ask: Ask
  /** Sends a message to the agent as if the person typed it. Runs outside a change, so it may change the session itself. */
  deliver(s: S, text: string, deliveryId: string): Promise<SendOutcome>
  /** True when `deliver` returns only once the message runs, which can be a whole turn later. Until then its press reads Queued. */
  isDeliveryHeldUntilRun?: boolean
  /** Throws when `deliver` could not start. Run before a sent record is saved, so a message that cannot go leaves no record. */
  prepare?(s: S): Promise<void>
  /** Opens a link or path, or copies text. Returns why it could not, or null. */
  perform(s: S, effect: Exclude<Effect, { kind: 'send' }>): Promise<string | null>
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
}

/**
 * Asks the Overview call for the guide as the whole conversation leaves it, given the Overview before. Null when the
 * call fails.
 */
export type AskCatchUpOverview = (last: Overview | null) => Promise<string | null>

/** What a host's catch-up found: the model's answer to apply, or why there is none. */
export type CatchUpReply =
  /** `source` is the text the answer may quote code blocks from, or null when the model read the conversation itself. */
  | { kind: 'reply'; text: string; source: string | null; overview: AskCatchUpOverview }
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
   * Runs `fn` once the session's earlier Overview calls have finished, so each reads the Overview the one before
   * wrote. The wait is for Overview calls only: the lock and the ledger calls never queue behind it.
   */
  inOrder<T>(fn: () => Promise<T>): Promise<T>
  /**
   * Keeps the Overview calls running after `runUpdates` returns, so the next update starts at once. Absent: `runUpdates`
   * returns only once they have finished, as a Codex update process must stay alive until its calls end.
   */
  background?(overviews: Promise<void>): void
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
        overview: last => ask(overviewCatchUpPrompt(last, conversation), OVERVIEW_SYSTEM),
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
 * Each update runs the ledger call first and applies its answer at once. Then the Overview call runs, with the
 * Overview as it stands once the earlier Overview calls have written theirs, and its answer is written in a second
 * change. Overview calls run one after another, apart from the lock and from `isUpdating`: no ledger call waits for
 * one. With `background`, `runUpdates` returns when the ledger work is done; without it, once every Overview call has
 * finished.
 *
 * A catch-up that fails ends the run, and the next update tries it again. A conversation that cannot be read is not
 * tried again in this run. A ledger call that fails skips the Overview call.
 */
export async function runUpdates<S extends Session>(host: UpdateHost<S>): Promise<void> {
  let canCatchUp = host.catchUp !== undefined
  const wantsCatchUp = (s: S) => canCatchUp && needsCatchUp(s)
  const hasWork = (s: S) => s.pending.length > 0 || wantsCatchUp(s)
  const writing: Promise<void>[] = []
  /** Runs the Overview call for an applied update and writes its answer. */
  const writeOverview = async (after: S, ask: (last: Overview | null) => Promise<string | null>) =>
    host.inOrder(async () => {
      const { ledger } = await host.read()
      const answer = parseOverview(await ask(ledger.overview).catch(() => null))
      if (answer === null) return
      await host.update(x => appliedOverview(x, answer, after.presence.turnsApplied))
    })
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
              if (reply.kind === 'reply') followUp(writeOverview(after, reply.overview))
              continue
            }
            const next = s.pending[0]!
            const promptAt = await host.now()
            const reply = await host.ask(buildPrompt(s.ledger, next.ex), systemText(host.names)).catch(() => null)
            let isApplied = false as boolean
            const after = await host.update(async x => {
              isApplied = false
              if (x.pending[0]?.turnsStarted !== next.turnsStarted || x.pending[0].ex.turn !== next.ex.turn) return x
              isApplied = isReplyApplied(x, reply)

              return applied(x, reply, await host.now(), promptAt)
            })
            if (isApplied)
              followUp(writeOverview(after, last => host.ask(overviewPrompt(last, next.ex), OVERVIEW_SYSTEM)))
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
 * refused message marks those rows with why, so they read "Not sent" and offer Undo.
 */
export async function wakeForDone<S extends Session>(host: WakeHost<S>): Promise<void> {
  const check = async (s: S) =>
    doneWake(s.ledger, {
      now: await host.now(),
      windowMs: host.settleWindowMs,
      isTurnRunning: s.presence.isTurnRunning,
    })
  if (!(await check(await host.read()))) return
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
  'now' | 'read' | 'update' | 'deliver' | 'perform' | 'newId' | 'isDeliveryHeldUntilRun'
>

/** A press that is saved, with what it still runs. */
export type StartedPress = {
  /** The effects the press runs. Null when it was stale or could not be saved, so it runs nothing. */
  effects: Effect[] | null
  /** Delivers the press's message, outside the session's lock, then runs its opens and copies. */
  finish(): Promise<PressOutcome>
}

/**
 * Applies and saves a press. When it sends a message, the sent record is saved with it. A look can update its own
 * drawing before `finish` delivers, since a host's delivery can run the host's own handlers before it returns.
 */
export async function startPress<S extends Session>(
  host: PressHost<S>,
  p: RowPress | PrPress,
  isStale: boolean,
  holds: ReplyHolds,
): Promise<StartedPress> {
  const rowId = 'ref' in p ? prRowId(p) : p.id
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
  await host
    .update(async saved => {
      // A host may run the change again on a newer session, where the press can be stale.
      note = isStale ? 'stale' : null
      Object.assign(pressed, { r: undefined, at: undefined, deliveryId: undefined })
      const s: S = { ...saved, heldRows: Object.keys(holds.replies) }
      if (note) return s
      // Read under the lock, so the press is timed after every write that landed before it.
      const at = await host.now()
      const r = pressOn(s, p, at, localPressId)
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

      return { copy, error, note, isUnconfirmed, isRowFailed, wakesForDone: !('ref' in p) && p.action === 'done' }
    },
  }
}

/** Applies a press and runs it: `startPress`, then its `finish`. */
export async function press<S extends Session>(
  host: PressHost<S>,
  p: RowPress | PrPress,
  isStale: boolean,
  holds: ReplyHolds,
): Promise<PressOutcome> {
  return (await startPress(host, p, isStale, holds)).finish()
}

const PRS_REFRESH_MS = 120_000
const NEW_PR_FETCH_MS = 15_000

/** True when the PRs are due for a fetch: none was fetched yet, the last is old, or a new tracked PR waits for its first. */
export function isPrFetchDue(s: Session, lastFetchedAt: number | undefined, now: number): boolean {
  if (lastFetchedAt === undefined) return true
  const hasNewPr = splitLinked(s.ledger.prs).tracked.some(ref => !(ref in s.prViews.views))

  return now - lastFetchedAt >= PRS_REFRESH_MS || (hasNewPr && now - lastFetchedAt >= NEW_PR_FETCH_MS)
}

/** Which sessions have a PR fetch running, and when each last ended. */
export function prFetchTracker(now: () => number): {
  isFetching(id: string): boolean
  /**
   * Runs `fetch` when no fetch is running for `id` and `isPrFetchDue` says the PRs are due. Returns the run, which
   * never rejects, or null when nothing started.
   */
  fetchWhenDue(id: string, s: Session, fetch: () => Promise<void>): Promise<void> | null
} {
  const running = new Set<string>()
  const endedAt = new Map<string, number>()

  return {
    isFetching: id => running.has(id),
    fetchWhenDue: (id, s, fetch) => {
      if (running.has(id) || !isPrFetchDue(s, endedAt.get(id), now())) return null
      running.add(id)

      return fetch()
        .catch(() => undefined)
        .finally(() => {
          endedAt.set(id, now())
          running.delete(id)
        })
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
      s.ledger.prs,
      findsBranchPr,
    )
  let fetch = await fetchWith(bin)
  if (sawUnstartable) {
    host.gh.forget()
    const refound = await host.gh.find()
    host.gh.noteMissing(refound === null)
    if (refound === null) return
    if (refound !== bin) fetch = await fetchWith(refound)
  }
  const { views: fetched, branchRef } = fetch
  await host.update(async cur => withFetchedPrs(cur, fetched, branchRef, await host.now()))
}
