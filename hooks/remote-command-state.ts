import { reopenOnFailure } from './press-reducer'
import type { Session } from '../types'

export function remoteCommandArrival<S extends Session>(s: S, deliveryId: string | null): S {
  if (!deliveryId) return s
  const matches = Object.entries(s.remoteCommands).filter(([, c]) => c.deliveryId === deliveryId)
  if (matches.length === 0) return s
  return {
    ...s,
    remoteCommands: {
      ...s.remoteCommands,
      ...Object.fromEntries(matches.map(([id, c]) => [id, { ...c, delivered: true, pendingDelivery: false }])),
    },
  }
}

export function remoteCommandState<S extends Session>(s: S): S {
  let commands = s.remoteCommands
  for (const [row, last] of Object.entries(s.lastActions)) {
    const id = last.commandId
    const command = id && commands[id]
    if (!id || !command || command.row !== row || command.state === 'expired' || command.state === 'refused') continue
    const delivery = last.delivery
    const deliveryId = delivery && 'id' in delivery ? (delivery.id ?? command.deliveryId) : command.deliveryId
    const delivered = command.delivered || delivery?.state === 'arrived'
    const pendingDelivery =
      !delivered &&
      (delivery?.state === 'held' ||
        delivery?.state === 'queued' ||
        delivery?.state === 'unconfirmed' ||
        (last.action === 'done' && !delivery))
    const error = delivery?.state === 'failed' ? delivery.reason.slice(0, 256) : command.error
    const state = delivery?.state === 'failed' ? 'failed' : command.state
    if (
      deliveryId === command.deliveryId &&
      delivered === command.delivered &&
      pendingDelivery === command.pendingDelivery &&
      error === command.error &&
      state === command.state
    )
      continue
    commands = { ...commands, [id]: { ...command, deliveryId, delivered, pendingDelivery, error, state } }
  }
  for (const closed of s.ledger.closed) {
    const id = closed.commandId
    const command = id && commands[id]
    if (!id || !command || command.state === 'cancelled' || command.state === 'expired' || command.state === 'refused')
      continue
    const deliveryId = closed.doneNotification?.id ?? command.deliveryId
    const pendingDelivery = !command.delivered && !closed.doneNotification?.error
    if (deliveryId !== command.deliveryId || pendingDelivery !== command.pendingDelivery)
      commands = { ...commands, [id]: { ...command, deliveryId, pendingDelivery } }
  }
  return commands === s.remoteCommands ? s : { ...s, remoteCommands: commands }
}

export async function confirmRemoteDelivery<S extends Session>(
  host: { readDurable?: () => Promise<S> },
  state: S,
  deliveryId: string,
): Promise<void> {
  const attempt = state.sent.find(send => send.deliveryId === deliveryId)
  const commandIds = attempt?.commandIds ?? []
  if (commandIds.length === 0) return
  if (!host.readDurable) throw new Error('This host cannot confirm saved delivery attempts.')
  const saved = await host.readDurable()
  const durable = saved.sent.find(send => send.deliveryId === deliveryId)
  const isSaved = attempt && durable && JSON.stringify(attempt) === JSON.stringify(durable)
  const commandsSaved = commandIds.every(id => saved.remoteCommands[id]?.deliveryId === deliveryId)
  if (!isSaved || !commandsSaved)
    throw new Error('The delivery attempt could not be confirmed saved. Nothing was sent.')
}

export function cancelRemoteCommand<S extends Session>(s: S, row: string): S {
  const id = s.ledger.closed.find(c => c.id === row && c.how === 'done')?.commandId ?? s.lastActions[row]?.commandId
  const command = id && s.remoteCommands[id]
  if (!id || !command || command.deliveryId || command.delivered) return s
  return {
    ...s,
    remoteCommands: { ...s.remoteCommands, [id]: { ...command, state: 'cancelled', pendingDelivery: false } },
  }
}

export function remoteReceipts(s: Session) {
  return Object.fromEntries(
    Object.entries(remoteCommandState(s).remoteCommands).map(([id, c]) => [
      id,
      {
        state: c.state,
        error:
          c.state === 'expired'
            ? 'This request is outside saved history. Delivery cannot be confirmed.'
            : c.state === 'refused'
              ? (c.error ?? 'The host did not accept this action. Your reply is kept.')
              : c.error
                ? c.state === 'stale'
                  ? 'This item changed before the action.'
                  : 'The host could not confirm this action.'
                : null,
        row: c.row,
        deliveryId: c.deliveryId,
        delivered: c.delivered,
        pendingDelivery: c.pendingDelivery ?? false,
      },
    ]),
  )
}

export function remoteDeliveryOutcome<S extends Session>(
  s: S,
  deliveryId: string,
  outcome: { state: string; reason?: string },
  arrived = false,
): S {
  const ids = s.sent.find(send => send.deliveryId === deliveryId)?.commandIds ?? []
  let commands = s.remoteCommands
  for (const id of ids) {
    const c = commands[id]
    if (!c) continue
    commands = {
      ...commands,
      [id]: {
        ...c,
        deliveryId,
        state: outcome.state === 'rejected' ? 'failed' : c.state,
        delivered: c.delivered || arrived,
        pendingDelivery: outcome.state !== 'rejected' && !c.delivered && !arrived,
        error: outcome.reason?.slice(0, 256) ?? c.error,
      },
    }
  }
  return commands === s.remoteCommands ? s : { ...s, remoteCommands: commands }
}

export function blockRemoteDeferred<S extends Session>(s: S, id: string, reason: string): S {
  const command = s.remoteCommands[id]
  if (!command) return s
  const last = s.lastActions[command.row]
  const held = last?.commandId === id && last.delivery?.state === 'held'
  const ledger = held && last.kind === 'mark' ? reopenOnFailure(s.ledger, command.row, last.at) : s.ledger
  return {
    ...s,
    lastActions: held
      ? { ...s.lastActions, [command.row]: { ...last, delivery: { state: 'failed', reason } } }
      : s.lastActions,
    ledger: {
      ...ledger,
      closed: ledger.closed.map(c =>
        c.commandId === id && !c.doneNotification
          ? { ...c, doneNotification: { id: `${id}:blocked`, error: reason } }
          : c,
      ),
    },
  }
}
