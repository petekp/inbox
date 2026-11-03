// Finds the tool calls of a turn that did not run, so their activity lines and delegate rows can be taken back. Codex's
// PreToolUse hook adds a call's line and rows before the person approves the call, and before other hooks can block it.

import { toolActivity } from '../../hooks/catch-up-text'
import { delegateRefs } from '../../hooks/children'
import { callCommand, commandText, outputText, shellLines } from './rollout-commands'
import { contentText, record, textOf } from './rollout-rows'
import type { RolloutRow } from './rollout-rows'

/** Rollout markers of the rows `unranCalls` reads, for a reader that parses only the lines holding one. */
export const UNRAN_MARKERS = [
  '"CommandExecution"',
  '"FileChange"',
  '"McpToolCall"',
  '"function_call',
  '"local_shell_call',
  '"custom_tool_call_output"',
]

/** Codex's answers to the model for a call that is not run through code mode and did not run. */
const UNRAN_OUTPUT = /^(?:(?:exec command|patch) rejected by user|(?:Command|Tool call) blocked by PreToolUse hook: )/

/** Whether a function call's output is Codex's answer for a call that did not run. */
export const isUnranOutput = (output: string): boolean => UNRAN_OUTPUT.test(output)

/**
 * Codex's answer to the model when a PreToolUse hook blocks a call. The reason is the hook's own text. Only an output
 * that starts with one counts, since a call that ran can print the same words.
 */
const BLOCKED_COMMAND = /^Command blocked by PreToolUse hook: [^\n]*?\. Command: ([^\n]+)/
const BLOCKED_TOOL = /^Tool call blocked by PreToolUse hook: [^\n]*?\. Tool: (\S+)/

/** How a code-mode script's output starts when the script ended on an error it did not catch. */
const SCRIPT_ERROR = 'Script error: '

const toolLines = (tool: string): string[] => {
  const line = toolActivity(tool, {})

  return line ? [line] : []
}

/** The commands and tool a tool output says a hook blocked, when the output starts with Codex's message. */
const blocked = (output: string): { commands: string[]; lines: string[] } => {
  const command = BLOCKED_COMMAND.exec(output)?.[1]?.trim()
  const tool = BLOCKED_TOOL.exec(output)?.[1]

  return command
    ? { commands: [command], lines: shellLines(command) }
    : { commands: [], lines: tool ? toolLines(tool) : [] }
}

const editedLines = (changes: unknown): string[] => Object.keys(record(changes)).map(path => `edited ${path}`)

/**
 * What the calls in `rows`, one turn's rows, that did not run would have added: a call the person declined, or that
 * a hook blocked. `lines` are their activity lines, and `delegates` the refs of the delegates their herdr commands
 * name. A line or a delegate that another call in the turn ran with stays out, since the activity holds each line
 * once and each delegate has one row. A call with no row yet, such as a command still running, counts as run.
 */
export function unranCalls(rows: RolloutRow[]): { lines: string[]; delegates: string[] } {
  const ran = new Set<string>()
  const unran = new Set<string>()
  const ranDelegates = new Set<string>()
  const unranDelegates = new Set<string>()
  const note = (lines: string[], didRun: boolean) => lines.forEach(line => (didRun ? ran : unran).add(line))
  const noteCommand = (command: string, didRun: boolean) => {
    note(shellLines(command), didRun)
    delegateRefs(command).forEach(ref => (didRun ? ranDelegates : unranDelegates).add(ref))
  }
  const callCommands = new Map<string, string>()
  for (const row of rows) {
    const p = record(row.payload)
    const item = record(p.item)
    const isDeclined = item.status === 'declined'
    if (row.type === 'event_msg' && p.type === 'item_completed') {
      if (item.type === 'CommandExecution') noteCommand(commandText(item.command), !isDeclined)
      else if (item.type === 'FileChange') note(editedLines(item.changes), !isDeclined)
      else if (item.type === 'McpToolCall') note(toolLines(`mcp__${textOf(item.server)}__${textOf(item.tool)}`), true)
      continue
    }
    if (row.type !== 'response_item') continue
    const callId = textOf(p.call_id)
    let block = { commands: [] as string[], lines: [] as string[] }
    if (p.type === 'function_call' || p.type === 'local_shell_call') {
      const command = callCommand(p)
      if (command !== '' && callId !== '') callCommands.set(callId, command)
    } else if (p.type === 'function_call_output') {
      const output = outputText(p.output)
      const command = callCommands.get(callId)
      callCommands.delete(callId)
      if (command !== undefined) noteCommand(command, !isUnranOutput(output))
      block = blocked(output)
    } else if (p.type === 'custom_tool_call_output') {
      const output = Array.isArray(p.output) ? contentText(p.output) : textOf(p.output)
      if (output.startsWith(SCRIPT_ERROR)) block = blocked(output.slice(SCRIPT_ERROR.length))
    }
    note(block.lines, false)
    block.commands.forEach(command => noteCommand(command, false))
  }
  // A call with no output yet still runs.
  callCommands.forEach(command => delegateRefs(command).forEach(ref => ranDelegates.add(ref)))

  return {
    lines: [...unran].filter(line => !ran.has(line)),
    delegates: [...unranDelegates].filter(ref => !ranDelegates.has(ref)),
  }
}
