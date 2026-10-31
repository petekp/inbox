import type { Delivery, LastAction, Ledger, Press, RowNote } from '../types'
import type { HelpStep } from './help-steps'
import { reopenItem } from './ledger-close'
import { messages } from './press-messages'
import type { PressTexts } from './press-messages'
import { pressed } from './pressed'
import type { RowPress } from './presses'

export type Effect =
  | { kind: 'send'; text: string; by: Press | null }
  | { kind: 'open'; target: string; name: string }
  | { kind: 'copy'; text: string; name: string; isCommand: boolean }
  | { kind: 'refresh-prs'; name: string }

/**
 * `last` null leaves the row's last action as it was.
 * `stale` when the row the press was drawn for is gone or changed under it.
 */
export type PressResult =
  { ledger: Ledger; last: LastAction | null; effects: Effect[]; reopenedId?: string } | { stale: true }

export function doneWake(
  ledger: Ledger,
  ctx: { now: number; windowMs: number; isTurnRunning: boolean },
): { text: string; ids: string[] } | null {
  if (ctx.isTurnRunning) return null
  const waited = ledger.closed.filter(
    c =>
      c.how === 'done' &&
      c.outcome === 'done' &&
      !c.isSentToAgent &&
      !c.doneNotification &&
      c.item?.turn === ledger.turn,
  )
  if (waited.length === 0 || waited.some(c => ctx.now - c.at < ctx.windowMs)) return null

  return { text: messages.done(waited.map(c => c.ask)), ids: waited.map(c => c.id) }
}

export function markSentToAgent(ledger: Ledger, ids: string[], notificationId?: string): Ledger {
  return {
    ...ledger,
    closed: ledger.closed.map(c =>
      ids.includes(c.id)
        ? { ...c, isSentToAgent: true, ...(notificationId ? { doneNotification: { id: notificationId } } : {}) }
        : c,
    ),
  }
}

export function refuseDoneNotification(ledger: Ledger, notificationId: string, reason: string): Ledger {
  return {
    ...ledger,
    closed: ledger.closed.map(c => {
      if (c.how !== 'done' || c.doneNotification?.id !== notificationId) return c
      const { isSentToAgent: _sent, ...closed } = c
      return { ...closed, doneNotification: { id: notificationId, error: reason } }
    }),
  }
}

const STALE_TEXT = 'This changed before your press. Nothing was sent.'

export function noteText(): string {
  return STALE_TEXT
}

/**
 * Whether a press was saved and the message it sent, if any, is known to have reached the agent. A reply's draft is
 * deleted only then, so Reply brings back words whose send failed, went stale or could not be confirmed.
 */
export function isPressConfirmed(outcome: {
  error: string | null
  note: RowNote['note'] | null
  isUnconfirmed: boolean
}): boolean {
  return outcome.error === null && outcome.note === null && !outcome.isUnconfirmed
}

/**
 * Pure: it reads only its arguments.
 */
export function applyPress(
  ledger: Ledger,
  last: LastAction | undefined,
  p: RowPress,
  ctx: PressTexts & {
    now: number
    turnsStarted: number
    extraSteps: HelpStep[]
    localPressId?: string
  },
): PressResult {
  const r = pressed(ledger, last, p, ctx)

  return 'stale' in r || !r.last ? r : { ...r, last: withQueued(r.last, r.effects) }
}

export function withQueued(last: LastAction, effects: Effect[]): LastAction {
  const send = effects.find(e => e.kind === 'send')

  return send ? { ...last, delivery: { state: 'queued', message: send.text } } : last
}

export function withDeliveryId(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  id: string,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([row, action]) => [
      row,
      rows.includes(row) &&
      action.at === at &&
      action.delivery?.state === 'queued' &&
      action.delivery.id === undefined &&
      action.delivery.message === message
        ? { ...action, delivery: { ...action.delivery, id } }
        : action,
    ]),
  )
}

/** A known delivery id acknowledges its press; old id-less receipts match only old id-less actions by time. */
export function withArrival(
  lastActions: Record<string, LastAction>,
  message: string,
  pressedAt?: number,
  deliveryId?: string | null,
): Record<string, LastAction> {
  const isWaiting = (
    a: LastAction,
  ): a is LastAction & { delivery: Extract<Delivery, { state: 'queued' | 'unconfirmed' }> } =>
    (a.delivery?.state === 'queued' || a.delivery?.state === 'unconfirmed') && a.delivery.message === message
  const waiting = Object.values(lastActions).filter(
    a => isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === undefined),
  )
  if (waiting.length === 0) return lastActions
  const at = pressedAt ?? Math.min(...waiting.map(a => a.at))

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => [
      id,
      isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === undefined && a.at === at)
        ? { ...a, delivery: { state: 'arrived' as const } }
        : a,
    ]),
  )
}

export function withUnconfirmed(
  lastActions: Record<string, LastAction>,
  message: string,
  pressedAt?: number,
  deliveryId?: string | null,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, action]) => [
      id,
      action.delivery?.state === 'queued' &&
      action.delivery.message === message &&
      (deliveryId
        ? action.delivery.id === deliveryId
        : pressedAt === undefined || (action.delivery.id === undefined && action.at === pressedAt))
        ? { ...action, delivery: { ...action.delivery, state: 'unconfirmed' as const } }
        : action,
    ]),
  )
}

export function withAcceptedSend(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  deliveryId: string,
): Record<string, LastAction> {
  return withQueuedDelivery(
    lastActions,
    rows,
    at,
    text => text === message,
    { state: 'queued', message, id: deliveryId },
    deliveryId,
  )
}

function withQueuedDelivery(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  matches: (message: string) => boolean,
  delivery: Delivery,
  deliveryId?: string,
): Record<string, LastAction> {
  const changed = rows.flatMap(id => {
    const a = lastActions[id]
    return a?.at === at &&
      (a.delivery?.state === 'queued' || a.delivery?.state === 'unconfirmed') &&
      (deliveryId ? a.delivery.id === deliveryId : a.delivery.id === undefined) &&
      matches(a.delivery.message)
      ? [[id, { ...a, delivery }] as const]
      : []
  })

  return changed.length === 0 ? lastActions : { ...lastActions, ...Object.fromEntries(changed) }
}

export function withFailure(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  reason: string,
  deliveryId?: string,
): Record<string, LastAction> {
  return withQueuedDelivery(
    lastActions,
    rows,
    at,
    () => true,
    { state: 'failed', reason, ...(deliveryId ? { id: deliveryId } : {}) },
    deliveryId,
  )
}

export function withRewrite(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  entered: string,
  deliveryId?: string,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, action]) => [
      id,
      rows.includes(id) &&
      action.at === at &&
      (action.delivery?.state === 'queued' || action.delivery?.state === 'unconfirmed') &&
      (deliveryId ? action.delivery.id === deliveryId : action.delivery.id === undefined) &&
      action.delivery.message === message
        ? { ...action, delivery: { ...action.delivery, message: entered } }
        : action,
    ]),
  )
}

export function reopenOnFailure(ledger: Ledger, id: string, at: number): Ledger {
  if (ledger.items.some(i => i.id === id)) return ledger
  const closed = ledger.closed.findLast(c => c.id === id)

  return closed?.item && closed.how === 'answered' && closed.at === at ? reopenItem(ledger, id) : ledger
}
