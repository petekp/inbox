// The plugin's session logic as pure functions on SessionState: what a prompt
// tells Codex, what a press does, what the tab shows, and how a turn ends.
// Hooks and the MCP server do the I/O around them.

import { checkKey, claimAgainst, dismissed, fixSent, needsYou, recorded, turnEnded } from '../../hooks/check-tracking'
import {
  checkLine,
  checkName,
  checkRun,
  checksIn,
  claimMessage,
  failureLines,
  fixMessage,
  readResult,
} from '../../hooks/checks'
import {
  addFinding,
  answerNote,
  carryText,
  closeByClaude,
  closedText,
  closeItem,
  CLOSED_BY_CLAUDE,
  EMPTY,
  toolActivity,
} from '../../hooks/ledger'
import type { Exchange, Press } from '../../hooks/ledger'
import type { Check, Help, Item, Ledger } from '../../types'
import type { LastAction, SessionState } from './state'
import { CLOSED_BY, GUIDANCE, inboxText, messages, screenText, START_TITLE } from './texts'

/** The tab polls every few seconds; a poll this recent means it is open. */
const TAB_OPEN_MS = 15_000
/** How long a row the press removed shows its last action in its place. */
export const SETTLED_MS = 5120
const MAX_ACTIVITY = 40
const MAX_SENT = 20
const MAX_RECORDED_RUNS = 400

export function isTabOpen(s: SessionState, now: number): boolean {
  return now - s.tabSeenAt < TAB_OPEN_MS
}

/** What SessionStart gives Codex: the guidance, and where the session stands when it has a ledger. */
export function startContext(s: SessionState): string {
  const carried = carryText(s.ledger, START_TITLE, true)

  return carried ? `${GUIDANCE}\n\n${carried}` : GUIDANCE
}

/** A cleared conversation starts a new ledger; the rest of the state stays. */
export function cleared(s: SessionState): SessionState {
  return {
    ...s,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null, sentBack: [] },
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
  const notes: string[] = []
  // A press's message already says what it does; an Explain, for one, quotes its item without answering it.
  const answer = sentAt >= 0 ? null : answerNote(ledger, text)
  if (answer) notes.push(answer)
  // The inbox when it changed since Codex last read it, or when an item
  // closed since. An empty inbox with nothing closed says nothing new.
  const inbox = inboxText(ledger, isTabOpen(s, now))
  const told = new Set(s.told.closed)
  const closed = closedText(ledger.closed.filter(d => !told.has(d.id)))
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0
  let toldNow = s.told
  if (closed || (inbox !== s.told.inbox && !(isEmpty && s.told.inbox === null))) {
    notes.push(closed ? `${inbox}\n${closed}` : inbox)
    toldNow = { inbox, closed: ledger.closed.map(d => d.id) }
  }
  const person = s.turn.person === null ? text : `${s.turn.person}\n\n${text}`

  return {
    state: {
      ...s,
      ledger,
      told: toldNow,
      sent: sentAt >= 0 ? s.sent.filter((_x, i) => i !== sentAt) : s.sent,
      turn: { ...s.turn, person, press: sentBy ?? s.turn.press },
      presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 },
    },
    notes,
  }
}

export function noteActivity(s: SessionState, line: string | null): SessionState {
  const activity = s.turn.activity
  if (!line || activity.length >= MAX_ACTIVITY || activity.includes(line)) return s

  return { ...s, turn: { ...s.turn, activity: [...activity, line] } }
}

/** Shell syntax that would make a check command more than the one check. */
const SHELL_SYNTAX = /[|;&<>`]|\$\(/

/** Whether a shell command must be refused: it runs a check together with something else, so its exit status is not the check's. */
export function isCompoundCheck(command: string): boolean {
  const calls = checksIn(command)

  return calls.length > 0 && !(calls.length === 1 && !SHELL_SYNTAX.test(command))
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

/** A finished shell command that ran one check, ready to record; null for any other command. */
export function checkFromRun(
  end: { command: string; cwd: string; exitCode: number | null; output: string },
  s: Pick<SessionState, 'root' | 'home'>,
): {
  run: NonNullable<ReturnType<typeof checkRun>>
  folder: string
  result: Check['result']
  summary: string
  failures: string[]
} | null {
  if (end.exitCode === null || isCompoundCheck(end.command)) return null
  const run = checkRun(end.command, end.cwd || s.root, s.home)
  if (!run) return null
  const isFailed = end.exitCode !== 0
  const { result, summary } = readResult(end.output, isFailed)

  return {
    run,
    // A folder the command hides is taken as the session's.
    folder: run.folder ?? s.root,
    result,
    summary,
    failures: result === 'fail' ? failureLines(end.output) : [],
  }
}

/** Records a finished check run, in the repo `repo`. */
export function recordRun(
  s: SessionState,
  id: string,
  c: NonNullable<ReturnType<typeof checkFromRun>>,
  repo: string | null,
  at: number,
): SessionState {
  const checks = recorded(
    s.checks,
    [
      {
        name: c.run.call.name,
        kind: c.run.call.kind,
        folder: c.folder,
        result: c.result,
        summary: c.summary,
        command: c.run.command,
        failures: c.failures,
        repo,
        target: c.run.target,
      },
    ],
    at,
    s.root,
  )

  return { ...s, checks, recordedRuns: [...s.recordedRuns, id].slice(-MAX_RECORDED_RUNS) }
}

/**
 * The Stop hook's claim check: when the reply claims a check passes against
 * its latest result, the message that sends Codex back, once per result.
 */
export function claimCheck(s: SessionState, reply: string): { state: SessionState; block: string | null } {
  if (s.checks.results.length === 0) return { state: s, block: null }
  const found = claimAgainst(s.checks, reply, s.root)
  if (!found.claim) return { state: s, block: null }

  return {
    state: { ...s, checks: found.checks, turn: { ...s.turn, sentBack: [...s.turn.sentBack, reply] } },
    block: claimMessage(found.claim),
  }
}

/** Ends the turn: failing checks are now left failing, and the exchange waits for the inbox model. */
export function endTurn(s: SessionState, reply: string, now: number): SessionState {
  const checks = turnEnded(s.checks)
  const base = { ...s, checks, turn: { person: null, activity: [], press: null, sentBack: [] } }
  if (reply.trim() === '') return base
  const ex: Exchange = {
    person: s.turn.person,
    trigger: s.turn.person === null ? 'unknown' : null,
    activity: s.turn.activity,
    reply: [...s.turn.sentBack, reply].join('\n\n'),
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(isTabOpen(s, now)),
    checks: checks.results.map(c => checkLine(c, s.root)),
  }

  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] }
}

function cut(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function recordFinding(
  s: SessionState,
  input: Record<string, unknown>,
  now: number,
): { state: SessionState; result: string } {
  const title = cut(input.title, 120)
  const detail = cut(input.detail, 600)
  if (title === '' || detail === '') return { state: s, result: 'Not recorded: a finding needs a title and a detail.' }
  const path = cut(input.path, 300)
  const r = addFinding(s.ledger, {
    kind: input.kind === 'opportunity' ? 'opportunity' : 'issue',
    title,
    detail,
    path: path || null,
    at: now,
  })

  return {
    state: { ...s, ledger: r.ledger },
    result: r.isAdded
      ? `Recorded as ${r.id}. The user sees it in the Findings section of the Inbox tab.`
      : `Already recorded as ${r.id}.`,
  }
}

export function recordClose(
  s: SessionState,
  input: Record<string, unknown>,
  now: number,
): { state: SessionState; result: string } {
  const text = (key: string) => cut(input[key], 80)
  const id = text('id').replace(/^\[|\]$/g, '')
  const answer = text('answer')
  const reason = text('reason')
  if (id === '' || (answer === '' && reason === ''))
    return { state: s, result: "Not closed: give the id, and the user's answer or a reason." }
  const r = closeByClaude(s.ledger, id, answer ? { answer } : { reason }, now)
  // The shared ledger words the outcome for Claude; the tab and Codex read Codex's name.
  const ledger: Ledger = {
    ...r.ledger,
    closed: r.ledger.closed.map(d =>
      d.id === id && d.how === 'claude' ? { ...d, outcome: d.outcome.replace(CLOSED_BY_CLAUDE, CLOSED_BY) } : d,
    ),
  }
  const state = { ...s, ledger }
  if (r.closed === 'item') return { state, result: `Closed ${id}. The user sees it in the Inbox tab with its outcome.` }
  if (r.closed === 'finding') return { state, result: `Closed finding ${id}.` }

  return {
    state: s,
    result: `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`,
  }
}

/** A task stays folded from a hand-off press until the inbox model has summarized the turn that press started. */
export function isTaskHandedOff(last: LastAction | undefined, p: SessionState['presence']): boolean {
  const pressed = last?.isHandoff === true ? last.turnsStarted : undefined

  return pressed !== undefined && pressed <= p.turnsStarted && p.turnsApplied <= pressed
}

function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function helpLabel(help: Help): string {
  const label =
    help.kind === 'open'
      ? `Open ${baseName(help.path)}`
      : help.kind === 'copy'
        ? `Copy ${help.name ?? 'snippet'}`
        : help.kind === 'run'
          ? `Run ${help.name ?? help.command}`
          : help.kind === 'terminal'
            ? `Copy ${help.name ?? help.command}`
            : `Open ${help.name ?? new URL(help.url).host}`

  return clipLabel(label, 32)
}

/**
 * The item's helps as buttons, as the mod groups them: a snippet to copy and
 * a file to open become one step, since the snippet goes in that file.
 */
export function steps(helps: Help[]): { label: string; step: Help[] }[] {
  const copy = helps.find(h => h.kind === 'copy')
  const open = helps.find(h => h.kind === 'open')
  if (!copy || !open || copy.kind !== 'copy' || open.kind !== 'open')
    return helps.map(h => ({ label: helpLabel(h), step: [h] }))

  return helps
    .filter(h => h !== copy)
    .map(h =>
      h === open
        ? { label: clipLabel(`Copy ${copy.name ?? 'snippet'} and open ${baseName(open.path)}`, 48), step: [copy, open] }
        : { label: helpLabel(h), step: [h] },
    )
}

/** A press from the tab. */
export type TabPress =
  | { action: 'answer'; id: string; option: number }
  | { action: 'type'; id: string; text: string }
  | { action: 'explain'; id: string }
  | { action: 'done'; id: string }
  | { action: 'dismiss'; id: string }
  | { action: 'step'; id: string; step: number }
  | { action: 'fix'; key: string }
  | { action: 'dismissCheck'; key: string }
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
  if (p.action === 'fix' || p.action === 'dismissCheck') {
    const check = s.checks.results.find(c => checkKey(c) === p.key)
    if (!check) return null
    if (p.action === 'dismissCheck') return { state: { ...s, checks: dismissed(s.checks, check) }, effects: [] }
    const withFix = withLast(
      { ...s, checks: fixSent(s.checks, check, now) },
      `check:${p.key}`,
      { action: 'fix', text: 'Fix sent', isHandoff: true },
      now,
    )

    return send(withFix, fixMessage(check, s.root), null)
  }
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
    const text = how === 'address' ? 'Address sent' : how === 'discuss' ? 'Discuss sent' : 'Reply sent'

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

export type View = {
  goal: string
  now: string
  done: string[]
  running: string[]
  updating: boolean
  failed: boolean
  /** How many things wait on the person: questions, tasks not handed to Codex, checks left failing without a fix sent. */
  waiting: number
  questions: ItemRow[]
  tasks: ItemRow[]
  checks: {
    key: string
    name: string
    summary: string
    failures: string[]
    fixSent: boolean
    last: LastAction | null
  }[]
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
  closed: { ask: string; outcome: string; how: string; at: number }[]
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
    isHandedOff: i.kind === 'task' && isTaskHandedOff(s.lastActions[i.id], s.presence),
  })
  const questions = l.items
    .filter(i => i.kind === 'question')
    .sort((a, b) => b.turn - a.turn)
    .map(row)
  const tasks = l.items.filter(i => i.kind === 'task').map(row)
  const failing = needsYou(s.checks, s.root)
  const open = new Set(l.findings.map(f => f.id))

  return {
    goal: l.card?.goal ?? '',
    now: l.card?.now ?? '',
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    updating: s.presence.isUpdating || s.pending.length > 0,
    failed: s.presence.ledgerState === 'failed',
    waiting: questions.length + tasks.filter(t => !t.isHandedOff).length + failing.count,
    questions,
    tasks,
    checks: failing.rows.map(c => ({
      key: checkKey(c),
      name: checkName(c, s.root),
      summary: c.summary,
      failures: c.failures,
      fixSent: c.fixSentAt !== null,
      last: s.lastActions[`check:${checkKey(c)}`] ?? null,
    })),
    findings: l.findings.map(f => ({ ...f, last: s.lastActions[f.id] ?? null })),
    leaving: Object.entries(s.lastActions)
      .filter(([id, a]) => a.title !== undefined && !open.has(id) && now - a.at < SETTLED_MS)
      .map(([id, a]) => ({ id, title: a.title ?? '', text: a.text, at: a.at })),
    closed: l.closed
      .slice(-3)
      .reverse()
      .map(d => ({ ask: d.ask, outcome: d.outcome, how: d.how, at: d.at })),
    at: now,
  }
}
