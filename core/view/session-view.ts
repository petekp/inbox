import { isRowTabRunning } from './arrivals'
import { drawnPrs, openPrViews } from './pr-views'
import { isPrTabRunning, threadSentIn } from './pr-rows'
import { itemPrSteps, olderPrsText, tabPrs } from '../domain/pr-fetch'
import { prOrderView } from './pr-order'
import type { DrawnPr } from './pr-views'
import type { PrOrderView } from './pr-order'
import { prRefreshView } from './pr-refresh'
import type { PrRefreshView } from './pr-refresh'
import { prClearActions } from './pr-tab'
import type { PrAction } from './pr-press'
import { prNeedsYou } from '../domain/prs'
import { isPrRowId } from '../domain/presses'
import { feedbackOf, prTabHoldSince } from './feedback'
import { MARK_LEGEND } from './help'
import { earliestOf, hasRunningMark, NO_HOLDS } from './timing'
import { inboxView, perTurnStatus } from './view'
import { NO_SYNC_INPUTS, viewSync } from './sync-state'
import type { GhSync, SyncInputs, ViewSync } from './sync-state'
import { isRowTab } from './tabs'
import { collapsedRows } from './collapse'
import { statusPage } from './status-page'
import type { InboxView } from './view'
import type { StatusPage } from './status-page'
import type { Holds } from './timing'
import type { ShownTab } from './tabs'
import type { FoldKind, LastAction, RowNote, Session, Turns } from '../../types'

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
  /** Whether gh could read the PRs at the last fetch: missing, signed out, or the fetch read none of them. */
  gh: GhSync
  /** The line at the top of the tab while a PR could not be read, with Refresh PRs, or null. `prRefreshView`. */
  refresh: PrRefreshView | null
  /** Clear merged and closed, drawn under the refresh line and above the order, or none. `prClearActions`. */
  clear: PrAction[]
  /** When the oldest press still under way on a PR row began, or null. A settled PR block that was in place then waits for it. */
  pressOutSince: number | null
}

export type SessionView = InboxView & {
  /** Each row's last press, by row id, which a look reads for its PR rows and blocks. */
  lastActions: Record<string, LastAction>
  /** The turn counts each row's feedback reads, as "Explaining…" until the reply to its press. */
  turns: Turns
  prs: PrTab
  statusPage: StatusPage
  /** Whether each source the view draws is current. Each PR's is in `sync.prs` by ref. */
  sync: ViewSync
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

export function sessionView(
  s: Session,
  now: number,
  settleWindowMs: number,
  holds: Holds = NO_HOLDS,
  notes: Record<string, RowNote> = {},
  canScrollConversation = false,
  inputs: SyncInputs = NO_SYNC_INPUTS,
): SessionView {
  const l = s.ledger
  const lastActions = withoutStalePending(s.lastActions, now)
  const sync = viewSync(s, now, inputs)

  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map(item => [item.id, itemPrSteps(item, s.prViews, tabPrs(l))])),
    settleWindowMs,
    status: perTurnStatus(sync.ledger),
    now,
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    collapsed: collapsedRows(s),
    canScrollConversation,
  })

  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds, settleWindowMs, sync.gh),
    statusPage: statusPage(s, now, sync.turn),
    sync,
  }
}

/**
 * Whether a text look draws a running mark on `shown`, so the terminal and omp keep their frame timer going. Help always
 * does, since the legend's first mark runs. A row tab does while an update checks the asks, which an empty tab marks.
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

  return isRowTabRunning(v, shown, isUnfolded) || v.sync.ledger.is === 'checking'
}

function prTabOf(
  s: Session,
  lastActions: Record<string, LastAction>,
  now: number,
  { shownSince, listInput, undoShown, undoOut }: Holds,
  settleWindowMs: number,
  gh: GhSync,
): PrTab {
  const pressOutSince = earliestOf(
    Object.entries(lastActions).map(([id, last]) =>
      isPrRowId(id) ? prTabHoldSince(feedbackOf(id, last, undefined, s.presence, now)) : null,
    ),
  )
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    undoOut,
    pressOutSince,
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
    gh,
    refresh: prRefreshView(
      { ...s.prViews, isGhMissing: s.prViews.isGhMissing === true },
      s.ledger,
      { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now },
      shownSince,
    ),
    clear: prClearActions(s.prViews, s.ledger),
    pressOutSince,
  }
}
