// Reads Codex's session transcript, a JSONL file whose path every hook gets.

import { open, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { flattenConversation } from '../../hooks/conversation'
import { codexPlanOf } from '../../hooks/host-tasks'
import type { Turn } from '../../hooks/conversation'
import { addActivity, dialogActivity, dialogQuestions } from '../../hooks/model-text'
import type { DialogQuestion } from '../../hooks/model-text'
import type { HostTask } from '../../types'
import { activityOf, patchFiles } from './core'

type SessionMeta = {
  type?: string
  payload?: {
    originator?: string
    source?: string
    forked_from_id?: unknown
    parent_thread_id?: unknown
    cwd?: unknown
    history_base?: { thread_id?: unknown; end_byte_offset?: unknown }
  }
}

/** The rollout's first row, `session_meta`. Null when the file or the row cannot be read. */
async function readSessionMeta(path: string): Promise<SessionMeta | null> {
  try {
    const file = await open(path, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await file.read(buf, 0, buf.length, 0)
      const first = buf.subarray(0, bytesRead).toString('utf8').split('\n')[0] ?? ''
      const meta = JSON.parse(first) as SessionMeta

      return meta.type === 'session_meta' ? meta : null
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}

/** What a hook reads from the rollout's first row, `session_meta`. */
export type RolloutMeta = {
  /**
   * Whether the session is a run no person chats in, where the hooks do nothing.
   * An ephemeral thread, such as the Codex app's own background jobs that
   * suggest a next message, saves no transcript, so its hooks get a null path.
   * A `codex exec` run names its originator in `session_meta`, which covers the
   * inbox's own update call and runs other tools start.
   */
  isNonInteractive: boolean
  /** The folder the session started in. Null when the row names none. */
  folder: string | null
}

export async function rolloutMeta(path: string | null): Promise<RolloutMeta> {
  if (path === null) return { isNonInteractive: true, folder: null }
  const meta = await readSessionMeta(path)
  const cwd = meta?.payload?.cwd

  return { isNonInteractive: isExecMeta(meta), folder: typeof cwd === 'string' && cwd !== '' ? cwd : null }
}

function isExecMeta(meta: SessionMeta | null): boolean {
  return meta?.payload?.originator === 'codex_exec' || meta?.payload?.source === 'exec'
}

/**
 * The session a forked chat was forked from, from `forked_from_id` in the rollout's first row. A fork's rollout also
 * holds the parent's own `session_meta` later on, so only the first row counts.
 */
export async function forkedFromId(path: string): Promise<string | null> {
  const id = (await readSessionMeta(path))?.payload?.forked_from_id

  return typeof id === 'string' && id !== '' ? id : null
}

/** The names under `dir` that match `pattern`, newest first. Empty when the folder cannot be read. */
async function namesIn(dir: string, pattern: RegExp): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])

  return names
    .filter(n => pattern.test(n))
    .sort()
    .reverse()
}

/** The newest file under `sessions/YYYY/MM/DD/` whose name `isWanted` accepts. Null when there is none. */
async function newestRollout(sessions: string, isWanted: (name: string) => boolean): Promise<string | null> {
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join(sessions, year, month), /^\d{2}$/)) {
        const folder = join(sessions, year, month, day)
        const [name] = (await namesIn(folder, /^rollout-.+\.jsonl$/)).filter(isWanted)
        if (name !== undefined) return join(folder, name)
      }

  return null
}

/**
 * A chat's rollout, found by its thread id in Codex's `sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl`. A chat
 * Codex reverted continues in `rollout-<time>-<thread id>_<rollout id>.jsonl`, and the newest file wins: `readRollout`
 * reads the history it continues. Null when no readable file holds it, or when the newest one belongs to a subagent or
 * a run no person chats in. A rollout Codex has compressed (`.zst`) is not read. `cwd` is the folder the chat runs in,
 * from its first row.
 */
export async function rolloutFor(codexHome: string, threadId: string): Promise<{ path: string; cwd: string } | null> {
  if (threadId === '') return null
  const path = await newestRollout(
    join(codexHome, 'sessions'),
    name => name.endsWith(`-${threadId}.jsonl`) || name.includes(`-${threadId}_`),
  )
  if (path === null) return null
  const meta = await readSessionMeta(path)
  const isOwnChat = meta !== null && !meta.payload?.parent_thread_id && !isExecMeta(meta)

  return isOwnChat ? { path, cwd: typeof meta.payload?.cwd === 'string' ? meta.payload.cwd : '' } : null
}

/**
 * The earlier rollout a reverted chat's rollout continues, and the byte offset where its kept history ends, from
 * `history_base` in the first row. The base is named by its rollout id: a chat's first rollout has the thread id's
 * name, and a later one ends in `_<rollout id>`. Null for a rollout that continues none, or whose base is not found.
 */
async function historyBase(path: string): Promise<{ path: string; end: number } | null> {
  const base = (await readSessionMeta(path))?.payload?.history_base
  const id = base?.thread_id
  const end = base?.end_byte_offset
  if (typeof id !== 'string' || id === '' || typeof end !== 'number' || end <= 0) return null
  const sessions = dirname(dirname(dirname(dirname(path))))
  const basePath = await newestRollout(sessions, name => name.endsWith(`-${id}.jsonl`) || name.endsWith(`_${id}.jsonl`))

  return basePath === null ? null : { path: basePath, end }
}

const DIALOG_TOOL = 'request_user_input_async'

const TAIL_BYTES = 4 * 1024 * 1024

/** A shell command that finished, with the text it printed. */
export type FinishedCommand = { command: string; output: string }

type RowPayload = NonNullable<TranscriptLine['payload']>

type TranscriptLine = {
  type?: string
  payload?: {
    type?: string
    name?: string
    arguments?: unknown
    turn_id?: string
    call_id?: string
    output?: unknown
    action?: { command?: unknown }
    item?: { type?: string; command?: unknown; aggregated_output?: unknown }
  }
}

const SHELL_CALLS = new Set(['shell', 'shell_command', 'exec_command', 'container.exec'])
/** The Codex tool that writes the agent's plan: the rows of the plan, each with a step and a status. */
const PLAN_TOOL = 'update_plan'

const MARKERS = ['"task_started"', DIALOG_TOOL, '"CommandExecution"', '"function_call', '"local_shell_call']

const isText = (v: unknown): v is string => typeof v === 'string'

/** The command line of an argv such as `["/bin/zsh", "-lc", "gh pr create"]`, without its shell wrapper. */
function commandText(command: unknown): string {
  if (isText(command)) return command
  if (!Array.isArray(command)) return ''
  const argv = command.filter(isText)
  const [, flag, script] = argv

  return argv.length === 3 && flag?.startsWith('-') && flag.endsWith('c') && script !== undefined
    ? script
    : argv.join(' ')
}

/** A function call's output is its text, or JSON holding the text as `output`. */
function outputText(output: unknown): string {
  if (!isText(output)) return ''
  try {
    const parsed = JSON.parse(output) as { output?: unknown }

    return isText(parsed.output) ? parsed.output : output
  } catch {
    return output
  }
}

function callCommand(p: NonNullable<TranscriptLine['payload']>): string {
  if (p.type === 'local_shell_call') return commandText(p.action?.command)
  if (p.type !== 'function_call' || !p.name || !SHELL_CALLS.has(p.name) || !isText(p.arguments)) return ''
  try {
    const args = JSON.parse(p.arguments) as { command?: unknown; cmd?: unknown }

    return commandText(args.command ?? args.cmd)
  } catch {
    return ''
  }
}

/**
 * The last `bytes` before `end` in a file, as lines, with the offset they start at and the bytes read. A cut first line
 * is dropped.
 */
async function linesBefore(
  path: string,
  bytes: number,
  end = Infinity,
): Promise<{ lines: string[]; start: number; read: number }> {
  const file = await open(path, 'r')
  try {
    const stop = Math.min(end, (await file.stat()).size)
    const start = Math.max(0, stop - bytes)
    const buf = Buffer.alloc(stop - start)
    const { bytesRead } = await file.read(buf, 0, buf.length, start)
    const lines = buf.subarray(0, bytesRead).toString('utf8').split('\n')
    if (start > 0) lines.shift()

    return { lines, start, read: bytesRead }
  } finally {
    await file.close()
  }
}

const TURN_ROW_BYTES = 64 * 1024

/**
 * A row of the rollout that starts a turn (`task_started`), or ends it by completing (`task_complete`) or by an
 * interrupt (`turn_aborted`).
 */
export type TurnEvent = { id: string; kind: 'started' | 'completed' | 'aborted' }

const TURN_EVENT_KINDS = new Map<string, TurnEvent['kind']>([
  ['task_started', 'started'],
  ['task_complete', 'completed'],
  ['turn_aborted', 'aborted'],
])

/** The turn event a parsed rollout row is, or null. Codex writes the turn id in `turn_id` or in `turn_attribution`. */
function turnEventOfRow(row: RolloutRow): TurnEvent | null {
  const p = record(row.payload)
  const kind = row.type === 'event_msg' ? TURN_EVENT_KINDS.get(textOf(p.type)) : undefined

  return kind === undefined ? null : { id: textOf(p.turn_id) || textOf(record(p.turn_attribution).turn_id), kind }
}

/** The turn event a rollout line holds, or null. Only a line that names one is parsed. */
function turnEventOf(line: string): TurnEvent | null {
  if (!line.includes('"task_') && !line.includes('"turn_aborted"')) return null
  try {
    return turnEventOfRow(record(JSON.parse(line)) as RolloutRow)
  } catch {
    return null
  }
}

/**
 * The rollout's newest turn event. Its turn still runs when it is a start. Stop does not run for an interrupted turn,
 * and another plugin's Stop can continue a turn after the inbox's Stop ran, so only the rollout says whether the turn
 * runs. Only the last `TURN_ROW_BYTES` are read. Null when they hold no turn event or the file cannot be read.
 */
export async function newestTurnEvent(path: string): Promise<TurnEvent | null> {
  try {
    for (const line of (await tailLines(path, TURN_ROW_BYTES)).reverse()) {
      const event = turnEventOf(line)
      if (event !== null) return event
    }

    return null
  } catch {
    return null
  }
}

/** The last `bytes` of a file as lines. A cut first line is dropped. */
async function tailLines(path: string, bytes: number): Promise<string[]> {
  return (await linesBefore(path, bytes)).lines
}

/**
 * The newest `bytes` of a chat's history, as lines. A reverted chat's rollout holds only the turns after the revert,
 * and its history goes on in the kept part of the rollout it continues, as Codex reads it in `rollout_lineage.rs`. An
 * earlier rollout that cannot be found or read, such as a compressed one, ends the history there.
 */
async function historyLines(path: string, bytes: number): Promise<string[]> {
  const first = await linesBefore(path, bytes)
  const parts = [first.lines]
  const seen = new Set([path])
  let budget = bytes - first.read
  let isWhole = first.start === 0
  let current = path
  while (isWhole && budget > 0) {
    const base = await historyBase(current).catch(() => null)
    if (base === null || seen.has(base.path)) break
    seen.add(base.path)
    const part = await linesBefore(base.path, budget, base.end).catch(() => null)
    if (part === null) break
    parts.unshift(part.lines)
    budget -= part.read
    isWhole = part.start === 0
    current = base.path
  }

  return parts.flat()
}

/**
 * A dialog the agent opened: its call's `call_id`, null when the row has none, and its questions in the call's order.
 * Codex refuses a call with an empty question title, so a question's place here is its index in the call.
 */
export type Dialog = { callId: string | null; questions: DialogQuestion[] }

type TurnRows = { dialogs: Dialog[]; commands: FinishedCommand[]; plan: HostTask[] | null }

/**
 * What the agent did in a turn, oldest first, read from the transcript. Codex runs no hook for its dialog tool,
 * and a shell command's output reaches no hook at all when the command runs long, so both show only here.
 * The turn is the one with `turnId`, or the newest when none is given. Only the last few megabytes are read. When
 * they hold no turn start, they count as the turn. A transcript that cannot be read gives an empty turn.
 *
 * `dialogs` holds each dialog the agent opened. Its answer arrives later, as a user message.
 * `commands` holds each shell command that finished. The `CommandExecution` rows of Codex CLI 0.163 and later give
 * them. A turn with none falls back to older shell calls and their outputs.
 */
export async function turnIn(path: string | null, turnId: string | undefined): Promise<TurnRows> {
  return turnOf(await rolloutTail(path), turnId)
}

/** The last few megabytes of a rollout, as lines. Empty when the file cannot be read. */
export async function rolloutTail(path: string | null): Promise<string[]> {
  return path === null ? [] : tailLines(path, TAIL_BYTES).catch(() => [])
}

/** What the agent did in a turn, as `turnIn` says, read from the lines `rolloutTail` gives. */
export function turnOf(lines: string[], turnId: string | undefined): TurnRows {
  const none: TurnRows = { dialogs: [], commands: [], plan: null }
  try {
    type Turn = {
      dialogs: Dialog[]
      executions: FinishedCommand[]
      calls: Map<string, FinishedCommand>
      called: FinishedCommand[]
      plan: HostTask[] | null
    }
    const byTurn = new Map<string, Turn>()
    const newTurn = (): Turn => ({ dialogs: [], executions: [], calls: new Map(), called: [], plan: null })
    let current = ''
    let newest = ''
    for (const line of lines) {
      if (!MARKERS.some(m => line.includes(m))) continue
      let row: TranscriptLine
      try {
        row = JSON.parse(line) as TranscriptLine
      } catch {
        continue
      }
      const p = row.payload
      if (!p) continue
      if (row.type === 'event_msg' && p.type === 'task_started' && p.turn_id) {
        current = p.turn_id
        newest = current
        if (!byTurn.has(current)) byTurn.set(current, newTurn())
        continue
      }
      const turn = byTurn.get(current) ?? newTurn()
      byTurn.set(current, turn)
      if (row.type === 'event_msg' && p.type === 'item_completed' && p.item?.type === 'CommandExecution') {
        const output = p.item.aggregated_output
        turn.executions.push({ command: commandText(p.item.command), output: isText(output) ? output : '' })
      } else if (row.type === 'response_item' && p.type === 'function_call' && p.name === PLAN_TOOL) {
        turn.plan = codexPlanOf(p.arguments) ?? turn.plan
      } else if (row.type === 'response_item' && p.type === 'function_call' && p.name === DIALOG_TOOL) {
        let args: { questions?: unknown }
        try {
          args = JSON.parse(isText(p.arguments) ? p.arguments : '') as { questions?: unknown }
        } catch {
          continue
        }
        turn.dialogs.push({ callId: p.call_id ?? null, questions: dialogQuestions(args.questions) })
      } else if (row.type === 'response_item' && (p.type === 'function_call' || p.type === 'local_shell_call')) {
        const command = callCommand(p)
        if (command !== '' && p.call_id) turn.calls.set(p.call_id, { command, output: '' })
      } else if (row.type === 'response_item' && p.type === 'function_call_output' && p.call_id) {
        const call = turn.calls.get(p.call_id)
        if (call) turn.called.push({ command: call.command, output: outputText(p.output) })
      }
    }
    const wanted = newest === '' ? '' : (turnId ?? newest)
    const turn = byTurn.get(wanted)
    if (!turn) return none

    return {
      dialogs: turn.dialogs.filter(d => d.questions.length > 0),
      commands: turn.executions.length > 0 ? turn.executions : turn.called,
      plan: turn.plan,
    }
  } catch {
    return none
  }
}

const ROLLOUT_BYTES = 8 * 1024 * 1024

type Payload = Record<string, unknown>

type RolloutRow = { type?: unknown; payload?: Payload }

const record = (v: unknown): Payload => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : {})

const textOf = (v: unknown): string => (isText(v) ? v : '')

const contentText = (content: unknown): string =>
  (Array.isArray(content) ? content : [])
    .map(part => textOf(record(part).text))
    .filter(Boolean)
    .join('\n')
    .trim()

const jsonRecord = (raw: unknown): Payload => {
  try {
    return record(JSON.parse(textOf(raw)))
  } catch {
    return {}
  }
}

/** The value of a JavaScript string literal, as the code-mode `exec` tool's input writes its arguments. */
const literalValue = (literal: string | undefined): string | null => {
  if (literal === undefined) return null
  try {
    return textOf(JSON.parse(literal))
  } catch {
    return null
  }
}

const PATCH_ARGUMENT = /tools\.apply_patch\(\s*("(?:[^"\\]|\\.)*")/
const COMMAND_ARGUMENT = /\bcmd:\s*("(?:[^"\\]|\\.)*")/

const shellLines = (command: string): string[] => {
  const line = command === '' ? null : activityOf('Bash', { command })

  return line ? [line] : []
}

const editLines = (patch: string, cwd: string): string[] =>
  patchFiles(patch).map(file => `edited ${resolve(cwd || '/', file)}`)

/**
 * The activity lines of one tool call row. A call that a `CommandExecution` row also records gives no shell line, so
 * a command is not counted twice.
 */
function callLines(p: Payload, hasCommandRows: boolean, cwd: string): string[] {
  const name = textOf(p.name)
  if (p.type === 'local_shell_call') return hasCommandRows ? [] : shellLines(callCommand(p as RowPayload))
  if (p.type === 'custom_tool_call' && name === 'exec') {
    const input = textOf(p.input)
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1])
    const command = literalValue(COMMAND_ARGUMENT.exec(input)?.[1])

    return [...(patch ? editLines(patch, cwd) : []), ...(command && !hasCommandRows ? shellLines(command) : [])]
  }
  if (p.type !== 'function_call') return []
  if (SHELL_CALLS.has(name)) return hasCommandRows ? [] : shellLines(callCommand(p as RowPayload))
  const args = jsonRecord(p.arguments)
  if (name === 'apply_patch') return editLines(textOf(args.input ?? args.patch ?? args.command), cwd)
  if (name === 'spawn_agent') {
    const line = activityOf('Agent', { description: textOf(args.task_name) })

    return line ? [line] : []
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: 'open' })]
  const line = activityOf(textOf(p.namespace).startsWith('mcp__') ? textOf(p.namespace) + name : name, {})

  return line ? [line] : []
}

const isItem = (row: RolloutRow, ...kinds: string[]): boolean =>
  row.type === 'event_msg' &&
  record(row.payload).type === 'item_completed' &&
  kinds.includes(textOf(record(record(row.payload).item).type))

/**
 * The conversation of one turn's rows. Codex 0.163 writes each message twice, as an item and as a `response_item`,
 * so the `response_item` copy is read only when the turn has no item rows.
 */
function turnsOf(rows: RolloutRow[], cwd: string): Turn[] {
  const hasMessageRows = rows.some(row => isItem(row, 'UserMessage', 'AgentMessage'))
  const hasCommandRows = rows.some(row => isItem(row, 'CommandExecution'))
  const turns: Turn[] = []
  const agentTurn = (): Turn => {
    const last = turns.at(-1)
    if (last?.role === 'agent') return last
    const turn: Turn = { role: 'agent', text: '', activity: [] }
    turns.push(turn)

    return turn
  }
  const person = (text: string) => {
    if (text && !text.startsWith('<')) turns.push({ role: 'person', text, activity: [] })
  }
  const act = (lines: string[]) => {
    if (lines.length === 0) return
    const turn = agentTurn()
    turn.activity = lines.reduce((all, line) => addActivity(all, line), turn.activity)
  }
  for (const row of rows) {
    const p = record(row.payload)
    const item = record(p.item)
    if (isItem(row, 'UserMessage')) person(contentText(item.content))
    else if (isItem(row, 'AgentMessage')) turns.push({ role: 'agent', text: contentText(item.content), activity: [] })
    else if (isItem(row, 'CommandExecution')) act(shellLines(commandText(item.command)))
    else if (row.type === 'response_item') {
      if (p.type === 'message' && !hasMessageRows && p.role === 'user') person(contentText(p.content))
      else if (p.type === 'message' && !hasMessageRows && p.role === 'assistant')
        turns.push({ role: 'agent', text: contentText(p.content), activity: [] })
      else act(callLines(p, hasCommandRows, cwd))
    }
  }

  return turns
}

type RolloutTurn = { id: string; isComplete: boolean; turns: Turn[] }

/** Splits the rollout into its turns, each from a `task_started` row to the next. Rows that are not JSON are skipped. */
function rolloutTurns(lines: string[], cwd: string): RolloutTurn[] {
  const groups: { id: string; isComplete: boolean; rows: RolloutRow[] }[] = []
  for (const line of lines) {
    let row: RolloutRow
    try {
      row = record(JSON.parse(line)) as RolloutRow
    } catch {
      continue
    }
    const event = turnEventOfRow(row)
    if (event?.kind === 'started') {
      groups.push({ id: event.id, isComplete: false, rows: [] })
      continue
    }
    if (groups.length === 0) groups.push({ id: '', isComplete: false, rows: [] })
    const group = groups.at(-1)!
    if (event?.kind === 'completed') group.isComplete = true
    else group.rows.push(row)
  }

  return groups.map(g => ({ id: g.id, isComplete: g.isComplete, turns: turnsOf(g.rows, cwd) }))
}

/** A turn of the rollout, by its start, and whether it ended, by completing or by an interrupt. */
export type TurnRow = { id: string; hasEnded: boolean }

/**
 * The turns of `lines`, oldest first. An end whose start is not in `lines` is a turn of its own, except in a window
 * cut from the end of a rollout: there the ends before the first start belong to turns that started before the window,
 * and are skipped.
 */
function turnRowsOf(lines: string[], isWindow: boolean): TurnRow[] {
  const rows: TurnRow[] = []
  for (const line of lines) {
    const event = turnEventOf(line)
    if (event === null || (isWindow && rows.length === 0 && event.kind !== 'started')) continue
    if (event.kind === 'started') {
      rows.push({ id: event.id, hasEnded: false })
      continue
    }
    const started = rows.findLast(t => t.id === event.id) ?? (event.id === '' ? rows.at(-1) : undefined)
    if (started) started.hasEnded = true
    else rows.push({ id: event.id, hasEnded: true })
  }

  return rows
}

/** The windows at the end of a rollout that `RolloutReads.turns` reads, smallest first, before the whole history. */
const TURN_WINDOW_BYTES = [TURN_ROW_BYTES, 512 * 1024, TAIL_BYTES]

export type RolloutReads = {
  /**
   * The rollout's turns, oldest first. They come from the smallest window at the end of the rollout whose turns satisfy
   * `isEnough`, else from the whole history the catch-up reads. Null when the file cannot be read.
   */
  turns(isEnough: (turns: TurnRow[]) => boolean): Promise<TurnRow[] | null>
  /** The conversation over the whole history, as `readRollout` gives it. */
  rollout(cwd: string, currentTurnId?: string): Promise<Rollout | null>
  /** The session the chat was forked from, as `forkedFromId` gives it. */
  forkedFromId(): Promise<string | null>
}

/**
 * One hook's reads of a rollout. Each read is kept, so a check made again under the state lock reads only what the
 * state it checks newly needs. `tail` is the end of the rollout the hook has read already, from `rolloutTail`, and takes
 * the place of the windows.
 */
export function rolloutReads(path: string, tail?: string[]): RolloutReads {
  let history: Promise<string[]> | null = null
  let read: { turns: TurnRow[]; isWhole: boolean } | null = null
  const rollouts = new Map<string, Promise<Rollout | null>>()
  let forkedFrom: Promise<string | null> | null = null
  const wholeHistory = () => (history ??= historyLines(path, ROLLOUT_BYTES))

  async function windowTurns(isEnough: (turns: TurnRow[]) => boolean): Promise<TurnRow[] | null> {
    if (tail !== undefined) {
      const turns = turnRowsOf(tail, true)
      return isEnough(turns) ? turns : null
    }
    for (const bytes of TURN_WINDOW_BYTES) {
      const { lines, start } = await linesBefore(path, bytes)
      const turns = turnRowsOf(lines, true)
      if (isEnough(turns)) return turns
      if (start === 0) break
    }

    return null
  }

  return {
    async turns(isEnough) {
      try {
        if (read === null || !(read.isWhole || isEnough(read.turns))) {
          const window = history === null ? await windowTurns(isEnough) : null
          read =
            window === null
              ? { turns: turnRowsOf(await wholeHistory(), false), isWhole: true }
              : { turns: window, isWhole: false }
        }

        return read.turns
      } catch {
        return null
      }
    },
    rollout(cwd, currentTurnId) {
      const key = JSON.stringify([cwd, currentTurnId ?? null])
      const known = rollouts.get(key)
      if (known !== undefined) return known
      const rollout = wholeHistory()
        .then(lines => rolloutOfLines(lines, cwd, currentTurnId))
        .catch(() => null)
      rollouts.set(key, rollout)

      return rollout
    },
    forkedFromId() {
      return (forkedFrom ??= forkedFromId(path))
    },
  }
}

export type Rollout = {
  /** The whole conversation, oldest first, as the inbox model reads it. */
  conversation: string
  /** How many turns other than the current one finished or hold a person's message. */
  earlierTurns: number
}

function rolloutOfLines(lines: string[], cwd: string, currentTurnId: string | undefined): Rollout {
  const turns = rolloutTurns(lines, cwd)
  const earlier = turns.filter(t => t.id !== currentTurnId && (t.isComplete || t.turns.some(x => x.role === 'person')))

  return { conversation: flattenConversation(turns.flatMap(t => t.turns)), earlierTurns: earlier.length }
}

/**
 * The session's conversation, read from its rollout and, for a reverted chat, the history it continues. A history over
 * a few megabytes keeps its newest part. Codex does
 * not document the rollout, so a row of a kind not read is skipped. `currentTurnId` names the turn a hook runs in, which
 * is not an earlier turn. Null when the file cannot be read.
 */
export async function readRollout(path: string | null, cwd: string, currentTurnId?: string): Promise<Rollout | null> {
  if (path === null) return null
  try {
    return rolloutOfLines(await historyLines(path, ROLLOUT_BYTES), cwd, currentTurnId)
  } catch {
    return null
  }
}
