import { withOptionDescriptions } from './dialogs'
import { applyExchangeUpdate, applyUpdate, EMPTY, KEPT_SESSIONS, parseReply, upgradeLedger } from './ledger'
import type { Exchange, Press, Update } from './ledger'
import { addActivity, carryText, guidanceText, promptNotes, screenText, START_TITLE, TOLD_NOTHING } from './model-text'
import type { Host, Told } from './model-text'
import {
  applyPrPress,
  drawnPrs,
  isDismissing,
  itemPrSteps,
  keepsView,
  olderPrsText,
  linkedPrs,
  threadSentIn,
} from './pr-tab'
import type { Applied, PrPress } from './pr-tab'
import { applyPress, upgradeLastActions, withAcceptedSend, withArrival, withRewrite, withUnconfirmed } from './presses'
import type { AnswerMessage, RowPress } from './presses'
import { prNeedsYou, prRefs } from './prs'
import { recordClose, recordItem } from './tools'
import { inboxView, NO_HOLDS, perTurnStatus } from './view'
import type { InboxView, ReplyHolds } from './view'
import type { DialogQuestion, LastAction, Ledger, PrView, PrViews, RowNote, Session, Stop, Turns } from '../types'

export type { Session } from '../types'

const NO_PRS: PrViews = { views: {}, branchRef: null, isFetching: false }

const NO_TURN: Session['turn'] = { person: null, trigger: null, activity: [], press: null, dismissedDialogs: [] }

export function emptySession(): Session {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: 'current', hasDroppedReply: false, isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    prViews: NO_PRS,
    stop: null,
  }
}

const SESSION_ID = /^[\w-]{1,100}$/
const SESSION_FILE = /^[\w-]{1,100}\.json$/

/** The name of a session's saved file. Throws for an id that is not safe in a file name. */
export function sessionFile(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`)

  return `${sessionId}.json`
}

export const isSessionFile = (name: string): boolean => SESSION_FILE.test(name)

/** For a read's `catch`: a file that is not there reads as null, and any other failure throws. */
export function missingAsNull(err: unknown): null {
  if ((err as { code?: unknown }).code === 'ENOENT') return null
  throw err
}

/**
 * The saved sessions that may be deleted: the oldest beyond the newest `KEPT_SESSIONS`, ranked by when the file
 * was last saved, never the `keep` session. `files` are the session files, with their save times.
 */
export function staleSessionFiles<F extends { name: string; mtimeMs: number }>(files: F[], keep: string): F[] {
  const ranked = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))

  return ranked.filter(f => f.name !== `${keep}.json`).slice(0, Math.max(0, ranked.length - KEPT_SESSIONS))
}

export const PRESS_TIMEOUT_MS = 60_000

/** A session's shared fields as any earlier build saved them, each possibly missing. */
export type SavedSession = Partial<Omit<Session, 'turn' | 'told' | 'presence' | 'pending' | 'sent' | 'prViews'>> & {
  turn?: Partial<Session['turn']>
  pending?: (Omit<Session['pending'][number], 'ex'> & {
    ex: Omit<Exchange, 'dismissedDialogs'> & Partial<Pick<Exchange, 'dismissedDialogs'>>
  })[]
  told?: Partial<Told>
  presence?: Partial<Session['presence']>
  sent?: (Pick<Session['sent'][number], 'text' | 'press' | 'at'> & Partial<Session['sent'][number]>)[]
  prViews?: Partial<PrViews>
}

/**
 * A saved session's shared fields in the current shape. A sent record saved before the
 * row and delivery fields existed changes no row when its message arrives.
 */
export function upgradeSession(saved: SavedSession): Session {
  const base = emptySession()
  const views = saved.prViews?.views ?? {}

  return {
    ledger: saved.ledger
      ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) }
      : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    pending: (saved.pending ?? []).map(p => ({ ...p, ex: { ...p.ex, dismissedDialogs: p.ex.dismissedDialogs ?? [] } })),
    sent: (saved.sent ?? []).map(x => ({
      ...x,
      row: x.row ?? null,
      queuedId: x.queuedId ?? null,
      pressedAt: x.pressedAt ?? null,
      deliveryId: x.deliveryId ?? null,
      phase: x.phase ?? 'accepted',
    })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
    heldRows: saved.heldRows ?? [],
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      // Views saved before `isYours` and `wasSeenOpen`, and threads saved before their times and `isLinesChanged` existed.
      views: Object.fromEntries(
        Object.entries(views).map(([ref, pr]) => [
          ref,
          {
            ...pr,
            isYours: pr.isYours ?? null,
            wasSeenOpen: pr.wasSeenOpen ?? pr.state === 'OPEN',
            threads: pr.threads.map(t => ({
              ...t,
              isLinesChanged: t.isLinesChanged ?? false,
              at: t.at ?? null,
              reply: t.reply && { ...t.reply, at: t.reply.at ?? null },
            })),
          },
        ]),
      ),
      isFetching: false,
    },
    stop: saved.stop ?? null,
  }
}

/**
 * A resumed conversation still holds the guidance from
 * its start, so it gets only where the session stands. Null when that is empty.
 */
export function startContext(host: Host, s: Session, source: string | undefined): string | null {
  const carried = carryText(s.ledger, START_TITLE)
  const parts = [source === 'resume' ? null : guidanceText(host), carried].filter((x): x is string => x !== null)

  return parts.length > 0 ? parts.join('\n\n') : null
}

export function cleared<S extends Session>(s: S): S {
  return {
    ...s,
    ledger: EMPTY,
    turn: NO_TURN,
    told: { inbox: null, closed: [] },
    pending: [],
    presence: { ...s.presence, ledgerState: 'current', hasDroppedReply: false, turnsApplied: s.presence.turnsStarted },
    lastActions: {},
    stop: null,
  }
}

/** A message a press sent, matched to a prompt that arrived. `press` is null for a message no row press sent. */
export type SentBy = { press: Press | null }

/**
 * Records a prompt that arrived and returns what the agent reads beside it.
 * A host that tells its own sends apart from the person's words calls the parts below instead.
 */
export function notePrompt<S extends Session>(
  host: Host,
  s: S,
  text: string,
  isOpen: boolean,
): { state: S; notes: string[] } {
  const matched = matchSent(s, text)

  return recordPrompt(host, startTurn(matched.state), text, isOpen, matched.sentBy)
}

/**
 * Matches an arrived prompt to the message a press sent, by its text, since a
 * prompt's arrival carries only that. An uncertain earlier attempt blocks a
 * same-text match with a later send.
 */
export function matchSent<S extends Session>(s: S, text: string): { state: S; sentBy: SentBy | null } {
  const matchingAt = s.sent.findIndex(x => x.text === text)
  const matching = matchingAt >= 0 ? s.sent[matchingAt] : undefined
  // A host's own send can arrive before its delivery returns, while its record still reads attempting.
  const isMatchable =
    matching !== undefined &&
    (matching.phase === undefined ||
      matching.phase === 'accepted' ||
      (matching.phase === 'attempting' && matching.deliveryId !== null))
  const sentAt = isMatchable ? matchingAt : -1
  const sent = sentAt >= 0 ? s.sent[sentAt] : undefined
  const eligible =
    sent?.deliveryId === null
      ? Object.fromEntries(
          Object.entries(s.lastActions).filter(
            ([_id, last]) =>
              (last.delivery?.state === 'queued' || last.delivery?.state === 'unconfirmed') &&
              last.delivery.id === undefined,
          ),
        )
      : s.lastActions
  const arrived =
    sent && sent.row !== null
      ? {
          ...s.lastActions,
          ...(sent.deliveryId === null
            ? withUnconfirmed(eligible, text)
            : withArrival(eligible, text, sent.pressedAt ?? undefined, sent.deliveryId)),
        }
      : s.lastActions
  const lastActions = s.sent
    .slice(matchingAt + 1)
    .reduce(
      (actions, later) =>
        later.text === text && later.row !== null
          ? withUnconfirmed(actions, text, later.pressedAt ?? undefined, later.deliveryId)
          : actions,
      arrived,
    )

  return {
    state: { ...s, lastActions, sent: sent ? s.sent.filter((_x, i) => i !== sentAt) : s.sent },
    sentBy: sent ? { press: sent.press } : null,
  }
}

/** Counts a turn that started, and clears the stop the last turn ended with. */
export function startTurn<S extends Session>(s: S): S {
  return { ...s, presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 }, stop: null }
}

/**
 * Records a prompt's words for the turn and returns what the agent reads beside it: the questions a numbered answer
 * refers to, and the inbox when it changed.
 */
export function recordPrompt<S extends Session>(
  host: Host,
  s: S,
  text: string,
  isOpen: boolean,
  sentBy: SentBy | null,
): { state: S; notes: string[] } {
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 }
  const r = promptNotes(host, ledger, { text, isPress: sentBy !== null, isOpen }, s.told)
  const person = s.turn.person === null ? text : `${s.turn.person}\n\n${text}`

  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      turn: { ...s.turn, person, trigger: null, press: sentBy?.press ?? s.turn.press },
    },
    notes: r.notes,
  }
}

export function noteActivity<S extends Session>(s: S, line: string | null): S {
  const activity = addActivity(s.turn.activity, line)
  if (activity === s.turn.activity) return s

  return { ...s, turn: { ...s.turn, activity } }
}

/** Keeps a dismissed dialog's questions for the turn's update, which may add them as items. */
export function noteDismissedDialog<S extends Session>(s: S, questions: DialogQuestion[]): S {
  if (questions.length === 0) return s

  return { ...s, turn: { ...s.turn, dismissedDialogs: [...s.turn.dismissedDialogs, ...questions] } }
}

export const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[\w.-]+\.localhost)(?::\d+)?[^\s"'`)\]]*/g

const PR_CREATE = /\bgh\s+pr\s+create\b/

/**
 * What a finished shell command's output tells the inbox: an activity line for each local URL it printed, and, for
 * `gh pr create`, the PRs it named.
 */
export function commandFindings(command: string, output: string): { lines: string[]; prRefs: string[] } {
  return {
    lines: [...new Set(output.match(LOCAL_URL) ?? [])].map(url => `URL in output: ${url}`),
    prRefs: PR_CREATE.test(command) ? prRefs(output) : [],
  }
}

/** Links the PRs of `refs` the ledger does not track yet. Those it tracks keep their place. */
export function withNewPrRefs(ledger: Ledger, refs: string[]): Ledger {
  const fresh = refs.filter(ref => !ledger.prs.includes(ref))

  return fresh.length === 0 ? ledger : { ...ledger, prs: linkedPrs(ledger.prs, fresh) }
}

/** Notes a finished shell command's findings: its activity lines, and its PRs linked to the session. */
export function noteCommandOutput<S extends Session>(s: S, command: string, output: string): S {
  const found = commandFindings(command, output)
  const noted = found.lines.reduce((x, line) => noteActivity(x, line), s)
  const ledger = withNewPrRefs(noted.ledger, found.prRefs)

  return ledger === noted.ledger ? noted : { ...noted, ledger }
}

/**
 * Queues the turn's exchange for the inbox model. A turn with no reply queues nothing unless
 * `queuesEmptyReply` is set, as for a turn whose question dialog the person dismissed. `tab` names the tab the
 * inbox shows, for the model's note on what the person sees.
 */
export function endTurn<S extends Session>(
  host: Host,
  s: S,
  reply: string,
  isOpen: boolean,
  { tab = null, queuesEmptyReply = false }: { tab?: string | null; queuesEmptyReply?: boolean } = {},
): S {
  const refs = prRefs(reply)
  const base = {
    ...s,
    ledger: refs.length > 0 ? { ...s.ledger, prs: linkedPrs(s.ledger.prs, refs) } : s.ledger,
    turn: NO_TURN,
  }
  if (reply.trim() === '' && !queuesEmptyReply) return base
  const ex: Exchange = {
    person: s.turn.person,
    trigger: s.turn.person === null ? (s.turn.trigger ?? 'unknown') : null,
    activity: s.turn.activity,
    reply,
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(host, isOpen, tab),
    dismissedDialogs: s.turn.dismissedDialogs,
  }

  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] }
}

/**
 * Applies the model's answer for the oldest pending exchange, and drops that exchange. One whose first update
 * failed stays pending, marked failed, for the next update to try again.
 */
export function applied<S extends Session>(s: S, reply: string | null, now: number, promptAt: number): S {
  const next = s.pending[0]
  if (!next) return s
  const { ex } = next
  const parsed = reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join('\n'))
  if (!parsed && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: 'failed' },
    }
  const ledger = parsed
    ? withOptionDescriptions(
        s.ledger,
        applyExchangeUpdate(s.ledger, parsed, ex, now, promptAt),
        ex.turn,
        ex.dismissedDialogs,
      )
    : s.ledger
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed

  return {
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: hasDroppedReply ? 'failed' : 'current',
      hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted),
    },
  }
}

/**
 * Whether the ledger may have missed a turn: a failed or behind update, or turns that started with no exchange
 * waiting. Not while a turn runs, since that turn has not ended yet.
 */
export function needsCatchUp(s: Session): boolean {
  const { presence } = s
  const hasUnappliedTurn =
    s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied

  return presence.ledgerState !== 'current' || hasUnappliedTurn
}

/** Whether a host that cannot read the whole conversation still has something to run: an exchange, or a ledger that is not current. */
export function needsUpdate(s: Session): boolean {
  return s.pending.length > 0 || s.presence.ledgerState !== 'current'
}

/** Whether the session has a card, an item or a finding. */
export function hasLedger(s: Session): boolean {
  const { ledger } = s

  return ledger.card !== null || ledger.items.length > 0 || ledger.findings.length > 0
}

/**
 * A forked conversation continues its parent's ledger: the card, items, findings and closed records. It takes
 * nothing else, since presses, queued messages, the stop and the running turn belong to the parent. A fork that
 * already has turns or a card keeps its own.
 */
export function forkedFrom<S extends Session>(child: S, parent: Session): S {
  if (child.ledger.turn !== 0 || child.ledger.card) return child

  return { ...child, ledger: parent.ledger }
}

/** Whether the inbox has recorded nothing of the session: no turn counted, no exchange waiting, an empty ledger. */
export function isUnseen(s: Session): boolean {
  const { ledger } = s

  return (
    s.presence.turnsStarted === 0 &&
    s.presence.ledgerState === 'current' &&
    s.pending.length === 0 &&
    ledger.card === null &&
    ledger.items.length === 0 &&
    ledger.findings.length === 0
  )
}

/** The pending exchange `p` stands for, which a catch-up that began with it covers. */
const pendingKey = (p: Session['pending'][number]) => `${p.turnsStarted}:${p.ex.turn}`

/**
 * Applies the model's answer to a catch-up over the whole conversation. `begun` is the session when the catch-up
 * began. The answer covers the exchanges pending then and the turns started then, whether or not it applied, so
 * an exchange that ended during the catch-up still waits. A catch-up that applied clears `failed`, including the
 * warning for a dropped reply.
 */
export function appliedCatchUp<S extends Session>(s: S, begun: Session, parsed: Update | null, now: number): S {
  const covered = new Set(begun.pending.map(pendingKey))

  return {
    ...s,
    ledger: parsed ? applyUpdate(s.ledger, parsed, now, s.ledger.turn) : s.ledger,
    pending: s.pending.filter(p => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed ? 'current' : 'failed',
      hasDroppedReply: parsed ? false : s.presence.hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted),
    },
  }
}

export type Pressed = Exclude<Applied, { stale: true }>

export function pressOn(
  s: Session,
  p: RowPress | PrPress,
  at: number,
  localPressId?: string,
  answerMessage?: AnswerMessage,
): Pressed | { stale: true } {
  const ctx = { now: at, turnsStarted: s.presence.turnsStarted, localPressId }
  if ('ref' in p) return applyPrPress(s.ledger, s.prViews, s.lastActions, p, ctx)
  const item = s.ledger.items.find(i => i.id === p.id)
  const r = applyPress(s.ledger, s.lastActions[p.id], p, {
    ...ctx,
    extraSteps: item ? itemPrSteps(item, s.prViews, s.ledger.prs) : [],
    answerMessage,
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

/** Applies a `record` or `close` call from the agent to the ledger. `result` is the tool's answer. */
export function recorded<S extends Session>(
  host: Host,
  s: S,
  tool: 'record' | 'close',
  args: Record<string, unknown>,
  now: number,
): { state: S; result: string } {
  const r = (tool === 'close' ? recordClose : recordItem)(host, s.ledger, args, now)

  return { state: { ...s, ledger: r.ledger }, result: r.result }
}

/** Merges fetched PRs into the session. A view stays while `keepsView` keeps it or its dismissal is still showing. */
export function withFetchedPrs<S extends Session>(
  s: S,
  fetched: PrViews['views'],
  branchRef: string | null,
  at: number,
): S {
  const merged = { views: { ...s.prViews.views, ...fetched }, branchRef, isFetching: false }
  const views = Object.fromEntries(
    Object.entries(merged.views).filter(
      ([ref]) => keepsView(merged, s.ledger.prs, ref) || isDismissing(s.lastActions, ref, at),
    ),
  )

  return { ...s, prViews: { ...merged, views } }
}

type PrTab = {
  drawn: { pr: PrView; isSettled: boolean }[]
  branchRef: string | null
  /** How many open PRs wait on the person. */
  count: number
  /** Names the linked PRs too old for the tab to show, or null. */
  olderText: string | null
}

export type SessionView = InboxView & {
  /** Each row's last press, by row id, which a look reads for its PR rows and blocks. */
  lastActions: Record<string, LastAction>
  /** The turn counts each row's feedback reads, as "Explaining…" until the reply to its press. */
  turns: Turns
  prs: PrTab
}

function withoutStalePending(lastActions: Record<string, LastAction>, now: number): Record<string, LastAction> {
  const isStale = (last: LastAction) => last.result?.state === 'pending' && now - last.result.at > PRESS_TIMEOUT_MS

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, last]) => {
      if (!isStale(last)) return [id, last]
      const { result: _result, ...rest } = last
      return [id, rest]
    }),
  )
}

/**
 * `canCatchUp` says whether the host can read the whole conversation. Its next update then retries a failed ledger,
 * even with no exchange waiting. A host that cannot retries only when an exchange is pending.
 */
export function sessionView(
  s: Session,
  now: number,
  settleWindowMs: number,
  canCatchUp: boolean,
  holds: ReplyHolds = NO_HOLDS,
  notes: Record<string, RowNote> = {},
): SessionView {
  const l = s.ledger
  const lastActions = withoutStalePending(s.lastActions, now)
  const update = {
    isUpdating: s.presence.isUpdating,
    isFailed: s.presence.ledgerState === 'failed',
    retries: canCatchUp || s.pending.length > 0,
  }

  return {
    ...inboxView({
      ledger: l,
      lastActions,
      notes,
      turns: s.presence,
      extraSteps: Object.fromEntries(l.items.map(item => [item.id, itemPrSteps(item, s.prViews, l.prs)])),
      settleWindowMs,
      status: perTurnStatus(update),
      now,
      ...holds,
    }),
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now),
  }
}

function prTabOf(s: Session, lastActions: Record<string, LastAction>, now: number): PrTab {
  const drawn = drawnPrs(s.prViews, s.ledger.prs, lastActions, now)
  const isSent = threadSentIn(lastActions)

  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter(d => !d.isSettled && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger.prs),
  }
}
