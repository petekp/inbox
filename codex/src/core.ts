// The plugin's session logic as pure functions on SessionState: what a prompt
// tells Codex, what the tab shows, and how a turn ends.
// Hooks and the MCP server do the I/O around them.

import { carryText, EMPTY, promptNotes, screenText, toolActivity } from '../../hooks/ledger'
import type { Exchange, Press } from '../../hooks/ledger'
import { inboxView, perTurnStatus } from '../../hooks/view'
import type { InboxView } from '../../hooks/view'
import type { LastAction } from '../../types'
import { SETTLE_WINDOW_MS } from './settle'
import type { SessionState } from './state'
import { CODEX, GUIDANCE, START_TITLE } from './texts'

/** The tab polls every few seconds; a poll this recent means it is open. */
const TAB_OPEN_MS = 15_000
const MAX_ACTIVITY = 40

export function isTabOpen(s: SessionState, now: number): boolean {
  return now - s.tabSeenAt < TAB_OPEN_MS
}

/**
 * What SessionStart gives Codex: the guidance, and where the session stands
 * when it has a ledger. A resumed conversation still holds the guidance from
 * its start, so it gets only where the session stands. Null when that is empty.
 */
export function startContext(s: SessionState, source: string | undefined): string | null {
  const carried = carryText(s.ledger, START_TITLE, true)
  const parts = [source === 'resume' ? null : GUIDANCE, carried].filter((x): x is string => x !== null)

  return parts.length > 0 ? parts.join('\n\n') : null
}

/** A cleared conversation starts a new ledger; the rest of the state stays. */
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
 */
export function notePrompt(s: SessionState, text: string, now: number): { state: SessionState; notes: string[] } {
  const sentAt = s.sent.findIndex(x => x.text === text)
  const sentBy: Press | null = sentAt >= 0 ? (s.sent[sentAt]?.press ?? null) : null
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 }
  const r = promptNotes(CODEX, ledger, { text, isPress: sentAt >= 0, isOpen: isTabOpen(s, now) }, s.told)
  const person = s.turn.person === null ? text : `${s.turn.person}\n\n${text}`

  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      sent: sentAt >= 0 ? s.sent.filter((_x, i) => i !== sentAt) : s.sent,
      turn: { ...s.turn, person, press: sentBy ?? s.turn.press },
      presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 },
    },
    notes: r.notes,
  }
}

export function noteActivity(s: SessionState, line: string | null): SessionState {
  const activity = s.turn.activity
  if (!line || activity.length >= MAX_ACTIVITY || activity.includes(line)) return s

  return { ...s, turn: { ...s.turn, activity: [...activity, line] } }
}

/** What the agent did with a tool, as an activity line: Codex's shell and MCP tools read as the mod's Bash and MCP tools. */
export function activityOf(tool: string, input: Record<string, unknown>): string | null {
  return toolActivity(tool === 'Bash' ? 'Bash' : tool, input)
}

/** The files a patch adds, updates or deletes, as written in it. */
export function patchFiles(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
    .map(m => (m[1] ?? '').trim())
    .filter(Boolean)
}

/** Ends the turn: the exchange waits for the inbox model. */
export function endTurn(s: SessionState, reply: string, now: number): SessionState {
  const base = { ...s, turn: { person: null, activity: [], press: null } }
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

/** What the tab draws: the shared inbox view, and what only the tab reads. */
export type View = InboxView & {
  goal: string
  now: string
  done: string[]
  running: string[]
  /** Each row's last press, by row id. The tab draws from each row's feedback; a tab loaded before that still reads this. */
  lastActions: Record<string, LastAction>
  /** When the view was drawn, for the rows' ages. */
  at: number
}

/**
 * The view as the server sends it to the tab, with the session the call came
 * from. The tab sends `thread` back with each press, which reads as stale in any other session.
 */
export type TabView = View & { thread: string }

/** What the tab draws. */
export function viewOf(s: SessionState, now: number): View {
  const l = s.ledger
  // Exchanges waiting for the inbox model will still change the list, so they read as updating.
  const update = {
    isUpdating: s.presence.isUpdating || s.pending.length > 0,
    isFailed: s.presence.ledgerState === 'failed',
    // applied() drops a failed exchange; nothing reruns it.
    retries: false,
  }

  return {
    ...inboxView({
      ledger: l,
      lastActions: s.lastActions,
      // The tab keeps its own row notes.
      notes: {},
      turns: s.presence,
      extraSteps: {},
      // The tab times each settled row from its first poll, so the server lists a close for longer.
      settleWindowMs: SETTLE_WINDOW_MS,
      status: perTurnStatus(l, update),
      now,
    }),
    goal: l.card?.goal ?? '',
    now: l.card?.now ?? '',
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    lastActions: s.lastActions,
    at: now,
  }
}
