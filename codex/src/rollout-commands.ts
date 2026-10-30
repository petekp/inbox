import { resolve } from 'node:path'

import { dialogActivity, dialogQuestions, toolActivity } from '../../hooks/model-text'
import { patchFiles } from './core'
import { isText, jsonRecord, textOf } from './rollout-rows'
import type { Payload, RowPayload, TranscriptLine } from './rollout-rows'

export const DIALOG_TOOL = 'request_user_input_async'

const SHELL_CALLS = new Set(['shell', 'shell_command', 'exec_command', 'container.exec'])

/** The command line of an argv such as `["/bin/zsh", "-lc", "gh pr create"]`, without its shell wrapper. */
export function commandText(command: unknown): string {
  if (isText(command)) return command
  if (!Array.isArray(command)) return ''
  const argv = command.filter(isText)
  const [, flag, script] = argv

  return argv.length === 3 && flag?.startsWith('-') && flag.endsWith('c') && script !== undefined
    ? script
    : argv.join(' ')
}

/** A function call's output is its text, or JSON holding the text as `output`. */
export function outputText(output: unknown): string {
  if (!isText(output)) return ''
  try {
    const parsed = JSON.parse(output) as { output?: unknown }

    return isText(parsed.output) ? parsed.output : output
  } catch {
    return output
  }
}

export function callCommand(p: NonNullable<TranscriptLine['payload']>): string {
  if (p.type === 'local_shell_call') return commandText(p.action?.command)
  if (p.type !== 'function_call' || !p.name || !SHELL_CALLS.has(p.name) || !isText(p.arguments)) return ''
  try {
    const args = JSON.parse(p.arguments) as { command?: unknown; cmd?: unknown }

    return commandText(args.command ?? args.cmd)
  } catch {
    return ''
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

export const shellLines = (command: string): string[] => {
  const line = command === '' ? null : toolActivity('Bash', { command })

  return line ? [line] : []
}

const editLines = (patch: string, cwd: string): string[] =>
  patchFiles(patch).map(file => `edited ${resolve(cwd || '/', file)}`)

/**
 * The activity lines of one tool call row. A call that a `CommandExecution` row also records gives no shell line, so
 * a command is not counted twice.
 */
export function callLines(p: Payload, hasCommandRows: boolean, cwd: string): string[] {
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
    const line = toolActivity('Agent', { description: textOf(args.task_name) })

    return line ? [line] : []
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: 'open' })]
  const line = toolActivity(textOf(p.namespace).startsWith('mcp__') ? textOf(p.namespace) + name : name, {})

  return line ? [line] : []
}
