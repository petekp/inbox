import { fixCheckEffect, PR_FIX_LABELS, pressRowId, isPrPress, isPrFixPress } from './pr-press'
import type { PrFixPress, PrPress } from './pr-press'
import { doneWake, markSentToAgent, refuseDoneNotification, withDeliveryId, withUnconfirmed } from './press-reducer'
import type { Effect } from './press-reducer'
import { finishedResult, withResult, runSends, runLocalEffects } from './press-effects'
import type { EffectHost } from './press-effects'
import { recordPress, pendingResult, localLast, withLasts } from './pressed'
import type { RowPress } from './presses'
import { completedAttempt, withHolds, pressOn } from './session-presses'
import type { Pressed } from './session-presses'
import type { Holds } from './timing'
import type { Session, RowNote, LastAction } from '../types'
import type { SessionHost } from './session-host'

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
