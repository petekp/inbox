import { linkDialogs } from './dialogs'
import { closedAt, pruneClosed } from './ledger-close'
import type { Host } from './model-text'
import { applyPrPress } from './pr-tab'
import { isPrPress, pressRowId } from './pr-press'
import { isViewKept } from './pr-views'
import { itemPrSteps } from './pr-fetch'
import { withOrderStatuses } from './pr-order'
import type { Applied, PrPress } from './pr-press'
import { actionId } from './press-labels'
import { applyPress, withAcceptedSend, withRewrite, withUnconfirmed } from './press-reducer'
import type { PressTexts } from './press-messages'
import type { RowPress } from './presses'
import { toolAnswer } from './tools'
import type { AgentTool, ToolAnswer } from './tools'
import { allRows, isShownSince, outAction, pressFeedbackIn } from './view'
import type { Holds, RowState } from './view'
import type { PrViews, Session } from '../types'
import { sessionView } from './session-view'

export type Pressed = Exclude<Applied, { stale: true }>

/** What a look draws a session's rows with besides the session: how long Undo lasts, and what the look holds in place. */
type DrawnWith = { settleWindowMs: number; holds: Holds }

/**
 * A press of an action whose button the look draws as out, since its earlier press is still out. It changes nothing,
 * so a second press sends nothing.
 */
function isRepeatWhileOut(s: Session, p: RowPress | PrPress, at: number, drawn: DrawnWith): boolean {
  const rowId = pressRowId(p)
  const view = sessionView(s, at, drawn.settleWindowMs, false, drawn.holds)
  const row = allRows(view).find(r => r.id === rowId)
  const last = view.lastActions[rowId]
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
  if (isRepeatWhileOut(s, p, at, drawn)) return { ledger: s.ledger, lasts: {}, drop: [], effects: [] }
  const ctx = { now: at, turnsStarted: s.presence.turnsStarted, localPressId }
  if (isPrPress(p)) return applyPrPress(s.ledger, s.prViews, s.lastActions, p, ctx)
  const item = s.ledger.items.find(i => i.id === p.id)
  const r = applyPress(s.ledger, s.lastActions[p.id], p, {
    ...ctx,
    extraSteps: item ? itemPrSteps(item, s.prViews, s.ledger.prs) : [],
    answerMessage: texts.answerMessage,
    comparePage: texts.comparePage,
  })
  if ('stale' in r) return r

  return {
    ledger: r.ledger,
    lasts: r.last ? { [p.id]: r.last } : {},
    drop: [],
    effects: r.effects,
    ...(r.reopenedId ? { reopenedId: r.reopenedId } : {}),
  }
}

export type SendOutcome =
  /** `entered` is the text the agent got, when another plugin changed the message on its way. */
  | { state: 'accepted'; queuedId: string | null; entered?: string }
  | { state: 'rejected'; reason: string }
  | { state: 'unconfirmed'; reason: string }

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
    for (const [id, action] of delivered) lastActions = withAcceptedSend(lastActions, [id], action.at, text, deliveryId)
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
 * line the person sees under the call, as `hooks/tools.ts:ToolAnswer` says.
 */
export function recorded<S extends Session>(
  host: Host,
  s: S,
  tool: AgentTool,
  args: Record<string, unknown>,
  now: number,
): { state: S } & Omit<ToolAnswer, 'ledger'> {
  const r = toolAnswer(host, s.ledger, tool, args, now)
  const ledger = withOrderStatuses(r.ledger, s.prViews.views)

  return { state: linkDialogs({ ...s, ledger }), result: r.result, personLine: r.personLine }
}

/** `s` with the rows a look holds in place and the start of its showing, which `pruned` keeps the records of. */
export function withHolds<S extends Session>(s: S, holds: Holds): S {
  return { ...s, heldRows: Object.keys(holds.replies), shownSince: holds.shownSince }
}

/**
 * `s` as every write saves it. Each closed list is cut to its newest records, and keeps the records of the rows a look
 * still draws: the rows `heldRows` names, and the rows closed or pressed since `shownSince`. A PR's view goes once
 * `isViewKept` no longer keeps it.
 */
export function pruned<S extends Session>(s: S): S {
  const inPlace = [
    ...Object.entries(s.lastActions).map(([id, a]) => ({ id, at: a.at })),
    ...[...s.ledger.closed, ...s.ledger.closedFindings].map(c => ({ id: c.id, at: closedAt(c) })),
  ].flatMap(x => (isShownSince(x.at, s.shownSince) ? [x.id] : []))
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).filter(([ref]) =>
      isViewKept(s.prViews, s.ledger, s.lastActions, ref, s.shownSince),
    ),
  )
  const isViewDropped = Object.keys(views).length < Object.keys(s.prViews.views).length

  return {
    ...s,
    ledger: pruneClosed(s.ledger, new Set([...s.heldRows, ...inPlace])),
    prViews: isViewDropped ? { ...s.prViews, views } : s.prViews,
  }
}

/**
 * Merges fetched PRs into the session, and records the status of each ranked PR the order has none for. The write that
 * saves it drops, through `pruned`, each view no look draws. `isGhSignedOut` is null when no gh run answered, and the
 * saved one stands.
 */
export function withFetchedPrs<S extends Session>(
  s: S,
  fetched: PrViews['views'],
  branchRef: string | null,
  isGhSignedOut: boolean | null,
): S {
  const isSignedOut = isGhSignedOut ?? s.prViews.isGhSignedOut === true
  const views = { ...s.prViews.views, ...fetched }

  return {
    ...s,
    ledger: withOrderStatuses(s.ledger, views),
    prViews: {
      views,
      branchRef,
      isFetching: false,
      ...(isSignedOut ? { isGhSignedOut: true } : {}),
    },
  }
}
