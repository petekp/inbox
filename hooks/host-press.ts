import { cancelRemoteCommand, confirmRemoteDelivery } from './remote-command-state'
import {
  readFirstEffect,
  PR_READ_FIRST_LABELS,
  pressRowId,
  isPrPress,
  isPrReadFirstPress,
  isPrStaleReadPress,
  isViewBeforeReply,
} from './pr-press'
import type { PrReadFirstPress, PrStaleReadPress, PrPress } from './pr-press'
import {
  doneWake,
  markSentToAgent,
  refuseDoneNotification,
  withDeliveryId,
  withFailure,
  withUnconfirmed,
} from './press-reducer'
import type { Effect } from './press-reducer'
import { finishedResult, withResult, runSends, runLocalEffects } from './press-effects'
import { rerunRun } from './host-prs'
import { refreshProblem } from './pr-refresh'
import type { EffectHost } from './press-effects'
import { recordPress, pendingResult, localLast, withLasts, isHeldSend } from './pressed'
import { releaseHeldSendEarly, releaseHeldSends } from './held-sends'
import type { RowPress } from './presses'
import { completedAttempt, isRepeatWhileOut, withHolds, pressOn } from './session-presses'
import type { Pressed, SendOutcome } from './session-presses'
import type { Holds } from './timing'
import type { Session, RowNote, LastAction } from '../types'
import type { SessionHost } from './session-host'

type WakeHost<S extends Session> = Pick<
  SessionHost<S>,
  | 'now'
  | 'read'
  | 'readDurable'
  | 'update'
  | 'deliver'
  | 'prepare'
  | 'settleWindowMs'
  | 'newId'
  | 'isDeliveryHeldUntilRun'
>

/**
 * Runs what waited for the settle window to pass: the answers and Fixes held for Undo, then the Done message.
 * `current` is the session when the host has just read it.
 */
export async function wakeAfterSettle<S extends Session>(host: WakeHost<S>, current?: S): Promise<void> {
  await releaseHeldSends(host, current)
  await wakeForDone(host)
}

/**
 * Tells the agent about rows closed with Done once their settle window has passed and no main-agent turn runs. A
 * refused message marks those rows with why, so they read "Not sent" and offer Undo.
 */
async function wakeForDone<S extends Session>(host: WakeHost<S>, current?: S): Promise<void> {
  const check = async (s: S) =>
    doneWake(
      {
        ...s.ledger,
        closed: s.ledger.closed.filter(c => !c.commandId || s.remoteCommands[c.commandId]?.state === 'applied'),
      },
      {
        now: await host.now(),
        windowMs: host.settleWindowMs,
        isTurnRunning: s.presence.isTurnRunning,
      },
    )
  if (!(await check(current ?? (await host.read())))) return
  let attempt: { deliveryId: string; text: string } | null = null
  const attemptId = host.newId()
  const startedState = await host.update(async s => {
    // A host may run the change again on a newer session, which can have nothing left to send.
    attempt = null
    const wake = await check(s)
    if (!wake) return s
    await host.prepare?.(s)
    const deliveryId = attemptId
    attempt = { deliveryId, text: wake.text }
    const lastActions = { ...s.lastActions }
    const sentAt = await host.now()
    for (const closed of s.ledger.closed) {
      if (!wake.ids.includes(closed.id)) continue
      const previous = lastActions[closed.id]
      const last =
        previous?.kind === 'mark' && previous.action === 'done' && previous.at === closed.at
          ? previous
          : recordPress('mark', 'done', 'Done', { now: closed.at, turnsStarted: s.presence.turnsStarted })
      lastActions[closed.id] = {
        ...last,
        ...(closed.commandId && { commandId: closed.commandId }),
        delivery: {
          state: host.isDeliveryHeldUntilRun ? 'queued' : 'unconfirmed',
          message: wake.text,
          id: deliveryId,
          sentAt,
        },
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
          at: sentAt,
          row: wake.ids[0]!,
          queuedId: null,
          pressedAt: null,
          deliveryId,
          phase: 'attempting',
          commandIds: wake.ids.flatMap(id => (lastActions[id]?.commandId ? [lastActions[id]!.commandId!] : [])),
        },
      ],
    }

    return next
  })
  const sending = attempt as { deliveryId: string; text: string } | null
  if (!sending) return
  await confirmRemoteDelivery(host, startedState, sending.deliveryId)
  const outcome: SendOutcome = await host
    .deliver(await host.read(), sending.text, sending.deliveryId)
    .catch((err: unknown) => ({ state: 'unconfirmed', reason: err instanceof Error ? err.message : String(err) }))
  await host.update(s => {
    const after = completedAttempt(s, sending.deliveryId, outcome)
    if (outcome.state === 'unconfirmed')
      return { ...after, lastActions: withUnconfirmed(after.lastActions, sending.text, undefined, sending.deliveryId) }
    if (outcome.state !== 'rejected') return after
    const woken = after.ledger.closed.filter(c => c.doneNotification?.id === sending.deliveryId)
    const lastActions = woken.reduce(
      (actions, c) => withFailure(actions, [c.id], c.at, outcome.reason, sending.deliveryId),
      after.lastActions,
    )

    return { ...after, lastActions, ledger: refuseDoneNotification(after.ledger, sending.deliveryId, outcome.reason) }
  })
}

export type PressOutcome = {
  /** The text of a copy the host could not run, for the look to show for copying by hand. */
  copy: { text: string; name: string } | null
  error: string | null
  note: RowNote['note'] | null
  /** The delivery may or may not have reached the agent. */
  isUnconfirmed: boolean
  /** The message was refused, and the pressed row still reads that failure, since no later press replaced it. */
  isRowFailed: boolean
  /** The press closed a row with Done or held its message for Undo. Call `wakeAfterSettle` once the settle window has passed. */
  wakesAfterSettle: boolean
}

export type PressHost<S extends Session> = Pick<
  SessionHost<S>,
  | 'now'
  | 'read'
  | 'readDurable'
  | 'update'
  | 'deliver'
  | 'prepare'
  | 'perform'
  | 'refreshPrs'
  | 'refreshPrsIfDue'
  | 'gh'
  | 'newId'
  | 'isDeliveryHeldUntilRun'
  | 'answerMessage'
  | 'comparePage'
  | 'compareInBackground'
  | 'settleWindowMs'
>

/** A read-first press's check of the PR: the row's last press before it, and when its "Refreshing" result began. */
type PrFixCheck = { rowId: string; before: LastAction | undefined; pendingAt: number; pressId: string }

/** The row's last press as it was before the check, while the row still holds the check's result. */
function withoutCheck<S extends Session>(s: S, check: PrFixCheck | null): S {
  const result = check ? s.lastActions[check.rowId]?.result : undefined
  if (!check || result?.at !== check.pendingAt || result.pressId !== check.pressId) return s
  const { [check.rowId]: _check, ...rest } = s.lastActions

  return { ...s, lastActions: check.before ? { ...rest, [check.rowId]: check.before } : rest }
}

/**
 * Reads the PR from GitHub before a read-first press applies, while the row reads "Refreshing PR #12…". `stale` when the saved
 * view already shows no problem. `unread` when the refresh did not read the PR, which the row's result then says.
 * Otherwise the check, for the press to apply on the refreshed view.
 */
async function checkPrFirst<S extends Session>(
  host: PressHost<S>,
  p: PrReadFirstPress | PrStaleReadPress,
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
    const pending = pendingResult([readFirstEffect(pr)], at, pressId)
    checking.check = { rowId, before, pendingAt: at, pressId }

    return {
      ...s,
      lastActions: {
        ...s.lastActions,
        [rowId]: localLast(before, { action: p.action, text: PR_READ_FIRST_LABELS[p.action] }, pending),
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
  commandId?: string,
): Promise<StartedPress> {
  const rowId = pressRowId(p)
  const isSecondPressOnHeld = !isPrPress(p) && p.action !== 'undo' && isHeldSend((await host.read()).lastActions[rowId])
  if (isSecondPressOnHeld && !isStale) await releaseHeldSendEarly(host, rowId)
  const localPressId = commandId ?? host.newId()
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
        const after = await host.read()
        const isGhMissing = after.prViews.isGhMissing === true || (await host.gh.find()) === null
        return refreshProblem({ ...after.prViews, isGhMissing }, after.ledger)
      }
      if (e.kind === 'rerun') {
        const why = await rerunRun(host, e)
        await host.refreshPrs()
        return why
      }
      const why = await host.perform(await host.read(), e)
      if (e.kind === 'copy' && why !== null) copy = { text: e.text, name: e.name }

      return why
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
  const isOut = async () =>
    isRepeatWhileOut(withHolds(await host.read(), holds), p, await host.now(), {
      settleWindowMs: host.settleWindowMs,
      holds,
    })
  const isReadFirst = async () => {
    if (!isPrPress(p)) return false
    if (isPrReadFirstPress(p)) return true
    if (!isPrStaleReadPress(p)) return false
    const saved = await host.read()

    return isViewBeforeReply(saved.lastActions[rowId], saved.prViews.views[p.ref]?.fetchedAt)
  }
  const check =
    isPrPress(p) &&
    (isPrReadFirstPress(p) || isPrStaleReadPress(p)) &&
    !isStale &&
    (await isReadFirst()) &&
    !(await isOut())
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
        wakesAfterSettle: false,
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
      const deliveryId = firstSend ? (commandId ? `${commandId}:send` : host.newId()) : undefined
      const pressLasts =
        firstSend && deliveryId
          ? withDeliveryId(r.lasts, Object.keys(r.lasts), at, firstSend.text, deliveryId)
          : r.lasts
      const undone = !isPrPress(p) && p.action === 'undo' ? cancelRemoteCommand(s, rowId) : s
      const next: S = {
        ...undone,
        ledger:
          commandId && p.action === 'done'
            ? {
                ...r.ledger,
                closed: r.ledger.closed.map(c => (c.id === rowId && c.at === at ? { ...c, commandId } : c)),
              }
            : r.ledger,
        lastActions: withLasts(
          s.lastActions,
          commandId
            ? Object.fromEntries(Object.entries(pressLasts).map(([id, last]) => [id, { ...last, commandId }]))
            : pressLasts,
          r.drop,
        ),
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
            commandIds: commandId ? [commandId] : [],
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
      finish: async () => ({ copy, error, note, isUnconfirmed, isRowFailed, wakesAfterSettle: false }),
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
      await runLocalEffects(effectHost, r.effects, Object.keys(r.lasts), r.lasts[rowId]?.result)

      const isDone = !isPrPress(p) && p.action === 'done'
      const isHeld = Object.values(r.lasts).some(isHeldSend)

      return { copy, error, note, isUnconfirmed, isRowFailed, wakesAfterSettle: isDone || isHeld }
    },
  }
}

/** Applies a press and runs it: `startPress`, then its `finish`. */
export async function press<S extends Session>(
  host: PressHost<S>,
  p: RowPress | PrPress,
  isStale: boolean,
  holds: Holds,
  commandId?: string,
): Promise<PressOutcome> {
  return (await startPress(host, p, isStale, holds, commandId)).finish()
}
