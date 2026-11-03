import { isRowTabRunning } from './arrivals'
import { drawnPrs, openPrViews } from './pr-views'
import { isPrTabRunning, threadSentIn } from './pr-rows'
import { itemPrSteps, olderPrsText, tabPrs } from './pr-fetch'
import { prOrderView } from './pr-order'
import { prTabActions } from './pr-tab'
import type { DrawnPr } from './pr-views'
import type { PrAction } from './pr-press'
import type { PrOrderView } from './pr-order'
import { prNeedsYou } from './prs'
import { MARK_LEGEND } from './help'
import { hasRunningMark, NO_HOLDS } from './timing'
import { inboxView, perTurnStatus } from './view'
import type { UpdateRecovery } from './view'
import { isRowTab } from './tabs'
import { statusPage } from './status-page'
import type { InboxView } from './view'
import type { StatusPage } from './status-page'
import type { Holds } from './timing'
import type { ShownTab } from './tabs'
import type { FoldKind, LastAction, RowNote, Session, Turns } from '../types'

export const PRESS_TIMEOUT_MS = 60_000

type PrTab = {
  drawn: DrawnPr[]
  branchRef: string | null
  /** How many open PRs wait on the person. */
  count: number
  /** Names the linked PRs too old for the tab to show, or null. */
  olderText: string | null
  /** The agent's order of the PRs, drawn above them, or null while it ranks no block the tab draws. `prOrderView`. */
  order: PrOrderView | null
  /** The tab's own buttons, drawn after its PR blocks. `prTabActions`. */
  tabActions: PrAction[]
  /** Whether gh asked for a sign-in at the last fetch it answered. */
  isGhSignedOut: boolean
}

export type SessionView = InboxView & {
  /** Each row's last press, by row id, which a look reads for its PR rows and blocks. */
  lastActions: Record<string, LastAction>
  /** The turn counts each row's feedback reads, as "Explaining…" until the reply to its press. */
  turns: Turns
  prs: PrTab
  statusPage: StatusPage
}

/** Drops a Local result still pending after `PRESS_TIMEOUT_MS`, whose press will not finish. */
function withoutStaleResult(last: LastAction, now: number): LastAction {
  if (last.result?.state !== 'pending' || now - last.result.at <= PRESS_TIMEOUT_MS) return last
  const { result: _result, ...rest } = last

  return rest
}

function withoutStalePending(lastActions: Record<string, LastAction>, now: number): Record<string, LastAction> {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]))
}

/**
 * Where the session's failed ledger update stands. A host retries when an exchange is pending, or when it can catch
 * up: `canCatchUp`, and the last catch-up did not find the conversation unreadable.
 */
export function updateRecovery(s: Session, canCatchUp: boolean): UpdateRecovery {
  const { presence } = s
  if (presence.ledgerState !== 'failed') return 'none'
  if (presence.isUpdating) return 'retrying'
  const canRetry = s.pending.length > 0 || (canCatchUp && !presence.isConversationUnreadable)
  if (!canRetry) return 'cannot-retry'

  return presence.failedUpdates > 1 ? 'failed-again' : 'waiting'
}

/** `canCatchUp` says whether the host can read the whole conversation, so its next update can retry a failed ledger. */
export function sessionView(
  s: Session,
  now: number,
  settleWindowMs: number,
  canCatchUp: boolean,
  holds: Holds = NO_HOLDS,
  notes: Record<string, RowNote> = {},
): SessionView {
  const l = s.ledger
  const lastActions = withoutStalePending(s.lastActions, now)

  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map(item => [item.id, itemPrSteps(item, s.prViews, tabPrs(l))])),
    settleWindowMs,
    status: perTurnStatus(s.presence.isUpdating, updateRecovery(s, canCatchUp), s.presence.failedUpdates),
    now,
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
  })

  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds.shownSince, settleWindowMs),
    statusPage: statusPage(s, now),
  }
}

/**
 * Whether a text look draws a running mark on `shown`, so the terminal and omp keep their frame timer going. Help always
 * does, since the legend's first mark runs.
 */
export function showsRunningMark(
  v: SessionView,
  shown: ShownTab,
  isHelpShown: boolean,
  isUnfolded: (kind: FoldKind) => boolean,
): boolean {
  if (isHelpShown) return MARK_LEGEND.some(m => m.isRunning)
  if (!isRowTab(shown)) return hasRunningMark(v.statusPage)
  if (shown === 'prs') return isPrTabRunning(openPrViews(v.prs.drawn), v.lastActions)

  return isRowTabRunning(v, shown, isUnfolded)
}

function prTabOf(
  s: Session,
  lastActions: Record<string, LastAction>,
  now: number,
  shownSince: number | null,
  settleWindowMs: number,
): PrTab {
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, now, settleWindowMs, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
  })
  const isSent = threadSentIn(lastActions)

  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter(d => d.state.is === 'open' && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger),
    order: prOrderView(
      s.ledger.prOrder,
      drawn,
      { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now },
      shownSince,
    ),
    tabActions: prTabActions(drawn, s.prViews.branchRef),
    isGhSignedOut: s.prViews.isGhSignedOut === true,
  }
}
