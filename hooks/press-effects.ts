import type { LastAction, Ledger, LocalResult, Turns } from '../types'
import { isAwaitingReply } from './last-actions'
import { pruneClosed } from './ledger-close'
import { reopenOnFailure, withFailure, withUnconfirmed } from './press-reducer'
import type { Effect } from './press-reducer'
import { withLasts } from './pressed'
import type { Pressed } from './session-presses'

export function finishedResult(pending: LocalResult, errors: (string | null)[], at: number): LocalResult {
  const parts = pending.parts.map((part, n) => ({ ...part, error: errors[n] ?? null }))

  return {
    state: parts.some(part => part.error !== null) ? 'failed' : 'done',
    parts,
    at,
    ...(pending.pressId ? { pressId: pending.pressId } : {}),
    ...(pending.action ? { action: pending.action } : {}),
  }
}

export function withResult(
  lastActions: Record<string, LastAction>,
  rowId: string,
  pendingAt: number,
  result: LocalResult,
): Record<string, LastAction> {
  const last = lastActions[rowId]
  if (last?.result?.state !== 'pending' || last.result.at !== pendingAt || last.result.pressId !== result.pressId)
    return lastActions

  return { ...lastActions, [rowId]: { ...last, result } }
}

const isSent = (r: Pressed) => r.effects.some(e => e.kind === 'send')

/** What a demo press sent: the rows it recorded a press on, and the turn its message started. */
export type DemoSent = { rows: string[]; turn: number }

/** `after` is the demo's turns after the press. Null when the press sent nothing. */
export function demoSent(r: Pressed, after: Turns): DemoSent | null {
  return isSent(r) ? { rows: Object.keys(r.lasts), turn: after.turnsStarted } : null
}

/**
 * The demo's stand-in for the agent's reply to what a press sent. It applies the press's turn. Each other last action
 * that reply would answer moves to that turn, so a hand-off in the sample data keeps waiting.
 */
export function demoReplied(
  s: { lastActions: Record<string, LastAction>; turns: Turns },
  sent: DemoSent,
): { lastActions: Record<string, LastAction>; turns: Turns } {
  const turns = { ...s.turns, turnsApplied: Math.max(s.turns.turnsApplied, sent.turn) }
  const isAnsweredByReply = (id: string, last: LastAction) =>
    !sent.rows.includes(id) && isAwaitingReply(last, s.turns) && !isAwaitingReply(last, turns)
  const lastActions = Object.fromEntries(
    Object.entries(s.lastActions).map(([id, last]) => [
      id,
      isAnsweredByReply(id, last) ? { ...last, turnsStarted: turns.turnsApplied } : last,
    ]),
  )

  return { lastActions, turns }
}

/**
 * The demo's state after a press: the press's ledger without records no reply holds, its last actions without
 * delivery marks, and a turn started when it sends. The row shows what a real press shows, so its shape does not
 * change when the press's own text goes.
 */
export function demoAfterPress(
  before: { lastActions: Record<string, LastAction>; turns: Turns },
  r: Pressed,
  held: ReadonlySet<string>,
): { ledger: Ledger; lastActions: Record<string, LastAction>; turns: Turns } {
  const lasts = Object.fromEntries(
    Object.entries(r.lasts).map(([id, { delivery: _unsent, ...l }]) => [
      id,
      l.result?.state === 'pending' ? { ...l, result: finishedResult(l.result, [], l.result.at) } : l,
    ]),
  )

  return {
    ledger: pruneClosed(r.ledger, held),
    lastActions: withLasts(before.lastActions, lasts, r.drop),
    turns: isSent(r) ? { ...before.turns, turnsStarted: before.turns.turnsStarted + 1 } : before.turns,
  }
}

export type EffectHost = {
  now(): Promise<number> | number
  /** Opens, copies or refreshes PRs. Returns why it could not, or null. */
  perform(e: Exclude<Effect, { kind: 'send' }>): Promise<string | null>
  send(
    e: Extract<Effect, { kind: 'send' }>,
    deliveryId: string,
  ): Promise<{ state: 'accepted' } | { state: 'rejected'; reason: string } | { state: 'unconfirmed'; reason: string }>
  deliveryId(): string
  saveLasts(change: (a: Record<string, LastAction>) => Record<string, LastAction>): Promise<Record<string, LastAction>>
  saveLedger(change: (l: Ledger) => Ledger): Promise<void>
}

/**
 * When the press is a Local one, `pending` is the result it recorded on
 * `rowId`, and the result of how they went replaces it. Returns that result, or null for a press with no pending one.
 */
export async function runLocalEffects(
  host: EffectHost,
  effects: Effect[],
  rowId: string,
  pending: LocalResult | undefined,
): Promise<LocalResult | null> {
  const errors: (string | null)[] = []
  for (const e of effects)
    if (e.kind !== 'send') {
      try {
        errors.push(await host.perform(e))
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  if (pending?.state !== 'pending') return null
  const result = finishedResult(pending, errors, await host.now())
  await host.saveLasts(a => withResult(a, rowId, pending.at, result))

  return result
}

/**
 * A rejected send marks its rows failed and reopens an answer it closed.
 */
export async function runSends(
  host: EffectHost,
  effects: Effect[],
  rowId: string,
  rows: string[],
  at: number,
): Promise<
  { state: 'rejected'; reason: string; isRowFailed: boolean } | { state: 'unconfirmed'; reason: string } | null
> {
  for (const e of effects) {
    if (e.kind !== 'send') continue
    const deliveryId = host.deliveryId()
    const outcome = await host.send(e, deliveryId)
    if (outcome.state === 'accepted') continue
    if (outcome.state === 'unconfirmed') {
      await host.saveLasts(a => withUnconfirmed(a, e.text, at, deliveryId))
      return outcome
    }
    const reason = outcome.reason
    const last = (await host.saveLasts(a => withFailure(a, rows, at, reason, deliveryId)))[rowId]
    const isRowFailed = last?.at === at && last.delivery?.state === 'failed' && last.delivery.id === deliveryId
    if (isRowFailed && last.kind === 'mark') await host.saveLedger(l => reopenOnFailure(l, rowId, at))

    return { state: 'rejected', reason, isRowFailed }
  }

  return null
}
