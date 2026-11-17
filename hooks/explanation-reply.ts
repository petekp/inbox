import type { LastAction } from '../types'

type Explanation = NonNullable<LastAction['explanation']>

function withExplanation(a: LastAction, explanation: Explanation): LastAction {
  const { explanation: _old, ...rest } = a

  return Object.keys(explanation).length > 0 ? { ...rest, explanation } : rest
}

/**
 * Marks each row whose Explain message arrived in `after` and not in `before` to wait for its reply's first text. A
 * row still waiting from an earlier prompt stops, since a reply now answers the new prompt. A message that entered a
 * running turn marks no row, since the next text may answer the turn's other work.
 */
export function withExplanationAwaited(
  before: Record<string, LastAction>,
  after: Record<string, LastAction>,
  isOwnTurn: boolean,
): Record<string, LastAction> {
  const hasArrived = (id: string, a: LastAction) =>
    a.action === 'explain' && a.delivery?.state === 'arrived' && before[id]?.delivery?.state !== 'arrived'

  return Object.fromEntries(
    Object.entries(after).map(([id, a]) => {
      const { isAwaitingReply: _stopped, ...kept } = a.explanation ?? {}
      if (isOwnTurn && hasArrived(id, a)) return [id, withExplanation(a, { ...kept, isAwaitingReply: true })]
      return [id, a.explanation?.isAwaitingReply ? withExplanation(a, kept) : a]
    }),
  )
}

/** Each row waiting for its explanation's reply takes `replyId`, the transcript row of the reply's first text. */
export function withExplanationReply(
  lastActions: Record<string, LastAction>,
  replyId: string,
): Record<string, LastAction> {
  if (!Object.values(lastActions).some(a => a.explanation?.isAwaitingReply)) return lastActions

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => {
      if (!a.explanation?.isAwaitingReply) return [id, a]
      const isFirstReply = a.explanation.replyId === undefined

      return [id, withExplanation(a, { replyId, ...(isFirstReply ? { isFirstReply: true as const } : {}) })]
    }),
  )
}

/**
 * Each row still waiting for its explanation's reply stops waiting, as when the main agent's turn ends: a turn the
 * person stopped, or one that ran only tools, leaves no reply, and the next text may answer other work.
 */
export function withReplyWaitEnded(lastActions: Record<string, LastAction>): Record<string, LastAction> {
  if (!Object.values(lastActions).some(a => a.explanation?.isAwaitingReply)) return lastActions

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => {
      if (!a.explanation?.isAwaitingReply) return [id, a]
      const { isAwaitingReply: _ended, ...kept } = a.explanation

      return [id, withExplanation(a, kept)]
    }),
  )
}

/** Why `$.ui.scroll` moved nothing, in the row's words, from the engine's refusal. */
export function scrollFailure(deny: string): string {
  if (deny.includes('nothing drawn')) return 'it is no longer in the conversation'
  if (deny.includes('not scrollable')) return 'the conversation does not scroll here'
  if (deny.includes('not person-initiated')) return 'only a press in the inbox pane can scroll the conversation'

  return deny
}
