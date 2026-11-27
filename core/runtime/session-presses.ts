import { isResumable, RESUME_TEXT } from '../view/banners'
import { settledCollapses } from '../view/collapse'
import { remoteHeldRows } from './remote-viewers'
import { pendingCommandRows } from './remote-command-state'
import type { CarriedCommands } from './remote-command-state'
import { linkDialogs } from '../domain/dialogs'
import type { AnswerDoc } from '../domain/earlier-answers'
import { closedAt, pruneClosed } from '../domain/ledger-close'
import type { DelegateSession } from '../remote/hc-terminals'
import type { Host } from '../domain/model-text'
import { applyPrPress, withFinishedPrsSettled } from '../view/pr-tab'
import { isPrPress, lastPressOf, pressRowId } from '../view/pr-press'
import { isViewKept } from '../view/pr-views'
import { sessionPrs } from '../domain/pr-fetch'
import { withOrderStatuses } from '../view/pr-order'
import type { Applied, PrPress } from '../view/pr-press'
import { actionId } from '../domain/press-labels'
import { applyPress, withAcceptedSend, withArrival, withRewrite, withUnconfirmed } from '../view/press-reducer'
import type { PressTexts } from '../domain/press-messages'
import type { RowPress } from '../domain/presses'
import { toolAnswer } from './tools'
import type { AgentTool } from './tools'
import type { ToolAnswer } from './tool-answer'
import { allRows } from '../view/rows'
import { isShownSince } from '../view/timing'
import { outAction, pressFeedbackIn } from '../view/feedback'
import type { Holds } from '../view/timing'
import type { RowState } from '../view/rows'
import type { PrFetchFailure, PrViews, Session, ToolFields, ViewerLeases } from '../../types'
import { sessionView } from '../view/session-view'

export type Pressed = Exclude<Applied, { stale: true }>

/** What a look draws a session's rows with besides the session: how long Undo lasts, and what the look holds in place. */
type DrawnWith = { settleWindowMs: number; holds: Holds }

/**
 * A press of an action whose button the look draws as out, since its earlier press is still out. It changes nothing,
 * so a second press sends nothing.
 */
export function isRepeatWhileOut(s: Session, p: RowPress | PrPress, at: number, drawn: DrawnWith): boolean {
  const rowId = pressRowId(p)
  const view = sessionView(s, at, drawn.settleWindowMs, drawn.holds)
  const row = allRows(view).find(r => r.id === rowId)
  const last = view.lastActions[rowId]
  if (isPrPress(p)) {
    const fetchedAt = 'ref' in p ? s.prViews.views[p.ref]?.fetchedAt : undefined
    const presses = { lastActions: view.lastActions, turns: s.presence, now: at }

    return lastPressOf(presses, rowId, fetchedAt).out === actionId(p)
  }
  const state: RowState = row?.state ?? { is: 'open' }
  const feedback = pressFeedbackIn(rowId, state, last, s.presence, at, row?.item?.reportedAt)

  return outAction(last, feedback) === actionId(p)
}

export function pressOn(
  s: Session,
  p: RowPress | PrPress,
  at: number,
  drawn: DrawnWith,
  texts: PressTexts,
  localPressId?: string,
): Pressed | { stale: true } {
  if (p.action === 'resume') {
    const previous = s.lastActions.session
    const alreadyRequested =
      s.stop &&
      previous &&
      previous.at >= s.stop.at &&
      previous.turnsStarted === s.presence.turnsStarted &&
      previous.delivery?.state !== 'failed'
    if (p.id !== 'session' || !s.stop || !isResumable(s.stop) || s.presence.isTurnRunning || alreadyRequested)
      return { stale: true }
    return {
      ledger: s.ledger,
      lasts: {
        session: {
          kind: 'handoff',
          action: 'resume',
          text: 'Resume',
          at,
          turnsStarted: s.presence.turnsStarted,
          delivery: { state: 'queued', message: RESUME_TEXT },
        },
      },
      drop: [],
      effects: [{ kind: 'send', text: RESUME_TEXT, by: null }],
    }
  }
  if (isRepeatWhileOut(s, p, at, drawn)) return { ledger: s.ledger, lasts: {}, drop: [], effects: [] }
  const ctx = { now: at, turnsStarted: s.presence.turnsStarted, localPressId }
  if (isPrPress(p)) return applyPrPress(s.ledger, s.prViews, s.lastActions, p, ctx)
  const r = applyPress(s.ledger, s.lastActions[p.id], p, {
    ...ctx,
    holdMs: drawn.settleWindowMs,
    sessionPrs: sessionPrs(s),
    answerMessage: texts.answerMessage,
    comparePage: texts.comparePage,
    compareInBackground: texts.compareInBackground,
  })
  if ('stale' in r) return r

  return {
    ledger: r.ledger,
    lasts: r.last ? { [p.id]: r.last } : {},
    drop: r.dropLast ? [p.id] : [],
    effects: r.effects,
    ...(r.reopenedId ? { reopenedId: r.reopenedId } : {}),
  }
}

export type SendOutcome =
  /**
   * `entered` is the text the agent got, when another plugin changed the message on its way. `isInTurn` says the host
   * put the message into the running turn, so it has arrived and waits in no queue.
   */
  | { state: 'accepted'; queuedId: string | null; entered?: string; isInTurn?: boolean }
  | { state: 'rejected'; reason: string }
  | { state: 'unconfirmed'; reason: string }

/**
 * The commands a delivery attempt carries, and whether `outcome` says its message arrived, read before
 * `completedAttempt` drops the attempt. A message put into the running turn has arrived unless an earlier send of
 * the same text may still arrive.
 */
export function attemptCommands(state: Session, deliveryId: string, outcome: SendOutcome): CarriedCommands {
  const index = state.sent.findIndex(s => s.deliveryId === deliveryId)
  const attempt = state.sent[index]
  if (!attempt) return { ids: [], arrived: false }
  const text = outcome.state === 'accepted' ? (outcome.entered ?? attempt.text) : attempt.text
  const earlierUnknown = state.sent
    .slice(0, index)
    .some(s => s.text === text && (s.phase === 'attempting' || s.phase === 'uncertain'))

  return {
    ids: attempt.commandIds ?? [],
    arrived: outcome.state === 'accepted' && outcome.isInTurn === true && !earlierUnknown,
  }
}

export function completedAttempt<S extends Session>(state: S, deliveryId: string, outcome: SendOutcome): S {
  if (outcome.state === 'rejected') return { ...state, sent: state.sent.filter(s => s.deliveryId !== deliveryId) }
  const index = state.sent.findIndex(s => s.deliveryId === deliveryId)
  const attempt = state.sent[index]
  if (!attempt) return state
  const text = outcome.state === 'accepted' ? (outcome.entered ?? attempt.text) : attempt.text
  const delivered = Object.entries(state.lastActions).filter(
    ([_id, action]) => action.delivery && 'id' in action.delivery && action.delivery.id === deliveryId,
  )
  let lastActions =
    text === attempt.text
      ? state.lastActions
      : delivered.reduce(
          (actions, [id, action]) => withRewrite(actions, [id], action.at, attempt.text, text, deliveryId),
          state.lastActions,
        )
  const earlierUnknown = state.sent
    .slice(0, index)
    .some(s => s.text === text && (s.phase === 'attempting' || s.phase === 'uncertain'))
  if (outcome.state === 'accepted' && !earlierUnknown) {
    lastActions = outcome.isInTurn
      ? withArrival(lastActions, text, undefined, deliveryId)
      : delivered.reduce(
          (actions, [id, action]) => withAcceptedSend(actions, [id], action.at, text, deliveryId),
          lastActions,
        )
  }
  if (outcome.state === 'accepted' && earlierUnknown)
    lastActions = withUnconfirmed(lastActions, text, undefined, deliveryId)
  return {
    ...state,
    lastActions,
    sent: state.sent.map(s =>
      s.deliveryId === deliveryId
        ? {
            ...s,
            text,
            phase: outcome.state === 'accepted' ? ('accepted' as const) : ('uncertain' as const),
            queuedId: outcome.state === 'accepted' ? outcome.queuedId : null,
          }
        : s,
    ),
  }
}

/**
 * Applies a call of one of `agentTools` from the agent to the ledger. `result` is the tool's answer, and `personLine` the
 * line the person sees under the call, as `core/runtime/tool-answer.ts:ToolAnswer` says. `fields` are the input fields of the tools
 * the agent has, as its host knows them. `delegate` is the delegate session this is, as
 * `core/remote/hc-terminals.ts:delegateSession` reads it, or null when it is none. `earlier` are the earlier answers the
 * `record` answer lists, from `core/runtime/history-store.ts:recordMatches`.
 */
export function recorded<S extends Session>(
  host: Host,
  s: S,
  tool: AgentTool,
  args: Record<string, unknown>,
  now: number,
  fields: ToolFields,
  delegate: DelegateSession | null,
  earlier: readonly AnswerDoc[] = [],
): { state: S } & Omit<ToolAnswer, 'ledger'> {
  const presses = { lastActions: s.lastActions, turnStartedAt: s.presence.turnStartedAt }
  const r = toolAnswer(host, s.ledger, tool, args, now, presses, fields, delegate, earlier)
  const ledger = withOrderStatuses(r.ledger, s.prViews.views)
  const state = linkDialogs({ ...s, ledger }, now)
  const answered = ledger.items.find(i => !state.ledger.items.some(o => o.id === i.id))
  if (!answered) return { state, result: r.result, personLine: r.personLine }
  const outcome = state.ledger.closed.findLast(c => c.id === answered.id)?.outcome ?? ''

  return {
    state,
    result: `Not shown as open: the user already answered this in your dialog (${outcome}), so it closed with that answer.`,
    personLine: `Closed: ${answered.ask}`,
  }
}

/** `s` with the rows a look holds in place and the start of its showing, which `pruned` keeps the records of. */
export function withHolds<S extends Session>(s: S, holds: Holds): S {
  return { ...s, heldRows: Object.keys(holds.replies), shownSince: holds.shownSince }
}

/**
 * The rows a look still draws in place: the rows `heldRows` names, the rows closed or pressed since `shownSince`, and
 * the rows the live viewer leases in `viewers` hold.
 */
export function rowsInPlace(
  s: Session,
  now = Date.now(),
  viewers: Parameters<typeof remoteHeldRows>[0] = {},
): Set<string> {
  const since = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map(c => ({ id: c.id, at: closedAt(c) })),
  ].flatMap(x => (isShownSince(x.at, s.shownSince) ? [x.id] : []))

  return new Set([...s.heldRows, ...remoteHeldRows(viewers, s, now), ...pendingCommandRows(s), ...since])
}

/**
 * `s` as every write saves it. Each closed list is cut to its newest records, and keeps the records of `rowsInPlace`
 * for the session's live `viewers`. A PR's view goes once `isViewKept` no longer keeps it, and the collapses settle as
 * `settledCollapses` says.
 */
export function pruned<S extends Session>(s: S, now = Date.now(), viewers: ViewerLeases = {}): S {
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(([ref]) =>
      isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince, now),
    ),
  )
  const isViewDropped = Object.keys(views).length < Object.keys(s.prViews.views).length

  return settledCollapses({
    ...s,
    ledger: pruneClosed(s.ledger, rowsInPlace(s, now, viewers)),
    prViews: isViewDropped ? { ...s.prViews, views } : s.prViews,
  })
}

/**
 * Merges fetched PRs into the session, and records the status of each ranked PR the order has none for. The write that
 * saves it drops, through `pruned`, each view no look draws. `isGhSignedOut` is null when no gh run answered, and the
 * saved one stands. `isFetching` stays as the mod set it, since the mod clears it only once it has noted when the fetch
 * ended, and its poll counts from then.
 */
export function withFetchedPrs<S extends Session>(
  s: S,
  fetched: PrViews['views'],
  branchRef: string | null,
  isGhSignedOut: boolean | null,
  now: number,
  failure: PrFetchFailure | null = null,
  unread: Record<string, string> = {},
): S {
  const isSignedOut = isGhSignedOut ?? s.prViews.isGhSignedOut === true
  const views = { ...s.prViews.views, ...fetched }
  const { ledger, lastActions } = withFinishedPrsSettled(s, fetched, branchRef, {
    now,
    turnsStarted: s.presence.turnsStarted,
  })
  const stillUnread = Object.fromEntries(Object.entries(unread).filter(([ref]) => !(ref in views)))

  return {
    ...s,
    lastActions,
    ledger: withOrderStatuses(ledger, views),
    prViews: {
      views,
      branchRef,
      isFetching: s.prViews.isFetching,
      ...(isSignedOut ? { isGhSignedOut: true } : {}),
      ...(failure ? { failure } : {}),
      ...(Object.keys(stillUnread).length > 0 ? { unread: stillUnread } : {}),
    },
  }
}
