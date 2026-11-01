import { flattenConversation } from '../../hooks/conversation'
import { codexPlanOf } from '../../hooks/host-tasks'
import type { Turn } from '../../hooks/conversation'
import { addActivity, dialogQuestions } from '../../hooks/catch-up-text'
import type { DialogQuestion, HostTask } from '../../types'
import { callCommand, callLines, commandText, DIALOG_TOOL, outputText, shellLines } from './rollout-commands'
import { contentText, isText, record, textOf } from './rollout-rows'
import type { RolloutRow, TranscriptLine } from './rollout-rows'

/** A shell command that finished, with the text it printed. */
type FinishedCommand = { command: string; output: string }
/** The Codex tool that writes the agent's plan: the rows of the plan, each with a step and a status. */
const PLAN_TOOL = 'update_plan'

const MARKERS = [
  '"task_started"',
  DIALOG_TOOL,
  '"CommandExecution"',
  '"function_call',
  '"local_shell_call',
  '"AgentMessage"',
  '"assistant"',
]

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
export function turnEventOf(line: string): TurnEvent | null {
  if (!line.includes('"task_') && !line.includes('"turn_aborted"')) return null
  try {
    return turnEventOfRow(record(JSON.parse(line)) as RolloutRow)
  } catch {
    return null
  }
}

/**
 * A dialog the agent opened: its call's `call_id`, null when the row has none, and its questions in the call's order.
 * Codex refuses a call with an empty question title, so a question's place here is its index in the call.
 */
export type Dialog = { callId: string | null; questions: DialogQuestion[] }

/** `texts`: the agent's messages to the person, in order, from its notes while it works to its final answer. */
export type TurnRows = { dialogs: Dialog[]; commands: FinishedCommand[]; plan: HostTask[] | null; texts: string[] }

/** What the agent did in a turn, as `turnIn` says, read from the lines `rolloutTail` gives. */
export function turnOf(lines: string[], turnId: string | undefined): TurnRows {
  const none: TurnRows = { dialogs: [], commands: [], plan: null, texts: [] }
  try {
    type Turn = {
      dialogs: Dialog[]
      executions: FinishedCommand[]
      calls: Map<string, FinishedCommand>
      called: FinishedCommand[]
      plan: HostTask[] | null
      itemTexts: string[]
      messageTexts: string[]
    }
    const byTurn = new Map<string, Turn>()
    const newTurn = (): Turn => ({
      dialogs: [],
      executions: [],
      calls: new Map(),
      called: [],
      plan: null,
      itemTexts: [],
      messageTexts: [],
    })
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
      } else if (row.type === 'event_msg' && p.type === 'item_completed' && p.item?.type === 'AgentMessage') {
        turn.itemTexts.push(contentText(p.item.content))
      } else if (row.type === 'response_item' && p.type === 'message' && p.role === 'assistant') {
        turn.messageTexts.push(contentText(p.content))
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
      texts: turn.itemTexts.length > 0 ? turn.itemTexts : turn.messageTexts,
    }
  } catch {
    return none
  }
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
export function turnRowsOf(lines: string[], isWindow: boolean): TurnRow[] {
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

export type Rollout = {
  /** The whole conversation, oldest first, as the inbox model reads it. */
  conversation: string
  /** How many turns other than the current one finished or hold a person's message. */
  earlierTurns: number
}

export function rolloutOfLines(lines: string[], cwd: string, currentTurnId: string | undefined): Rollout {
  const turns = rolloutTurns(lines, cwd)
  const earlier = turns.filter(t => t.id !== currentTurnId && (t.isComplete || t.turns.some(x => x.role === 'person')))

  return { conversation: flattenConversation(turns.flatMap(t => t.turns)), earlierTurns: earlier.length }
}
