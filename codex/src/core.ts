// The plugin's session logic as pure functions on SessionState: what a prompt
// tells Codex, what a press does, what the tab shows, and how a turn ends.
// Hooks and the MCP server do the I/O around them.

import { carryText, closeItem, EMPTY, isLapsed, promptNotes, screenText, toolActivity } from '../../hooks/ledger'
import type { Exchange, Press } from '../../hooks/ledger'
import { isHandedOff, messages, steps } from '../../hooks/presses'
import type { Item } from '../../types'
import type { LastAction, SessionState } from './state'
import { CODEX, GUIDANCE, START_TITLE } from './texts'

/** The tab polls every few seconds; a poll this recent means it is open. */
const TAB_OPEN_MS = 15_000
/** How long a row the press removed shows its last action in its place. */
export const SETTLED_MS = 5120
/** How many recently closed items each Needs you group lists. */
const CLOSED_SHOWN = 3
const MAX_ACTIVITY = 40
const MAX_SENT = 20

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

/** A press from the tab. */
export type TabPress =
  | { action: 'answer'; id: string; option: number }
  | { action: 'type'; id: string; text: string }
  | { action: 'explain'; id: string }
  | { action: 'done'; id: string }
  | { action: 'dismiss'; id: string }
  | { action: 'step'; id: string; step: number }
  | { action: 'address'; id: string }
  | { action: 'discuss'; id: string }
  | { action: 'dismissFinding'; id: string }
  | { action: 'typedFinding'; id: string; text: string }

/** What a press asks the server to do besides changing the state. */
export type Effect =
  | { kind: 'send'; text: string; press: Press | null }
  | { kind: 'open'; target: string }
  | { kind: 'copy'; text: string; name: string }

function withLast(s: SessionState, id: string, last: Omit<LastAction, 'at'>, now: number): SessionState {
  return { ...s, lastActions: { ...s.lastActions, [id]: { ...last, at: now } } }
}

function sent(s: SessionState, text: string, press: Press | null, now: number): SessionState {
  return { ...s, sent: [...s.sent, { text, press, at: now }].slice(-MAX_SENT) }
}

/**
 * Applies a press. Returns the new state and what the server must do: send a
 * message as the person's, open a file or page, or hand text to copy. Null
 * when the press's row is gone, as when another tab or Codex closed it.
 */
export function press(s: SessionState, p: TabPress, now: number): { state: SessionState; effects: Effect[] } | null {
  const send = (state: SessionState, text: string, by: Press | null) => ({
    state: sent(state, text, by, now),
    effects: [{ kind: 'send' as const, text, press: by }],
  })
  if (
    p.action === 'address' ||
    p.action === 'discuss' ||
    p.action === 'dismissFinding' ||
    p.action === 'typedFinding'
  ) {
    const finding = s.ledger.findings.find(f => f.id === p.id)
    if (!finding) return null
    const removed = { ...s, ledger: { ...s.ledger, findings: s.ledger.findings.filter(f => f.id !== p.id) } }
    if (p.action === 'dismissFinding') return { state: removed, effects: [] }
    const words = p.action === 'typedFinding' ? p.text.trim() : ''
    if (p.action === 'typedFinding' && !words) return null
    const how = p.action === 'typedFinding' ? 'typed' : p.action
    const text =
      how === 'address'
        ? finding.kind === 'issue'
          ? 'Sent to Codex to fix'
          : 'Sent to Codex to act on'
        : how === 'discuss'
          ? 'Discuss sent'
          : 'Reply sent'

    return send(
      withLast(removed, p.id, { action: p.action, text, title: finding.title }, now),
      messages.finding(finding, how, words),
      null,
    )
  }
  const item = s.ledger.items.find(i => i.id === p.id)
  if (!item) return null
  const close = (outcome: string, how: 'answered' | 'done' | 'dismissed') => ({
    ...s,
    ledger: closeItem(s.ledger, item.id, { how, outcome }, now),
  })
  switch (p.action) {
    case 'answer': {
      const answer = item.options[p.option]
      if (answer === undefined) return null
      return send(close(answer, 'answered'), messages.answer(item, answer), { id: item.id, action: 'answer' })
    }
    case 'type': {
      const words = p.text.trim()
      if (!words) return null
      if (item.kind === 'question')
        return send(close(words, 'answered'), messages.answer(item, words), { id: item.id, action: 'answer' })
      const last = { action: 'typed', text: 'Reply sent', isHandoff: true, turnsStarted: s.presence.turnsStarted }
      return send(withLast(s, item.id, last, now), messages.taskReply(item, words), null)
    }
    case 'explain':
      return send(withLast(s, item.id, { action: 'explain', text: 'Explain sent' }, now), messages.explain(item), {
        id: item.id,
        action: 'explain',
      })
    case 'done':
      return { state: close('done', 'done'), effects: [] }
    case 'dismiss':
      return { state: close('dismissed', 'dismissed'), effects: [] }
    case 'step': {
      const found = steps(item.helps)[p.step]
      if (!found) return null
      const effects: Effect[] = []
      let state = s
      for (const help of found.step) {
        if (help.kind === 'run') {
          const text = messages.run(item, help.command)
          state = sent(state, text, { id: item.id, action: 'run' }, now)
          effects.push({ kind: 'send', text, press: { id: item.id, action: 'run' } })
        } else if (help.kind === 'open') effects.push({ kind: 'open', target: help.path })
        else if (help.kind === 'link') effects.push({ kind: 'open', target: help.url })
        else if (help.kind === 'copy') effects.push({ kind: 'copy', text: help.text, name: help.name ?? 'snippet' })
        else effects.push({ kind: 'copy', text: help.command, name: help.name ?? 'the command' })
      }
      if (found.step.some(h => h.kind === 'run'))
        state = withLast(
          state,
          item.id,
          {
            action: `step-${p.step}`,
            text: `${found.label} sent`,
            isHandoff: true,
            turnsStarted: s.presence.turnsStarted,
          },
          now,
        )

      return { state, effects }
    }
  }
}

/** One row of the tab. */
export type ItemRow = {
  id: string
  kind: Item['kind']
  ask: string
  label: string | null
  options: { text: string; isRec: boolean }[]
  steps: string[]
  at: number | null
  last: LastAction | null
  isHandedOff: boolean
}

export type ClosedRow = {
  id: string
  kind: Item['kind']
  ask: string
  outcome: string
  /** Closed without the person deciding it: dismissed, expired, or overtaken by the work. */
  isLapsed: boolean
  at: number
}

export type View = {
  goal: string
  now: string
  done: string[]
  running: string[]
  updating: boolean
  failed: boolean
  /** When the per-reply update last changed the summary; null before the first. */
  updatedAt: number | null
  /** How many things wait on the person: questions, and tasks not handed to Codex. */
  waiting: number
  questions: ItemRow[]
  tasks: ItemRow[]
  findings: {
    id: string
    kind: 'issue' | 'opportunity'
    title: string
    detail: string
    path: string | null
    at: number
    last: LastAction | null
  }[]
  /** Findings a press removed in the last few seconds, shown in their place with what was sent. */
  leaving: { id: string; title: string; text: string; at: number }[]
  /** Each group's latest closed items, newest first. */
  closed: ClosedRow[]
  /** When the view was drawn, for the rows' ages. */
  at: number
}

/** What the tab draws. */
export function viewOf(s: SessionState, now: number): View {
  const l = s.ledger
  const row = (i: Item): ItemRow => ({
    id: i.id,
    kind: i.kind,
    ask: i.ask,
    label: i.label,
    options: i.options.map(o => ({ text: o, isRec: o === i.rec })),
    steps: steps(i.helps).map(x => x.label),
    at: i.at,
    last: s.lastActions[i.id] ?? null,
    isHandedOff: i.kind === 'task' && isHandedOff(s.lastActions[i.id], s.presence),
  })
  const questions = l.items
    .filter(i => i.kind === 'question')
    .sort((a, b) => b.turn - a.turn)
    .map(row)
  const tasks = l.items.filter(i => i.kind === 'task').map(row)
  const open = new Set(l.findings.map(f => f.id))

  return {
    goal: l.card?.goal ?? '',
    now: l.card?.now ?? '',
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    updating: s.presence.isUpdating || s.pending.length > 0,
    failed: s.presence.ledgerState === 'failed',
    updatedAt: l.card?.updatedAt ?? null,
    waiting: questions.length + tasks.filter(t => !t.isHandedOff).length,
    questions,
    tasks,
    findings: l.findings.map(f => ({ ...f, last: s.lastActions[f.id] ?? null })),
    leaving: Object.entries(s.lastActions)
      .filter(([id, a]) => a.title !== undefined && !open.has(id) && now - a.at < SETTLED_MS)
      .map(([id, a]) => ({ id, title: a.title ?? '', text: a.text, at: a.at })),
    closed: (['question', 'task'] as const).flatMap(kind =>
      l.closed
        .filter(d => d.kind === kind)
        .slice(-CLOSED_SHOWN)
        .reverse()
        .map(d => ({ id: d.id, kind, ask: d.ask, outcome: d.outcome, isLapsed: isLapsed(d), at: d.at })),
    ),
    at: now,
  }
}
