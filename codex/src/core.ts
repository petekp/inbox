import { EMPTY } from '../../hooks/ledger'
import { clipLabel } from '../../hooks/text'
import type { Exchange, Press } from '../../hooks/ledger'
import {
  addActivity,
  carryText,
  guidanceText,
  promptNotes,
  screenText,
  START_TITLE,
  toolActivity,
} from '../../hooks/model-text'
import { inboxView, mapView, NO_HOLDS, perTurnStatus } from '../../hooks/view'
import type { InboxView, MapView, ReplyHolds } from '../../hooks/view'
import { drawnPrs, itemPrSteps, linkedPrs, olderPrsText, threadSentIn } from '../../hooks/pr-tab'
import { withArrival, withUnconfirmed } from '../../hooks/presses'
import { prNeedsYou, prRefs } from '../../hooks/prs'
import type { LastAction, PrView, Subagent, Turns } from '../../types'
import { PRESS_TIMEOUT_MS, SETTLE_WINDOW_MS } from './settle'
import type { Heard, SessionState } from './state'
import { CODEX } from './texts'

const TAB_OPEN_MS = 15_000

export function isTabOpen(s: SessionState, now: number): boolean {
  return now - s.tabSeenAt < TAB_OPEN_MS
}

/**
 * A resumed conversation still holds the guidance from
 * its start, so it gets only where the session stands. Null when that is empty.
 */
export function startContext(s: SessionState, source: string | undefined): string | null {
  const carried = carryText(s.ledger, START_TITLE)
  const parts = [source === 'resume' ? null : guidanceText(CODEX), carried].filter((x): x is string => x !== null)

  return parts.length > 0 ? parts.join('\n\n') : null
}

const SUBAGENT_RESULT_MAX = 80

/** Codex hands a subagent its task encrypted, so its row reads the spawn call's task name instead. */
function taskLabel(taskName: string): string {
  const words = taskName.replace(/^.*\//, '').replace(/[_-]+/g, ' ').trim()

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Subagent'
}

/** SubagentStart names only the agent's id, so the task name of a spawn that returned waits for it. */
export function noteSpawn(s: SessionState, taskName: string): SessionState {
  return { ...s, spawnedTasks: [...s.spawnedTasks, taskLabel(taskName)] }
}

export function startSubagent(s: SessionState, agentId: string, now: number): SessionState {
  const [task = 'Subagent', ...spawnedTasks] = s.spawnedTasks
  const started: Subagent = { id: agentId, task, state: 'running', step: null, result: null, startedAt: now, at: now }

  return { ...s, spawnedTasks, subagents: [...s.subagents.filter(x => x.id !== agentId), started] }
}

export function withSubagentChange(
  s: SessionState,
  agentId: string,
  change: Partial<Pick<Subagent, 'state' | 'step' | 'result'>>,
  now: number,
): SessionState {
  if (!s.subagents.some(x => x.id === agentId)) return s

  return { ...s, subagents: s.subagents.map(x => (x.id === agentId ? { ...x, ...change, at: now } : x)) }
}

export function subagentResult(reply: string | null | undefined): string | null {
  const line = (reply ?? '').trim().split('\n')[0] ?? ''

  return line ? clipLabel(line, SUBAGENT_RESULT_MAX) : null
}

/** Drops the subagents that finished by `before`, and spawn task names no SubagentStart claimed. */
export function withoutSubagentsBefore(s: SessionState, before: number): SessionState {
  return { ...s, spawnedTasks: [], subagents: s.subagents.filter(x => x.state === 'running' || x.at > before) }
}

export function cleared(s: SessionState): SessionState {
  return {
    ...s,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null },
    told: { inbox: null, closed: [] },
    pending: [],
    lastActions: {},
  }
}

/**
 * Records a prompt and returns what Codex reads beside it: the questions a
 * numbered answer refers to, and the inbox when it changed. A message the
 * tab sent is matched by its text, since UserPromptSubmit carries only that.
 * An uncertain earlier attempt blocks a same-text match with a later send.
 */
export function notePrompt(s: SessionState, text: string, now: number): { state: SessionState; notes: string[] } {
  const matchingAt = s.sent.findIndex(x => x.text === text)
  const matching = matchingAt >= 0 ? s.sent[matchingAt] : undefined
  const sentAt = matching && (matching.phase === undefined || matching.phase === 'accepted') ? matchingAt : -1
  const sentBy: Press | null = sentAt >= 0 ? (s.sent[sentAt]?.press ?? null) : null
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
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 }
  const r = promptNotes(CODEX, ledger, { text, isPress: sentAt >= 0, isOpen: isTabOpen(s, now) }, s.told)
  const person = s.turn.person === null ? text : `${s.turn.person}\n\n${text}`

  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      lastActions,
      sent: sentAt >= 0 ? s.sent.filter((_x, i) => i !== sentAt) : s.sent,
      turn: { ...s.turn, person, press: sentBy ?? s.turn.press },
      presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 },
    },
    notes: r.notes,
  }
}

export function noteActivity(s: SessionState, line: string | null): SessionState {
  const activity = addActivity(s.turn.activity, line)
  if (activity === s.turn.activity) return s

  return { ...s, turn: { ...s.turn, activity } }
}

export function activityOf(tool: string, input: Record<string, unknown>): string | null {
  return toolActivity(tool, input)
}

export function patchFiles(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
    .map(m => (m[1] ?? '').trim())
    .filter(Boolean)
}

export function endTurn(s: SessionState, reply: string, now: number): SessionState {
  const refs = prRefs(reply)
  const base = {
    ...s,
    ledger: refs.length > 0 ? { ...s.ledger, prs: linkedPrs(s.ledger.prs, refs) } : s.ledger,
    turn: { person: null, activity: [], press: null },
  }
  if (reply.trim() === '') return base
  const ex: Exchange = {
    person: s.turn.person,
    trigger: s.turn.person === null ? 'unknown' : null,
    activity: s.turn.activity,
    reply,
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(CODEX, isTabOpen(s, now), null),
  }

  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] }
}

const MAX_PROMPT_TURNS = 10

export function noteHook(
  s: SessionState,
  hook: 'start' | 'prompt' | 'stop',
  now: number,
  turnId?: string,
): SessionState {
  const h = s.heard
  const heard: Heard =
    hook === 'start'
      ? { ...h, startAt: now }
      : hook === 'prompt'
        ? {
            ...h,
            promptAt: now,
            prompts: h.prompts + 1,
            promptTurns: turnId
              ? [...h.promptTurns.filter(t => t !== turnId), turnId].slice(-MAX_PROMPT_TURNS)
              : h.promptTurns,
          }
        : { ...h, stopAt: now, stops: h.stops + 1 }

  return { ...s, heard }
}

/**
 * Another plugin's Stop hook can send Codex back within the same turn, so the
 * turn ids decide.
 */
export function isPromptMissed(h: Heard, turnId: string | null): boolean {
  if (turnId !== null && (h.promptTurns.length > 0 || h.promptAt === null)) return !h.promptTurns.includes(turnId)

  return h.promptAt === null || (h.stopAt !== null && h.promptAt < h.stopAt)
}

export function noteToolCall(s: SessionState, turnId: string | null, now: number): SessionState {
  return isPromptMissed(s.heard, turnId) ? { ...s, heard: { ...s.heard, promptMissedAt: now } } : s
}

/**
 * Whether the session's hooks are running: `none` when no hook ran, `partial`
 * when SessionStart did not run but another hook did, when UserPromptSubmit
 * missed a turn since it last ran, or when it recorded two turns and Stop none,
 * so no reply reaches the inbox model.
 */
export type HeardState = 'heard' | 'none' | 'partial'

export function heardState(h: Heard): HeardState {
  if (h.startAt === null && h.promptAt === null && h.stopAt === null) return 'none'
  const isMissed = h.promptMissedAt !== null && (h.promptAt === null || h.promptMissedAt >= h.promptAt)
  // Prompts in one turn, such as a steer, share its turn id. A prompt with no turn id counts on its own.
  const turns = h.promptTurns.length > 0 ? h.promptTurns.length : h.prompts

  return h.startAt === null || isMissed || (turns >= 2 && h.stops === 0) ? 'partial' : 'heard'
}

export type PrTab = {
  drawn: { pr: PrView; isSettled: boolean }[]
  branchRef: string | null
  /** How many open PRs wait on the person. */
  count: number
  /** Names the linked PRs too old for the tab to show, or null. */
  olderText: string | null
}

export type View = InboxView & {
  heard: HeardState
  /** Each row's last press, by row id, which the tab reads for its PR rows and blocks. */
  lastActions: Record<string, LastAction>
  /** The turn counts each row's feedback reads, as "Explaining…" until the reply to its press. */
  turns: Turns
  prs: PrTab
  map: MapView
  at: number
}

/**
 * The tab sends `thread` back with each press, which reads as stale in any other session.
 * `devPage` is the address of the page the server serves now. A tab showing another page replaces itself with it.
 * Tabs open from older builds read it by this name.
 * `serverBuild` is the fingerprint build.mjs stamped into the running server. `serverLoadError` says why a newer
 * build of the server did not load. `isPluginFolderGone` says the server found no installed copy of itself, as after
 * an uninstall.
 */
export type TabView = View & {
  thread: string
  devPage: string
  serverBuild?: string
  serverLoadError?: string
  isPluginFolderGone?: boolean
  isFetchingPrs: boolean
  isGhMissing: boolean
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

export function viewOf(s: SessionState, now: number, holds: ReplyHolds = NO_HOLDS): View {
  const l = s.ledger
  const lastActions = withoutStalePending(s.lastActions, now)
  const awaitsRetry = s.pending.length > 0 && (s.pending[0]?.failed === true || s.presence.ledgerState === 'failed')
  const update = {
    isUpdating: s.presence.isUpdating,
    isFailed: s.presence.ledgerState === 'failed',
    retries: awaitsRetry,
  }

  return {
    ...inboxView({
      ledger: l,
      lastActions,
      notes: {},
      turns: s.presence,
      extraSteps: Object.fromEntries(l.items.map(item => [item.id, itemPrSteps(item, s.prViews, l.prs)])),
      settleWindowMs: SETTLE_WINDOW_MS,
      status: perTurnStatus(update),
      now,
      ...holds,
    }),
    heard: heardState(s.heard),
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now),
    map: mapView(l, now, CODEX.agent, { isTurnRunning: s.presence.isTurnRunning, subagents: s.subagents }),
    at: now,
  }
}

function prTabOf(s: SessionState, lastActions: Record<string, LastAction>, now: number): PrTab {
  const drawn = drawnPrs(s.prViews, s.ledger.prs, lastActions, now)
  const isSent = threadSentIn(lastActions)

  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter(d => !d.isSettled && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.ledger.prs),
  }
}
