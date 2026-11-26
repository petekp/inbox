import { REMOTE_PR_ACTIONS, isRemotePrPress } from './remote-press'
import { isPrPress, pressRowId } from '../view/pr-press'
import type { PrPress } from '../view/pr-press'
import { isPrRowId } from '../domain/presses'
import {
  blockRemoteDeferred,
  confirmRemoteDelivery,
  recoverStrandedCommands,
  remoteCommandState,
  withLegacy,
  withoutLegacy,
  withRecord,
} from '../runtime/remote-command-state'
import type { CommandLog, CommandStore } from '../runtime/remote-command-state'
import type { RemoteCommandRecord, Session } from '../../types'
import type { RowPress } from '../domain/presses'
import type { PressHost, PressOutcome } from '../runtime/host-press'
import { startPress } from '../runtime/host-press'
import { pressOn } from '../runtime/session-presses'
import { NO_HOLDS } from '../view/timing'
import { PRESS_LIFETIME_MS } from '../domain/preconditions'

export type RemoteCommand = {
  format: 2
  kind: 'command'
  id: string
  session: string
  issuedAt: number
  expected: string
  press: RowPress | PrPress
}

const LIFETIME_MS = PRESS_LIFETIME_MS
const MAX_COMMANDS = 128
const MAX_COMMAND_BYTES = 128_000
const OUTCOME_RESERVE_BYTES = 4096

export function remoteRowVersion(s: Session, id: string): string {
  if (id === 'session')
    return JSON.stringify([s.stop, s.presence.turnsStarted, s.presence.isTurnRunning, s.lastActions.session ?? null])
  if (isPrRowId(id))
    return JSON.stringify([
      s.prViews,
      s.ledger.prs,
      s.ledger.prOrder,
      Object.fromEntries(Object.entries(s.lastActions).filter(([key]) => isPrRowId(key))),
    ])
  if (id === 'goal') {
    const overview = s.ledger.overview
    return JSON.stringify([
      overview?.goal ?? null,
      overview?.goalRemoved ?? null,
      overview?.suggestedGoal ?? null,
      s.lastActions[id] ?? null,
    ])
  }
  const item = s.ledger.items.find(row => row.id === id)
  const normalized = item && Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'dialog'))
  return JSON.stringify([
    normalized ?? null,
    s.ledger.findings.find(row => row.id === id) ?? null,
    s.ledger.closed.find(row => row.id === id) ?? null,
    s.ledger.closedFindings.find(row => row.id === id) ?? null,
    s.lastActions[id] ?? null,
  ])
}

async function digestText(text: string): Promise<string> {
  const subtle = crypto.subtle
  if (!('digest' in subtle) || typeof subtle.digest !== 'function')
    throw new Error('This host cannot hash remote commands.')
  const bytes: unknown = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  if (!(bytes instanceof ArrayBuffer)) throw new Error('The host returned an invalid command hash.')
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function remoteRowDigest(s: Session, id: string): Promise<string> {
  const row = JSON.parse(remoteRowVersion(s, id))
  const canonical = JSON.stringify(row, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, value[key]]),
        )
      : value,
  )
  return `row-sha256-v1:${await digestText(canonical)}`
}

async function matchesRow(s: Session, command: RemoteCommand): Promise<boolean> {
  return (
    command.expected === remoteRowVersion(s, pressRowId(command.press)) ||
    command.expected === (await remoteRowDigest(s, pressRowId(command.press)))
  )
}

/**
 * Throws unless the saved session holds the write a command's press numbered `seq`, or a later one, and its floor
 * reaches the command's time. A later saved write was made on top of this one, so it holds this one too.
 */
async function requireDurableWrite<S extends Session>(
  host: Pick<PressHost<S>, 'readDurable'>,
  seq: number,
  issuedAt: number,
): Promise<void> {
  if (!host.readDurable) throw new Error('This host cannot confirm saved commands.')
  const durable = await host.readDurable()
  if ((durable.commandWrite?.seq ?? 0) < seq || (durable.remoteCommandFloor ?? 0) < issuedAt)
    throw new Error('The command could not be confirmed saved. Nothing was sent.')
}

const rejected = (error: string): PressOutcome => ({
  copy: null,
  error,
  note: null,
  isUnconfirmed: true,
  isRowFailed: false,
  wakesAfterSettle: false,
})

export const LEGACY_REMOTE_ACTIONS: readonly RowPress['action'][] = [
  'type',
  'answer',
  'done',
  'address',
  'undo',
  'dismiss',
  'discuss',
  'explain',
  'issue',
  'discard',
]
export const REMOTE_ACTIONS: readonly (RowPress | PrPress)['action'][] = [
  ...LEGACY_REMOTE_ACTIONS,
  ...REMOTE_PR_ACTIONS,
  'compare',
  'step',
  'remove-goal',
  'restore-goal',
  'take-goal',
  'resume',
]

function supportsRemotePress(p: RowPress | PrPress, host: Pick<PressHost<Session>, 'supportsResume'>): boolean {
  if (p.action === 'resume') return host.supportsResume === true
  return isPrPress(p) ? isRemotePrPress(p) : REMOTE_ACTIONS.includes(p.action)
}

function isAgentStep<S extends Session>(s: S, p: RowPress | PrPress, now: number, host: PressHost<S>): boolean {
  if (p.action !== 'step') return true
  const planned = pressOn(s, p, now, { settleWindowMs: host.settleWindowMs, holds: NO_HOLDS }, host)
  return !('stale' in planned) && planned.effects.length > 0 && planned.effects.every(effect => effect.kind === 'send')
}

function isUnresolved(c: RemoteCommandRecord): boolean {
  return (
    c.state === 'accepted' ||
    c.state === 'attempting' ||
    (c.state === 'uncertain' && !c.delivered) ||
    (c.state === 'applied' && !c.delivered && (c.pendingDelivery === true || c.deliveryId !== null))
  )
}

function issuedAt(id: string, c: RemoteCommandRecord): number {
  const at = c.issuedAt ?? Number.parseInt(id.split('-')[0]!, 36)
  if (!Number.isSafeInteger(at) || at < 0) throw new Error('The saved command time is invalid.')
  return at
}

function fits(commands: Record<string, RemoteCommandRecord>): boolean {
  const count = Object.keys(commands).length
  return (
    count <= MAX_COMMANDS &&
    new TextEncoder().encode(JSON.stringify(commands)).byteLength + count * OUTCOME_RESERVE_BYTES <= MAX_COMMAND_BYTES
  )
}

/** A command started: done with its outcome, or saved with a message the host holds until the agent's turn ends. */
export type StartedCommand = { is: 'done'; outcome: PressOutcome } | { is: 'waiting'; finish(): Promise<PressOutcome> }

const done = (outcome: PressOutcome): StartedCommand => ({ is: 'done', outcome })

/**
 * Writes a command's final state to the log once its press has an outcome. An error or an unconfirmed message first
 * saves its row's held message or Done as Not sent, so nothing sends it later.
 */
async function settled<S extends Session>(
  host: PressHost<S>,
  store: CommandStore,
  command: RemoteCommand,
  outcome: PressOutcome,
): Promise<PressOutcome> {
  if (outcome.error || outcome.isUnconfirmed)
    await host
      .update(s =>
        blockRemoteDeferred(s, command.id, pressRowId(command.press), 'This action could not be confirmed saved.'),
      )
      .catch(() => undefined)
  const s = await host.read()
  await store.update(log => {
    const c = log.commands[command.id]
    if (!c) return log
    const state = outcome.isUnconfirmed
      ? 'uncertain'
      : outcome.error
        ? 'failed'
        : outcome.note === 'stale'
          ? 'stale'
          : 'applied'
    return remoteCommandState(
      withRecord(log, command.id, { ...c, state, error: outcome.error?.slice(0, 256) ?? null, runner: null }),
      s,
    )
  })
  return outcome
}

/**
 * Starts a command a remote viewer sent. The command log admits it in one change, which refuses an id it has with
 * another action, a command outside its history and a row that changed. A command it has already admitted returns
 * the outcome it kept. An admitted command is marked `attempting` with this process as its runner, and its press runs
 * with each session write stamped and read back, so nothing is sent unless the write was saved. A press whose message
 * the host holds until the agent's turn ends returns `waiting`, so the press files after it do not wait for that turn.
 */
export async function startRemoteCommand<S extends Session>(
  host: PressHost<S>,
  command: RemoteCommand,
  sessionId: string,
): Promise<StartedCommand> {
  if (
    !Number.isSafeInteger(command.issuedAt) ||
    command.issuedAt < 0 ||
    !/^[a-z0-9]{1,12}-[a-zA-Z0-9_-]{16,100}$/.test(command.id)
  )
    return done(rejected('The command identity or time is invalid.'))
  const store = host.commands
  if (!host.readDurable || !store || command.session !== sessionId)
    return done(rejected('This command belongs to another session or cannot be saved.'))
  await recoverStrandedCommands(host)
  const now = await host.now()
  const time = Number.parseInt(command.id.split('-')[0]!, 36)
  const validTime =
    time === command.issuedAt && command.issuedAt <= now + 30_000 && now - command.issuedAt < LIFETIME_MS
  const rawPayload = JSON.stringify([command.session, command.issuedAt, command.expected, command.press])
  const fields = Object.fromEntries(Object.entries(command.press).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  const canonical = JSON.stringify([command.session, command.issuedAt, command.expected, fields])
  const payload = `sha256-v1:${await digestText(canonical)}`
  let admitted = false
  let conflict: string | null = null
  const s = await host.read()
  const claimed = await store.update(async saved => {
    admitted = false
    conflict = null
    const log = remoteCommandState(withLegacy(saved, s), s)
    const existing = log.commands[command.id]
    if (existing) {
      const same = existing.payload === payload || existing.payload === rawPayload
      if (!same) conflict = 'This command identity already names a different action.'
      if (same && existing.state === 'accepted' && !validTime)
        return withRecord(log, command.id, {
          ...existing,
          state: 'expired',
          error: 'This request expired before execution.',
        })
      admitted = same && existing.state === 'accepted'
      return log
    }
    let floor = log.floor
    if (!Number.isSafeInteger(floor) || floor < 0) throw new Error('The saved command cutoff is invalid.')
    const kept = { ...log.commands }
    const drop = (id: string) => {
      const record = kept[id]!
      const at = issuedAt(id, record)
      const retiredAt = record.timeWasValid === false ? Math.min(Math.floor(record.acceptedAt), at) : at
      floor = Math.max(floor, retiredAt)
      delete kept[id]
    }
    for (const [id, c] of Object.entries(kept)) {
      const isRefusal = c.state === 'refused' || c.state === 'expired'
      if (isRefusal || (!isUnresolved(c) && now - c.acceptedAt >= LIFETIME_MS)) drop(id)
    }
    const expired = !validTime || command.issuedAt <= floor
    const supported = supportsRemotePress(command.press, host) && isAgentStep(s, command.press, now, host)
    const stale = !expired && supported && !(await matchesRow(s, command))
    const record: RemoteCommandRecord = {
      payload,
      timeWasValid: validTime,
      issuedAt: command.issuedAt,
      acceptedAt: now,
      state: expired ? 'expired' : !supported ? 'refused' : stale ? 'stale' : 'accepted',
      error: expired
        ? 'This request is outside retained history. Delivery cannot be confirmed.'
        : !supported
          ? 'This remote action is not supported.'
          : stale
            ? 'This item changed before the action.'
            : null,
      row: pressRowId(command.press),
      deliveryId: null,
      delivered: false,
    }
    const evictable = Object.entries(kept)
      .filter(([, c]) => !isUnresolved(c))
      .sort((a, b) => issuedAt(a[0], a[1]) - issuedAt(b[0], b[1]))
    while (!fits({ ...kept, [command.id]: record }) && evictable.length) drop(evictable.shift()![0])
    if (command.issuedAt <= floor) {
      record.state = 'expired'
      record.error = 'This request is outside retained history. Delivery cannot be confirmed.'
    } else if (!fits({ ...kept, [command.id]: record }) && record.state !== 'expired') {
      record.state = 'refused'
      record.error = 'Too many actions are awaiting confirmation. Your reply is kept.'
    }
    if (record.state === 'refused' || record.state === 'expired') {
      if (new TextEncoder().encode(JSON.stringify(record)).byteLength > OUTCOME_RESERVE_BYTES)
        throw new Error('The refusal cannot fit the reserved receipt slot.')
    }
    admitted = record.state === 'accepted'
    return { ...log, floor, commands: { ...kept, [command.id]: record } }
  })
  if (conflict) return done(rejected(conflict))
  const record = (claimed as CommandLog).commands[command.id]
  if (!record) return done(rejected('The command was not accepted.'))
  if (!admitted)
    return done({
      ...rejected(record.error ?? 'This command was already accepted; its outcome is retained.'),
      note: record.state === 'stale' ? 'stale' : null,
    })
  let executing = false
  await store.update(log => {
    const c = log.commands[command.id]
    executing = c?.state === 'accepted'
    return c && executing ? withRecord(log, command.id, { ...c, state: 'attempting', runner: store.runner }) : log
  })
  if (!executing) return done(rejected('This command is already running or has an uncertain outcome.'))
  let isStarted = false
  const stamped: PressHost<S> = {
    ...host,
    update: async change => {
      let seq = 0
      const changed = await host.update(async s => {
        if (!isStarted && !(await matchesRow(s, command))) throw new Error('This item changed before the action.')
        const next = withoutLegacy(await change(s))
        seq = (s.commandWrite?.seq ?? 0) + 1
        return {
          ...next,
          heldRows: s.heldRows,
          shownSince: s.shownSince,
          commandWrite: { id: command.id, seq },
          remoteCommandFloor: Math.max(next.remoteCommandFloor ?? 0, command.issuedAt),
        }
      })
      await requireDurableWrite(host, seq, command.issuedAt)
      for (const send of changed.sent)
        if (send.phase === 'attempting' && send.deliveryId && send.commandIds?.includes(command.id))
          await confirmRemoteDelivery({ readDurable: host.readDurable, commands: store }, changed, send.deliveryId)
      isStarted = true
      return changed
    },
  }
  const failed = (error: unknown) => rejected(error instanceof Error ? error.message : 'Command outcome is uncertain.')
  const expires = { kind: 'expires-at' as const, at: command.issuedAt + LIFETIME_MS }
  const holds = { ...NO_HOLDS, shownSince: now }
  const started = await startPress(stamped, command.press, false, holds, command.id, [expires]).catch(
    (error: unknown) => failed(error),
  )
  if (!('finish' in started)) return done(await settled(host, store, command, started))
  const finish = async () => settled(host, store, command, await started.finish().catch(failed))
  const isHeldUntilRun =
    host.isDeliveryHeldUntilRun === true && (started.effects?.some(e => e.kind === 'send') ?? false)

  return isHeldUntilRun ? { is: 'waiting', finish } : done(await finish())
}
