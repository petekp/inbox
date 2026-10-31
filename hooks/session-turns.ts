import { linkDialogs } from './dialogs'
import { EMPTY } from './ledger'
import { applyExchangeUpdate } from './ledger-update'
import { parseReply } from './reply-parse'
import type { Exchange, Press } from './ledger'
import type { Update } from './reply-parse'
import { addActivity } from './catch-up-text'
import { carryText, promptNotes, screenText, START_TITLE } from './inbox-text'
import { guidanceText } from './model-text'
import type { ScreenTab } from './inbox-text'
import type { Host } from './model-text'
import { linkedPrs } from './pr-fetch'
import { withArrival, withUnconfirmed } from './press-reducer'
import { prRefs } from './prs'
import type { Ledger, Session } from '../types'
import { NO_TURN } from './session-files'

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
function matchSent<S extends Session>(s: S, text: string): { state: S; sentBy: SentBy | null } {
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
 * for one a press sent. The rows that settled before it fold, as `hooks/timing.ts:isSettledInPlace` says.
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

const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[\w.-]+\.localhost)(?::\d+)?[^\s"'`)\]]*/g

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
