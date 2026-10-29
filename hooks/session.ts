import { linkDialogs } from './dialogs'
import {
  applyExchangeUpdate,
  applyUpdate,
  closedAt,
  EMPTY,
  isBlankLedger,
  KEPT_SESSIONS,
  parseReply,
  pruneClosed,
  upgradeLedger,
} from './ledger'
import type { Exchange, Press, Update } from './ledger'
import { addActivity, carryText, guidanceText, promptNotes, screenText, START_TITLE, TOLD_NOTHING } from './model-text'
import type { Host, ScreenTab, Told } from './model-text'
import {
  applyPrPress,
  drawnPrs,
  isViewKept,
  itemPrSteps,
  olderPrsText,
  linkedPrs,
  pressRowId,
  threadSentIn,
} from './pr-tab'
import type { Applied, DrawnPr, PrPress } from './pr-tab'
import {
  actionId,
  applyPress,
  upgradeLastActions,
  withAcceptedSend,
  withArrival,
  withRewrite,
  withUnconfirmed,
} from './presses'
import type { PressTexts, RowPress } from './presses'
import { prNeedsYou, prRefs } from './prs'
import { recordClose, recordItem } from './tools'
import type { ToolAnswer } from './tools'
import { upgradeHostTasks } from './host-tasks'
import { applyStatus, lookEnded, lookStarted } from './status'
import type { StatusAnswer } from './status'
import {
  allRows,
  inboxView,
  isShownSince,
  NO_HOLDS,
  outAction,
  statusPage,
  perTurnStatus,
  pressFeedbackIn,
} from './view'
import type { InboxView, StatusPage, Holds, RowState } from './view'
import type {
  LastAction,
  Ledger,
  SessionStatus,
  StatusFailure,
  PrView,
  PrViews,
  RowNote,
  Session,
  Stop,
  Turns,
  TurnDialogQuestion,
} from '../types'

export type { Session } from '../types'

const NO_PRS: PrViews = { views: {}, branchRef: null, isFetching: false }

export const NO_TURN: Session['turn'] = { person: null, trigger: null, activity: [], press: null }

export function emptySession(): Session {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: {
      turnsStarted: 0,
      turnsApplied: 0,
      ledgerState: 'current',
      hasDroppedReply: false,
      isUpdating: false,
      isTurnRunning: false,
      turnStartedAt: null,
      lastReplyAt: null,
      lastTypedMessageAt: null,
    },
    place: null,
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    lastOverviewCallAt: null,
    hostTasks: [],
    dialogQuestions: [],
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
export type SavedSession = Partial<
  Omit<Session, 'turn' | 'told' | 'presence' | 'sent' | 'prViews' | 'dialogQuestions'>
> & {
  turn?: Partial<Session['turn']>
  /** Codex saved its dialog questions with no descriptions. */
  dialogQuestions?: (Omit<TurnDialogQuestion, 'descriptions'> & Partial<Pick<TurnDialogQuestion, 'descriptions'>>)[]
  told?: Partial<Told>
  presence?: Partial<Session['presence']>
  sent?: (Pick<Session['sent'][number], 'text' | 'press' | 'at'> & Partial<Session['sent'][number]>)[]
  prViews?: Partial<PrViews>
}

/** A saved presence without `statedStep`, which a build of the Progress tab saved and nothing reads. */
function withoutStatedStep(presence: SavedSession['presence']): SavedSession['presence'] {
  const { statedStep: _statedStep, ...rest } = (presence ?? {}) as Partial<Session['presence']> & {
    statedStep?: unknown
  }

  return rest
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
    presence: { ...base.presence, ...withoutStatedStep(saved.presence) },
    place: saved.place ?? null,
    pending: (saved.pending ?? []).map(p => ({ ...p, ex: { ...p.ex, tasks: p.ex.tasks ?? [] } })),
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
    shownSince: saved.shownSince ?? null,
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
    overviewFailure: saved.overviewFailure ?? null,
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map(q => ({ ...q, descriptions: q.descriptions ?? {} })),
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
    hostTasks: [],
    ledger: EMPTY,
    turn: NO_TURN,
    told: { inbox: null, closed: [] },
    pending: [],
    presence: {
      ...s.presence,
      ledgerState: 'current',
      hasDroppedReply: false,
      turnsApplied: s.presence.turnsStarted,
      isTurnRunning: false,
    },
    lastActions: {},
    stop: null,
    overviewFailure: null,
    lastOverviewCallAt: null,
  }
}

/** A message a press sent, matched to a prompt that arrived. `press` is null for a message no row press sent. */
export type SentBy = { press: Press | null }

/**
 * Records a prompt that arrived and returns what the agent reads beside it, and the press that sent it, if one did.
 * A host that tells its own sends apart from the person's words calls the parts below instead.
 */
export function notePrompt<S extends Session>(
  host: Host,
  s: S,
  text: string,
  isOpen: boolean,
): { state: S; notes: string[]; sentBy: SentBy | null } {
  const matched = matchSent(s, text)

  return { ...recordPrompt(host, startTurn(matched.state), text, isOpen, matched.sentBy), sentBy: matched.sentBy }
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

/**
 * Marks the main agent's turn as running since `at`, or since a time the host did not say. A subagent's turn does not
 * call it. A turn already running keeps the start it has.
 */
export function turnStarted<S extends Session>(s: S, at: number | null): S {
  const startedAt = s.presence.isTurnRunning ? (s.presence.turnStartedAt ?? at) : at

  return { ...s, presence: { ...s.presence, isTurnRunning: true, turnStartedAt: startedAt } }
}

/** Marks the main agent's turn as ended at `at`, or at a time the host did not say. */
export function turnEnded<S extends Session>(s: S, at: number | null): S {
  const lastReplyAt = at ?? s.presence.lastReplyAt

  return { ...s, presence: { ...s.presence, isTurnRunning: false, turnStartedAt: null, lastReplyAt } }
}

/**
 * Notes that the person sent a message they typed, at `at`. A host calls it only for a message the person typed, never
 * for one a press sent. The rows that settled before it fold, as `hooks/view.ts:isSettledInPlace` says.
 */
export function messageTyped<S extends Session>(s: S, at: number): S {
  return { ...s, presence: { ...s.presence, lastTypedMessageAt: at } }
}

/**
 * A reload or a quit can cut off a turn's end, so at load no turn runs. A turn the agent still runs sets it again at
 * its next start.
 */
export function cutOffTurn<S extends Session>(s: S): S {
  return s.presence.isTurnRunning ? turnEnded(s, null) : s
}

/** The session with the folder it started in, kept from the first time a host names it, and the branch it is on now. */
export function placed<S extends Session>(s: S, folder: string, branch: string | null): S {
  const place = { folder: s.place?.folder || folder, branch: branch === 'HEAD' ? null : branch }
  const isSame = s.place?.folder === place.folder && s.place.branch === place.branch

  return isSame ? s : { ...s, place }
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
  { tab = null, queuesEmptyReply = false }: { tab?: ScreenTab | null; queuesEmptyReply?: boolean } = {},
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
    tasks: s.hostTasks,
  }

  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] }
}

/** The model's answer for `ex`, parsed. Null when there is no answer or it cannot be read. */
export function parsedReply(ex: Exchange, reply: string | null): Update | null {
  return reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join('\n'))
}

/**
 * Applies the model's parsed answer for the oldest pending exchange, and drops that exchange. An answer that could not
 * be read is null: an exchange whose first update failed stays pending, marked failed, for the next update to try
 * again. The Status call's answer goes in separately, through `appliedStatus`.
 */
export function applied<S extends Session>(s: S, parsed: Update | null, now: number, promptAt: number): S {
  const next = s.pending[0]
  if (!next) return s
  const { ex } = next
  if (!parsed && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: 'failed' },
    }
  const ledger = parsed ? applyExchangeUpdate(s.ledger, parsed, ex, now, promptAt) : s.ledger
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed

  return linkDialogs({
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: hasDroppedReply ? 'failed' : 'current',
      hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted),
    },
  })
}

/**
 * Writes the Status call's answer for an update that is already applied. `appliedAfter` is the session's
 * `turnsApplied` when the update landed. The answer is dropped when the session now has fewer applied turns than that:
 * it was replaced by one that never applied this update.
 */
export function appliedStatus<S extends Session>(s: S, answer: StatusAnswer, appliedAfter: number, now: number): S {
  if (s.presence.turnsApplied < appliedAfter) return s

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: applyStatus(s.ledger.overview, answer, now, new Set(s.ledger.items.map(i => i.id))),
    },
    overviewFailure: null,
    lastOverviewCallAt: now,
  }
}

/** How much of a refused Status answer a failure keeps. */
const REFUSED_ANSWER_CHARS = 500

/**
 * Saves why the Status call for an applied update wrote nothing: `text` is its last answer, or null when it gave
 * none. `appliedAfter` drops the failure as `appliedStatus` drops an answer.
 */
export function failedStatus<S extends Session>(s: S, text: string | null, appliedAfter: number, now: number): S {
  if (s.presence.turnsApplied < appliedAfter) return s
  const failure: StatusFailure =
    text === null
      ? { at: now, cause: 'no-answer', answer: null }
      : { at: now, cause: 'refused', answer: text.slice(0, REFUSED_ANSWER_CHARS) }

  return { ...s, overviewFailure: failure, lastOverviewCallAt: now }
}

/** How long a running turn goes between Status calls. */
export const STATUS_REFRESH_MS = 10 * 60_000

/**
 * The session with a Status call claimed for the running turn, when `STATUS_REFRESH_MS` has passed since the
 * last Status call and since the turn started. Unchanged otherwise, so a host that gets a new session back runs the
 * call, and two events in a row claim it once.
 */
export function claimedStatusRefresh<S extends Session>(s: S, now: number): S {
  const { isTurnRunning, turnStartedAt } = s.presence
  const times = [s.lastOverviewCallAt, turnStartedAt].filter((t): t is number => t !== null)
  const isDue = isTurnRunning && times.length > 0 && now - Math.max(...times) >= STATUS_REFRESH_MS

  return isDue ? { ...s, lastOverviewCallAt: now } : s
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

/** The Status tab is shown: a look starts. */
export function lookStartedOn<S extends { ledger: Ledger }>(s: S, now: number): S {
  return statusChanged(s, o => lookStarted(o, now))
}

/** The Status tab stopped being shown at `at`: the look ends. */
export function lookEndedOn<S extends { ledger: Ledger }>(s: S, at: number): S {
  return statusChanged(s, o => lookEnded(o, at))
}

/** The session with its Status after `change`, or the same session when the Status did not change. */
export function statusChanged<S extends { ledger: Ledger }>(
  s: S,
  change: (o: SessionStatus | null) => SessionStatus | null,
): S {
  const overview = change(s.ledger.overview)

  return overview === s.ledger.overview ? s : { ...s, ledger: { ...s.ledger, overview } }
}

/** Starts a look while the Status is shown, and ends it otherwise. */
export function withLook<S extends { ledger: Ledger }>(s: S, isStatusShown: boolean, now: number): S {
  return isStatusShown ? lookStartedOn(s, now) : lookEndedOn(s, now)
}

/** Whether the session has anything recorded: an applied update, an item, a finding or a Status. */
export function hasLedger(s: Session): boolean {
  return !isBlankLedger(s.ledger)
}

/**
 * A forked conversation continues its parent's ledger: items, findings, Status and closed records, and the agent's task list. It takes
 * nothing else, since presses, queued messages, the stop and the running turn belong to the parent. A fork that
 * already has turns or a Status keeps its own.
 */
export function forkedFrom<S extends Session>(child: S, parent: Session): S {
  if (!isBlankLedger(child.ledger)) return child

  return { ...child, ledger: parent.ledger, hostTasks: parent.hostTasks }
}

/** Whether the inbox has recorded nothing of the session: no turn counted, no exchange waiting, an empty ledger. */
export function isUnseen(s: Session): boolean {
  const { ledger } = s

  return (
    s.presence.turnsStarted === 0 &&
    s.presence.ledgerState === 'current' &&
    s.pending.length === 0 &&
    isBlankLedger(ledger)
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

  return linkDialogs({
    ...s,
    ledger: parsed ? applyUpdate(s.ledger, parsed, now, s.ledger.turn, now) : s.ledger,
    pending: s.pending.filter(p => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed ? 'current' : 'failed',
      hasDroppedReply: parsed ? false : s.presence.hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted),
    },
  })
}

export type Pressed = Exclude<Applied, { stale: true }>

/** What a look draws a session's rows with besides the session: how long Undo lasts, and what the look holds in place. */
export type DrawnWith = { settleWindowMs: number; holds: Holds }

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
  if ('ref' in p) return applyPrPress(s.ledger, s.prViews, s.lastActions, p, ctx)
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
 * Applies a `record` or `close` call from the agent to the ledger. `result` is the tool's answer, and `personLine` the
 * line the person sees under the call, as `hooks/tools.ts:ToolAnswer` says.
 */
export function recorded<S extends Session>(
  host: Host,
  s: S,
  tool: 'record' | 'close',
  args: Record<string, unknown>,
  now: number,
): { state: S } & Omit<ToolAnswer, 'ledger'> {
  const r = (tool === 'close' ? recordClose : recordItem)(host, s.ledger, args, now)

  return { state: linkDialogs({ ...s, ledger: r.ledger }), result: r.result, personLine: r.personLine }
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
      isViewKept(s.prViews, s.ledger.prs, s.lastActions, ref, s.shownSince),
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
 * Merges fetched PRs into the session. The write that saves it drops, through `pruned`, each view no look draws.
 * `isGhSignedOut` is null when no gh run answered, and the saved one stands.
 */
export function withFetchedPrs<S extends Session>(
  s: S,
  fetched: PrViews['views'],
  branchRef: string | null,
  isGhSignedOut: boolean | null,
): S {
  const isSignedOut = isGhSignedOut ?? s.prViews.isGhSignedOut === true

  return {
    ...s,
    prViews: {
      views: { ...s.prViews.views, ...fetched },
      branchRef,
      isFetching: false,
      ...(isSignedOut ? { isGhSignedOut: true } : {}),
    },
  }
}

type PrTab = {
  drawn: DrawnPr[]
  branchRef: string | null
  /** How many open PRs wait on the person. */
  count: number
  /** Names the linked PRs too old for the tab to show, or null. */
  olderText: string | null
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
 * `canCatchUp` says whether the host can read the whole conversation. Its next update then retries a failed ledger,
 * even with no exchange waiting. A host that cannot retries only when an exchange is pending.
 */
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
  const update = {
    isUpdating: s.presence.isUpdating,
    isFailed: s.presence.ledgerState === 'failed',
    retries: canCatchUp || s.pending.length > 0,
  }

  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map(item => [item.id, itemPrSteps(item, s.prViews, l.prs)])),
    settleWindowMs,
    status: perTurnStatus(update),
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

function prTabOf(
  s: Session,
  lastActions: Record<string, LastAction>,
  now: number,
  shownSince: number | null,
  settleWindowMs: number,
): PrTab {
  const drawn = drawnPrs(s.prViews, s.ledger.prs, lastActions, now, settleWindowMs, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
  })
  const isSent = threadSentIn(lastActions)

  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter(d => d.state.is === 'open' && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger.prs),
    isGhSignedOut: s.prViews.isGhSignedOut === true,
  }
}
