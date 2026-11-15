// Finds the tool calls of a turn that did not run, so their activity lines and delegate rows can be taken back. Codex's
// PreToolUse hook adds a call's line and rows before the person approves the call, and before other hooks can block it.

import { toolActivity } from '../../hooks/catch-up-text'
import { delegateRefs } from '../../hooks/children'
import { callCommand, commandText, outputText, scriptCommands, shellLines } from './rollout-commands'
import { record, textOf } from './rollout-rows'
import type { RolloutRow } from './rollout-rows'

/** Rollout markers of the rows `unranCalls` reads, for a reader that parses only the lines holding one. */
export const UNRAN_MARKERS = [
  '"CommandExecution"',
  '"FileChange"',
  '"McpToolCall"',
  '"function_call',
  '"custom_tool_call"',
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

/**
 * A code-mode script's output is a list of parts. When the script ended on an error it did not catch, the first part
 * starts with `SCRIPT_FAILED` and the last with `SCRIPT_ERROR`, followed by the error.
 */
const SCRIPT_FAILED = 'Script failed\n'
const SCRIPT_ERROR = /^Script error:\s*/

/**
 * The error a code-mode script ends on when the person declines one of its `exec_command` calls. Codex writes the
 * rejection as Rust debug text, as in `exec_command failed: CreateProcess { message: "Rejected(\"rejected by user\")" }`.
 */
const SCRIPT_DECLINED = /^exec_command failed: [^\n]*Rejected\(\\?"(?:exec command )?rejected by user\\?"\)/

/**
 * A code-mode script whose output has not come yet. `recorded` holds the commands of the `CommandExecution` rows
 * written while it runs, and `declined` those of the rows marked declined. `isShared` is whether another call ran
 * alongside it, so that rows written while it runs may be that call's.
 */
type OpenScript = { commands: string[] | null; recorded: Set<string>; declined: Set<string>; isShared: boolean }

/**
 * The command the person declined in a script that ended on `error`, or '' when that cannot be told. A command Codex
 * rejects before it starts gets no `CommandExecution` row, or one marked declined. But a command still running
 * when the script ends has no row either. So the declined command is known only when it is the one command of the
 * script with no row.
 */
function declinedScriptCommand(script: OpenScript, error: string): string {
  const isKnowable = SCRIPT_DECLINED.test(error) && !script.isShared
  const unrecorded = isKnowable ? (script.commands ?? []).filter(command => !script.recorded.has(command)) : []

  return unrecorded.length === 1 ? (unrecorded[0] ?? '') : ''
}

/** The error a code-mode script's output ends on, or '' when the script did not end on one. */
function scriptError(output: unknown): string {
  const parts = Array.isArray(output) ? output.map(part => textOf(record(part).text)) : []
  const isFailed = parts.length > 1 && parts[0]?.startsWith(SCRIPT_FAILED) === true
  const last = isFailed ? (parts.at(-1) ?? '') : ''
  const prefix = SCRIPT_ERROR.exec(last)?.[0]

  return prefix === undefined ? '' : last.slice(prefix.length)
}

/** A script's commands that may have run: each, save one a row marks declined. */
const scriptRan = (script: OpenScript | undefined): string[] =>
  (script?.commands ?? []).filter(command => !script?.declined.has(command))

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
  const scripts = new Map<string, OpenScript>()
  const openCalls = new Set<string>()
  for (const row of rows) {
    const p = record(row.payload)
    const item = record(p.item)
    const isDeclined = item.status === 'declined'
    if (row.type === 'event_msg' && p.type === 'item_completed') {
      if (item.type === 'CommandExecution') {
        const command = commandText(item.command)
        noteCommand(command, !isDeclined)
        scripts.forEach(script => (isDeclined ? script.declined : script.recorded).add(command))
      } else if (item.type === 'FileChange') note(editedLines(item.changes), !isDeclined)
      else if (item.type === 'McpToolCall') note(toolLines(`mcp__${textOf(item.server)}__${textOf(item.tool)}`), true)
      continue
    }
    if (row.type !== 'response_item') continue
    const callId = textOf(p.call_id)
    let block = { commands: [] as string[], lines: [] as string[] }
    const isScript = p.type === 'custom_tool_call' && p.name === 'exec'
    if (p.type === 'function_call' || p.type === 'local_shell_call' || p.type === 'custom_tool_call') {
      if (openCalls.size > 0) scripts.forEach(script => (script.isShared = true))
      if (isScript) {
        const commands = scriptCommands(textOf(p.input))
        scripts.set(callId, { commands, recorded: new Set(), declined: new Set(), isShared: openCalls.size > 0 })
      }
      const command = isScript ? '' : callCommand(p)
      if (command !== '' && callId !== '') callCommands.set(callId, command)
      openCalls.add(callId)
    } else if (p.type === 'function_call_output') {
      openCalls.delete(callId)
      const output = outputText(p.output)
      const command = callCommands.get(callId)
      callCommands.delete(callId)
      if (command !== undefined) noteCommand(command, !isUnranOutput(output))
      block = blocked(output)
    } else if (p.type === 'custom_tool_call_output') {
      openCalls.delete(callId)
      const error = scriptError(p.output)
      const script = scripts.get(callId)
      scripts.delete(callId)
      block = blocked(error)
      const isBlockNamed = block.commands.length > 0 || block.lines.length > 0
      const declined = script && !isBlockNamed ? declinedScriptCommand(script, error) : ''
      const unranCommands = new Set([declined, ...block.commands])
      scriptRan(script).forEach(command => noteCommand(command, !unranCommands.has(command)))
    }
    note(block.lines, false)
    block.commands.forEach(command => noteCommand(command, false))
  }
  // A call with no output yet still runs.
  callCommands.forEach(command => delegateRefs(command).forEach(ref => ranDelegates.add(ref)))
  scripts.forEach(script =>
    scriptRan(script).forEach(command => delegateRefs(command).forEach(ref => ranDelegates.add(ref))),
  )

  return {
    lines: [...unran].filter(line => !ran.has(line)),
    delegates: [...unranDelegates].filter(ref => !ranDelegates.has(ref)),
  }
}
