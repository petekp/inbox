import { withSentArrived } from '../../core/runtime/session-turns'
import type { SessionState } from './state'
import { userMessagesSince } from './transcript'

/**
 * How long a message sits in the rollout before the rollout, not the hook, settles its press. A hook that sees the
 * message runs within moments, and a press it has not matched by then never will.
 */
export const ROLLOUT_ARRIVAL_AFTER_MS = 10_000

/**
 * Marks arrived each press message the rollout saved as a user message, at or after its press, that no hook matched.
 * A message `codex queue` puts into a running turn can reach the rollout with changed whitespace or without a prompt hook.
 */
export async function withRolloutArrivals(s: SessionState, now: number): Promise<SessionState> {
  const remoteDeliveries = new Set(Object.values(s.remoteCommands).map(command => command.deliveryId))
  const remoteTexts = new Set(
    s.sent
      .filter(
        send =>
          (send.commandIds?.length ?? 0) > 0 || (send.deliveryId !== null && remoteDeliveries.has(send.deliveryId)),
      )
      .map(send => send.text.trim()),
  )
  const waiting = s.sent.filter(
    x => x.row !== null && x.pressedAt !== null && x.phase === 'accepted' && !remoteTexts.has(x.text.trim()),
  )
  if (waiting.length === 0) return s
  const since = Math.min(...waiting.map(x => x.pressedAt ?? now))
  const saved = (await userMessagesSince(s.transcriptPath, since)).filter(m => now - m.at >= ROLLOUT_ARRIVAL_AFTER_MS)

  return waiting.reduce((acc, x) => {
    const isSaved = saved.some(m => m.text === x.text.trim() && m.at >= (x.pressedAt ?? 0))

    return isSaved ? withSentArrived(acc, x.text) : acc
  }, s)
}
