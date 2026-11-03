// Finds the tool calls of a turn that did not run, so their activity lines can be taken back. Codex's PreToolUse hook
// adds a call's line before the person approves the call, and before other hooks can block it.

import { toolActivity } from '../../hooks/catch-up-text'
import { callCommand, commandText, outputText, shellLines } from './rollout-commands'
import { contentText, record, textOf } from './rollout-rows'
import type { RolloutRow } from './rollout-rows'

/** Rollout markers of the rows `unranLines` reads, for a reader that parses only the lines holding one. */
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

/** Codex's answer to the model when a PreToolUse hook blocks a call. The reason is the hook's own text. */
const BLOCKED_COMMAND = /Command blocked by PreToolUse hook: [^\n]*?\. Command: ([^\n]+)/g
const BLOCKED_TOOL = /Tool call blocked by PreToolUse hook: [^\n]*?\. Tool: ([^\s]+)/g

const toolLines = (tool: string): string[] => {
  const line = toolActivity(tool, {})

  return line ? [line] : []
}

/** The activity lines of the calls a tool output says a hook blocked. */
const blockedLines = (output: string): string[] => [
  ...[...output.matchAll(BLOCKED_COMMAND)].flatMap(m => shellLines(m[1]!.trim())),
  ...[...output.matchAll(BLOCKED_TOOL)].flatMap(m => toolLines(m[1]!)),
]

const editedLines = (changes: unknown): string[] => Object.keys(record(changes)).map(path => `edited ${path}`)

/**
 * The activity lines of the calls in `rows`, one turn's rows, that did not run: a call the person declined, or that a
 * hook blocked. A line that another call in the turn ran with stays out, since the activity holds each line once.
 * A call with no row yet, such as a command still running, counts as run.
 */
export function unranLines(rows: RolloutRow[]): string[] {
  const ran = new Set<string>()
  const unran = new Set<string>()
  const note = (lines: string[], didRun: boolean) => lines.forEach(line => (didRun ? ran : unran).add(line))
  const callCommands = new Map<string, string>()
  for (const row of rows) {
    const p = record(row.payload)
    const item = record(p.item)
    const isDeclined = item.status === 'declined'
    if (row.type === 'event_msg' && p.type === 'item_completed') {
      if (item.type === 'CommandExecution') note(shellLines(commandText(item.command)), !isDeclined)
      else if (item.type === 'FileChange') note(editedLines(item.changes), !isDeclined)
      else if (item.type === 'McpToolCall') note(toolLines(`mcp__${textOf(item.server)}__${textOf(item.tool)}`), true)
      continue
    }
    if (row.type !== 'response_item') continue
    const callId = textOf(p.call_id)
    if (p.type === 'function_call' || p.type === 'local_shell_call') {
      const command = callCommand(p)
      if (command !== '' && callId !== '') callCommands.set(callId, command)
    } else if (p.type === 'function_call_output') {
      const output = outputText(p.output)
      const command = callCommands.get(callId)
      if (command !== undefined) note(shellLines(command), !UNRAN_OUTPUT.test(output))
      note(blockedLines(output), false)
    } else if (p.type === 'custom_tool_call_output') {
      note(blockedLines(Array.isArray(p.output) ? contentText(p.output) : textOf(p.output)), false)
    }
  }

  return [...unran].filter(line => !ran.has(line))
}
