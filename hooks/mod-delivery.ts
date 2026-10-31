import type { SessionAppendMessage } from 'claude-code'
import type { Session } from './session'
import type { SentBy } from './session-turns'
import type { SendOutcome } from './session-presses'
import { withArrival, withRewrite, withUnconfirmed } from './presses'

export function messageText(message: SessionAppendMessage): string {
  return message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
}

/** A sent message no record can be matched to. Its text arriving reads unconfirmed. */
export function uncertainRecord(text: string): Session['sent'][number] {
  return {
    text,
    press: null,
    at: 0,
    row: null,
    queuedId: null,
    pressedAt: null,
    deliveryId: null,
    phase: 'uncertain',
  }
}

export function isUntracked(record: Session['sent'][number]): boolean {
  return record.phase === 'uncertain' && record.deliveryId === null
}

/** Adds back, as uncertain, the sent record an older build lost for a row's queued message, and marks the row unconfirmed. */
export function withLostSendsUncertain<S extends Session>(s: S): S {
  const lost = Object.entries(s.lastActions).flatMap(([row, action]) => {
    const delivery = action.delivery
    return /^[if]\d+$/.test(row) &&
      delivery?.state === 'queued' &&
      !s.sent.some(x =>
        delivery.id ? x.deliveryId === delivery.id : x.text === delivery.message && x.pressedAt === action.at,
      )
      ? [delivery.message]
      : []
  })
  const fresh = lost.filter(text => !s.sent.some(x => isUntracked(x) && x.text === text))

  return {
    ...s,
    sent: [...s.sent, ...fresh.map(uncertainRecord)],
    lastActions: lost.reduce((actions, text) => withUnconfirmed(actions, text), s.lastActions),
  }
}

/**
 * The prompt rows of the mod's own messages Claude Code has stored, by text: how many rows were stored before
 * each, and the sent record each matched. A rewritten message is confirmed from these, since its row may be stored
 * before `$.prompt.submit` returns.
 */
export const stored = {
  count: 0,
  at: new Map<string, number>(),
  by: new Map<string, { count: number; deliveryId: string | null }>(),
}

export function forgetStored() {
  stored.at.clear()
  stored.by.clear()
}

/** Records that Claude Code stored a prompt row of the mod's own. Returns the row's count, for `arrived`. */
export function noteStored(text: string): number {
  const count = ++stored.count
  stored.at.set(text, count)
  stored.by.set(text, { count, deliveryId: null })

  return count
}

/**
 * Matches the stored prompt row `count` to the message a press sent. A message matches while its send is still
 * running too, since Claude Code stores the row before `$.prompt.submit` returns. When an older build's untracked
 * send has the same text, the row confirms nothing, so it reads unconfirmed.
 */
export function arrived(s: Session, text: string, count: number): { state: Session; sentBy: SentBy } {
  const tracked = s.sent.filter(x => !isUntracked(x))
  const index = tracked.findIndex(x => x.text === text)
  const match = tracked[index]
  if (!match || s.sent.some(x => isUntracked(x) && x.text === text)) {
    return {
      state: {
        ...s,
        sent: match ? s.sent.filter(x => x !== match) : s.sent,
        lastActions: withUnconfirmed(s.lastActions, text),
      },
      sentBy: { press: null },
    }
  }
  if (stored.by.get(text)?.count === count) stored.by.set(text, { count, deliveryId: match.deliveryId })
  const lastActions = tracked
    .slice(index + 1)
    .filter(x => x.text === text && x.row !== null)
    .reduce(
      (actions, laterSend) => withUnconfirmed(actions, text, laterSend.pressedAt ?? undefined, laterSend.deliveryId),
      match.row === null
        ? s.lastActions
        : withArrival(s.lastActions, text, match.pressedAt ?? undefined, match.deliveryId),
    )

  return { state: { ...s, sent: s.sent.filter(x => x !== match), lastActions }, sentBy: { press: match.press } }
}

/**
 * Settles a message another plugin rewrote whose row Claude Code stored before `$.prompt.submit` returned. The row
 * confirms the press only when no other record or untracked send shares the new text and the row matched no record.
 * Returns how the send went, or null when the row is not stored yet and the shared code settles it.
 */
export function settleRewrite(
  s: Session,
  deliveryId: string,
  text: string,
  entered: string,
  since: number,
): { state: Session; outcome: SendOutcome } | null {
  if ((stored.at.get(entered) ?? 0) <= since) return null
  const record = s.sent.find(x => x.deliveryId === deliveryId)
  const rows = Object.entries(s.lastActions).filter(
    ([_id, a]) => a.delivery && 'id' in a.delivery && a.delivery.id === deliveryId,
  )
  const moved = rows.reduce(
    (actions, [id, a]) => withRewrite(actions, [id], a.at, text, entered, deliveryId),
    s.lastActions,
  )
  const isConfirmed =
    !s.sent.some(x => x.deliveryId !== deliveryId && x.text === entered) && stored.by.get(entered)?.deliveryId === null
  if (isConfirmed)
    return {
      state: {
        ...s,
        sent: s.sent.filter(x => x.deliveryId !== deliveryId),
        lastActions: withArrival(moved, entered, undefined, deliveryId),
        turn: { ...s.turn, press: s.turn.press ?? record?.press ?? null },
      },
      outcome: { state: 'accepted', queuedId: null },
    }

  return {
    state: {
      ...s,
      sent: s.sent.map(x => (x.deliveryId === deliveryId ? { ...x, text: entered } : x)),
      lastActions: withUnconfirmed(moved, entered, undefined, deliveryId),
    },
    outcome: { state: 'unconfirmed', reason: 'Another plugin changed the message' },
  }
}
