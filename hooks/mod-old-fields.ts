import type { LastAction, Ledger, OldPresence, PrViews, SentPrompt, Session, Stop } from '../types'
import { uncertainRecord } from './mod-delivery'
import { upgradeSession } from './session-files'

/** What an older build's presence field held before it was first written. */
export const NO_OLD_PRESENCE: OldPresence = {
  lastActiveAt: 0,
  isAway: false,
  isUpdating: false,
  ledgerState: 'current',
  turnsStarted: 0,
  turnsApplied: 0,
  minute: 0,
}

export const NO_OLD_PR_VIEWS: PrViews = { views: {}, branchRef: null, isFetching: false }

/** The separate fields an older build kept the session in. */
type OldFields = {
  ledger: Ledger
  presence: OldPresence
  prViews: PrViews
  stop: Stop | null
  lastActions: Record<string, LastAction>
  sent: SentPrompt[] | undefined
  untracked: { sessionId: string; text: string }[] | undefined
}

/**
 * The session `id` as an older build left it in its separate fields. A sent message whose record those fields lost is
 * kept as an uncertain record, so its arrival cannot be credited to a newer press.
 */
export function sessionFromOldFields(
  id: string,
  { ledger, presence, prViews, stop, lastActions, sent, untracked }: OldFields,
): Session {
  return upgradeSession({
    ledger,
    presence: {
      isUpdating: presence.isUpdating,
      ledgerState: presence.ledgerState,
      // Presence from before the turn counts existed cannot say whether the last turn's update landed, so that
      // load catches up once.
      turnsStarted: presence.turnsStarted ?? 1,
      turnsApplied: presence.turnsApplied ?? 0,
    },
    prViews,
    stop,
    lastActions,
    sent: [
      ...(sent ?? [])
        .filter(p => p.sessionId === id)
        .map(p => ({ text: p.text, press: null, at: p.pressedAt ?? 0, pressedAt: p.pressedAt, deliveryId: p.id })),
      ...(untracked ?? []).filter(u => u.sessionId === id).map(u => uncertainRecord(u.text)),
    ],
  })
}
