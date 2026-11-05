import type { Session } from '../types'
import { reopenOnFailure, withFailure, withUnconfirmed } from './press-reducer'
import { completedAttempt } from './session-presses'
import type { SendOutcome } from './session-presses'
import type { SessionHost } from './session-host'

export type ReleaseHost<S extends Session> = Pick<
  SessionHost<S>,
  'now' | 'read' | 'update' | 'deliver' | 'prepare' | 'newId' | 'isDeliveryHeldUntilRun'
>

/** The rows whose held message is due: Undo can no longer take its press back. */
function dueRows(s: Session, now: number): string[] {
  return Object.entries(s.lastActions)
    .filter(([, a]) => a.delivery?.state === 'held' && a.delivery.until <= now)
    .map(([id]) => id)
}

/**
 * Sends each answer and Fix whose Undo window has passed, as its press would have sent it. Undo drops a held press
 * before this runs, so it sends nothing. A refused answer reopens its question, as a refused press does.
 */
export async function releaseHeldSends<S extends Session>(host: ReleaseHost<S>, current?: S): Promise<void> {
  const due = dueRows(current ?? (await host.read()), await host.now())
  for (const id of due) await releaseOne(host, id)
}

/** Marks a held row Not sent with `reason`, and reopens an answer it closed, as a refused send does. */
function refusedHeld<S extends Session>(s: S, id: string, reason: string): S {
  const last = s.lastActions[id]
  if (last?.delivery?.state !== 'held') return s

  return {
    ...s,
    lastActions: { ...s.lastActions, [id]: { ...last, delivery: { state: 'failed', reason } } },
    ledger: last.kind === 'mark' ? reopenOnFailure(s.ledger, id, last.at) : s.ledger,
  }
}

async function releaseOne<S extends Session>(host: ReleaseHost<S>, id: string): Promise<void> {
  let attempt: { deliveryId: string; text: string; at: number } | null = null
  const started = host.update(async s => {
    // A host may run the change again on a newer session, where Undo or another release already took the row.
    attempt = null
    const last = s.lastActions[id]
    const held = last?.delivery
    const now = await host.now()
    if (!last || held?.state !== 'held' || held.until > now) return s
    await host.prepare?.(s)
    const deliveryId = host.newId()
    attempt = { deliveryId, text: held.message, at: last.at }
    const state = host.isDeliveryHeldUntilRun ? ('queued' as const) : ('unconfirmed' as const)

    return {
      ...s,
      lastActions: { ...s.lastActions, [id]: { ...last, delivery: { state, message: held.message, id: deliveryId } } },
      sent: [
        ...s.sent,
        {
          text: held.message,
          press: held.by,
          at: now,
          row: id,
          queuedId: null,
          pressedAt: last.at,
          deliveryId,
          phase: 'attempting' as const,
        },
      ],
    }
  })
  // A host that cannot prepare the send, as a Codex with no CLI to run, refuses it before anything leaves.
  const why = await started.then(
    () => null,
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  )
  if (why !== null) {
    await host.update(s => refusedHeld(s, id, why))
    return
  }
  const sending = attempt as { deliveryId: string; text: string; at: number } | null
  if (!sending) return
  const outcome: SendOutcome = await host
    .deliver(await host.read(), sending.text, sending.deliveryId)
    .catch((err: unknown) => ({ state: 'unconfirmed', reason: err instanceof Error ? err.message : String(err) }))
  await host.update(s => {
    const after = completedAttempt(s, sending.deliveryId, outcome)
    if (outcome.state === 'unconfirmed')
      return { ...after, lastActions: withUnconfirmed(after.lastActions, sending.text, sending.at, sending.deliveryId) }
    if (outcome.state !== 'rejected') return after
    const lastActions = withFailure(after.lastActions, [id], sending.at, outcome.reason, sending.deliveryId)
    const last = lastActions[id]
    const isRowFailed = last?.delivery?.state === 'failed' && last.delivery.id === sending.deliveryId

    return {
      ...after,
      lastActions,
      ledger: isRowFailed && last.kind === 'mark' ? reopenOnFailure(after.ledger, id, sending.at) : after.ledger,
    }
  })
}
