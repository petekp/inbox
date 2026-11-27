import { isDoneNoticeDue, refuseDoneNotification, reopenOnFailure } from '../view/press-reducer'
import type { Delivery, RemoteCommandRecord, Session } from '../../types'

/**
 * A session's command log: each remote command a host admitted, by id, and `floor`, the latest command time outside
 * its retained history. `writtenAt` is when it last changed, so a publish of a log change is newer than the last.
 */
export type CommandLog = { version: 1; writtenAt: number; floor: number; commands: Record<string, RemoteCommandRecord> }

/** The process that runs a command, as the command's record names it. */
export type CommandRunner = NonNullable<RemoteCommandRecord['runner']>

/** Where a session's command log is kept. */
export type CommandStore = {
  read(): Promise<CommandLog>
  /**
   * Changes the log while no other change to it runs, and resolves once the change is saved and read back. A change that
   * returns the log it was given writes nothing.
   */
  update(change: (log: CommandLog) => CommandLog | Promise<CommandLog>): Promise<CommandLog>
  /** This process, as a command it runs records it. */
  runner: CommandRunner
  /** Whether the process a record names still runs. */
  isRunning(runner: CommandRunner): Promise<boolean>
}

export const EMPTY_LOG: CommandLog = { version: 1, writtenAt: 0, floor: 0, commands: {} }

/**
 * The log with the records an earlier build saved in `s`. A record the log has wins, unless it was only accepted.
 * The session's floor counts beside such records, and for a log never written, since a log that went missing may have
 * held any command up to it.
 */
export function withLegacy(log: CommandLog, s: Session): CommandLog {
  const legacy = s.remoteCommands ?? {}
  const isSessionFloorKept = s.remoteCommands !== undefined || log.writtenAt === 0
  const floor = isSessionFloorKept ? Math.max(log.floor, s.remoteCommandFloor ?? 0) : log.floor
  const further = Object.entries(legacy).filter(([id, c]) => {
    const kept = log.commands[id]
    return !kept || (kept.state === 'accepted' && c.state !== 'accepted')
  })
  if (further.length === 0 && floor === log.floor) return log

  return { ...log, floor, commands: { ...log.commands, ...Object.fromEntries(further) } }
}

/** `s` without the command records an earlier build saved in it. */
export function withoutLegacy<S extends Session>(s: S): S {
  if (!s.remoteCommands) return s
  const { remoteCommands: _moved, ...rest } = s

  return rest as S
}

export const withRecord = (log: CommandLog, id: string, record: RemoteCommandRecord): CommandLog => ({
  ...log,
  commands: { ...log.commands, [id]: record },
})

/**
 * Whether a row closed with Done waits on the message that tells the agent: one was sent and has not failed, or the
 * host will send one, which it does only for the current turn's tasks (`isDoneNoticeDue`).
 */
function awaitsDoneNotice(c: Session['ledger']['closed'][number], s: Session): boolean {
  return c.doneNotification ? !c.doneNotification.error : isDoneNoticeDue(c, s.ledger.turn)
}

const isDoneAwaited = (s: Session, row: string) => s.ledger.closed.some(c => c.id === row && awaitsDoneNotice(c, s))

/**
 * The log brought up to date with what `s` says about its commands: the delivery of each command's row and the Done
 * message of each row a command closed. The session is saved before the log, so the log can be behind it, never ahead.
 */
export function remoteCommandState(log: CommandLog, s: Session): CommandLog {
  let commands = log.commands
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
        (last.action === 'done' && !delivery && isDoneAwaited(s, row)))
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
    const pendingDelivery = !command.delivered && awaitsDoneNotice(closed, s)
    if (deliveryId !== command.deliveryId || pendingDelivery !== command.pendingDelivery)
      commands = { ...commands, [id]: { ...command, deliveryId, pendingDelivery } }
  }
  return commands === log.commands ? log : { ...log, commands }
}

/** The session's commands as `s` and its log say together: the log with any records `s` still holds, brought up to date. */
export async function commandsOf(store: CommandStore | undefined, s: Session): Promise<CommandLog> {
  return remoteCommandState(withLegacy(store ? await store.read() : EMPTY_LOG, s), s)
}

/** The ids of the commands whose press ran, which a held message or a Done message of theirs waits for. */
export async function appliedCommands(store: CommandStore | undefined, s: Session): Promise<ReadonlySet<string>> {
  const { commands } = await commandsOf(store, s)

  return new Set(Object.entries(commands).flatMap(([id, c]) => (c.state === 'applied' ? [id] : [])))
}

/** Whether `s` names a command on any row, so the log may need to follow a write of it. */
export function hasCommandRows(s: Session): boolean {
  return (
    Object.values(s.lastActions).some(last => last.commandId !== undefined) ||
    s.ledger.closed.some(c => c.commandId !== undefined)
  )
}

/**
 * The rows a command's press holds in place until its message has a delivery: a row whose press holds or queues a
 * message not yet given an id, and a row a command closed with Done that the agent has not been told about.
 */
export function pendingCommandRows(s: Session): string[] {
  const rows = Object.entries(s.lastActions).flatMap(([row, last]) => {
    const delivery = last.delivery
    const isWaiting =
      delivery?.state === 'held' ||
      ((delivery?.state === 'queued' || delivery?.state === 'unconfirmed') && delivery.id === undefined) ||
      (last.action === 'done' && !delivery && isDoneAwaited(s, row))
    return last.commandId && isWaiting ? [row] : []
  })
  const closed = s.ledger.closed.flatMap(c => (c.commandId && isDoneNoticeDue(c, s.ledger.turn) ? [c.id] : []))

  return [...rows, ...closed]
}

/**
 * Throws unless the delivery attempt `deliveryId` names is saved in the session, and the log gives each of its
 * commands that delivery id, so a crash after the send cannot leave a command that reads as never sent.
 */
export async function confirmRemoteDelivery<S extends Session>(
  host: { readDurable?: () => Promise<S>; commands?: CommandStore },
  state: S,
  deliveryId: string,
): Promise<void> {
  const attempt = state.sent.find(send => send.deliveryId === deliveryId)
  const commandIds = attempt?.commandIds ?? []
  if (commandIds.length === 0) return
  if (!host.readDurable || !host.commands) throw new Error('This host cannot confirm saved delivery attempts.')
  const saved = await host.readDurable()
  const durable = saved.sent.find(send => send.deliveryId === deliveryId)
  const isSaved = attempt && durable && JSON.stringify(attempt) === JSON.stringify(durable)
  if (!isSaved) throw new Error('The delivery attempt could not be confirmed saved. Nothing was sent.')
  const log = await host.commands.update(log => remoteCommandState(withLegacy(log, saved), saved))
  if (!commandIds.every(id => log.commands[id]?.deliveryId === deliveryId))
    throw new Error('The delivery attempt could not be confirmed saved. Nothing was sent.')
}

/** The command whose press an Undo of `row` takes back, or undefined. */
export function undoneCommand(s: Session, row: string): string | undefined {
  return s.ledger.closed.find(c => c.id === row && c.how === 'done')?.commandId ?? s.lastActions[row]?.commandId
}

/** The log with command `id` cancelled, unless its message already has a delivery. */
export function cancelledCommand(log: CommandLog, id: string): CommandLog {
  const command = log.commands[id]
  if (!command || command.deliveryId || command.delivered) return log

  return withRecord(log, id, { ...command, state: 'cancelled', pendingDelivery: false })
}

/** The commands a delivery attempt carried, and whether its message arrived. */
export type CarriedCommands = { ids: readonly string[]; arrived: boolean }

/**
 * Gives the commands a delivery attempt carried its outcome in the log: the delivery id, a refusal as `failed`, and
 * whether the message arrived. The session drops the attempt in the same write, so the caller reads `carried` first.
 */
export async function saveDeliveryOutcome(
  store: CommandStore | undefined,
  carried: CarriedCommands,
  deliveryId: string,
  outcome: { state: string; reason?: string },
): Promise<void> {
  if (!store || carried.ids.length === 0) return
  await store
    .update(log =>
      carried.ids.reduce((next, id) => {
        const c = next.commands[id]
        if (!c) return next
        const delivered = c.delivered || carried.arrived
        return withRecord(next, id, {
          ...c,
          deliveryId,
          state: outcome.state === 'rejected' ? 'failed' : c.state,
          delivered,
          pendingDelivery: outcome.state !== 'rejected' && !delivered,
          error: outcome.reason?.slice(0, 256) ?? c.error,
        })
      }, log),
    )
    .catch(() => undefined)
}

/**
 * Marks delivered each command whose message went out as `deliveryId`, once the agent got that message. The row the
 * command pressed may name another press by then, so the log is told directly.
 */
export async function markArrived(
  store: CommandStore | undefined,
  deliveryId: string | null | undefined,
): Promise<void> {
  if (!store || !deliveryId) return
  await store
    .update(log =>
      Object.entries(log.commands).reduce(
        (next, [id, c]) =>
          c.deliveryId === deliveryId && !c.delivered
            ? withRecord(next, id, { ...c, delivered: true, pendingDelivery: false })
            : next,
        log,
      ),
    )
    .catch(() => undefined)
}

/** What a publish tells a remote viewer about each command in `log`. */
export function remoteReceipts(log: CommandLog) {
  return Object.fromEntries(
    Object.entries(log.commands).map(([id, c]) => [
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

/**
 * The message on a row that no running send will deliver: one never given an id, or one whose attempt never returned.
 * A message whose attempt is gone may have been sent, so it is left as it is.
 */
function unsentMessage(s: Session, delivery: Delivery | undefined): { id: string | null } | null {
  if (delivery?.state !== 'queued' && delivery?.state !== 'unconfirmed') return null
  const id = delivery.id
  if (!id) return { id: null }

  return s.sent.find(x => x.deliveryId === id)?.phase === 'attempting' ? { id } : null
}

/**
 * Marks Not sent with `reason` what command `id` left to send for `row`: its held message, its own message that no
 * running send will deliver, and the Done it closed the row with. Only call it when nothing still sends for the
 * command. Returns `s` itself when there is nothing to mark.
 */
export function blockRemoteDeferred<S extends Session>(s: S, id: string, row: string, reason: string): S {
  const last = s.lastActions[row]
  const delivery = last?.commandId === id ? last.delivery : undefined
  const unsent = unsentMessage(s, delivery)
  const isRowBlocked = delivery?.state === 'held' || unsent !== null
  const unsentDone = unsent?.id ?? null
  const isDoneBlocked = (c: Session['ledger']['closed'][number]) =>
    c.commandId === id &&
    (!c.doneNotification ||
      (c.how === 'done' && c.doneNotification.id === unsentDone && c.doneNotification.error === undefined))
  if (!isRowBlocked && !s.ledger.closed.some(isDoneBlocked)) return s
  const reopened = isRowBlocked && last?.kind === 'mark' ? reopenOnFailure(s.ledger, row, last.at) : s.ledger
  const ledger = unsentDone ? refuseDoneNotification(reopened, unsentDone, reason) : reopened

  return {
    ...s,
    lastActions:
      isRowBlocked && last
        ? { ...s.lastActions, [row]: { ...last, delivery: { state: 'failed', reason } } }
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

/** Each command a row of `s` names, with the row. */
function commandRows(s: Session): [string, string][] {
  return [
    ...Object.entries(s.lastActions).flatMap(([row, a]): [string, string][] =>
      a.commandId ? [[a.commandId, row]] : [],
    ),
    ...s.ledger.closed.flatMap((c): [string, string][] => (c.commandId ? [[c.commandId, c.id]] : [])),
  ]
}

/**
 * Marks each command left `attempting` by a process that no longer runs `uncertain`, after saving what it left to
 * send as Not sent. Does the same for a row whose command the log has no record of, as after an unreadable log was
 * moved aside. Without this, such a command's message would wait forever.
 */
export async function recoverStrandedCommands<S extends Session>(host: {
  commands?: CommandStore
  read(): Promise<S>
  update(change: (s: S) => S | Promise<S>): Promise<S>
}): Promise<void> {
  const store = host.commands
  if (!store) return
  const reason = 'This action was interrupted, so it may not have run.'
  const s = await host.read()
  const log = await store.read()
  const stranded: [string, RemoteCommandRecord][] = []
  for (const [id, c] of Object.entries(log.commands))
    if (c.state === 'attempting' && c.runner && !(await store.isRunning(c.runner))) stranded.push([id, c])
  const known = withLegacy(log, s).commands
  const unknown = commandRows(s).filter(([id, row]) => !(id in known) && blockRemoteDeferred(s, id, row, reason) !== s)
  if (stranded.length === 0 && unknown.length === 0) return
  const blocked: [string, string][] = [...stranded.map(([id, c]): [string, string] => [id, c.row]), ...unknown]
  await host.update(x => blocked.reduce((y, [id, row]) => blockRemoteDeferred(y, id, row, reason), x))
  if (stranded.length === 0) return
  await store.update(current =>
    stranded.reduce((next, [id]) => {
      const c = next.commands[id]
      return c?.state === 'attempting'
        ? withRecord(next, id, { ...c, state: 'uncertain', error: reason, runner: null })
        : next
    }, current),
  )
}
