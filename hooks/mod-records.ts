import type { ToolResultOf } from 'claude-code'
import { activityGate } from './children'
import { herdrCheckGate, herdrReporter } from './herdr'
import { clipLabel } from './text'
import { baseName } from './presses'

/** The tools Claude Code writes its own task list with. They are off unless the person turns them on. */
export const HOST_TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])
export const TOOLS_REFUSED_TEXT =
  "Claude cannot record or close items here. Your organization's settings block the inbox's tools."
export const MAX_PERSON_LINES = 200
/**
 * The calls tool.check saw that may still wait on a dialog: tool_use_id to `callKey`, the key their dialog has. A
 * call leaves when its verdict is not an ask, when it starts running and when it ends.
 */
export const askedCalls = new Map<string, string>()
/** Each agent this session spawned inside a child: its id to the Workflow call or the agent that spawned it. */
export const spawnedBy = new Map<string, string>()
/** Each Workflow call's tool_use_id to the task id its child is kept under. */
export const workflowTasks = new Map<string, string>()
/** Each background `herdr agent wait`'s task id and tool_use_id to the delegate it waits on. */
export const delegateWaits = new Map<string, string>()
export const reportToHerdr = herdrReporter()

export function callKey(tool: string, input: Record<string, unknown>): string {
  const main = ['command', 'file_path', 'notebook_path', 'url', 'pattern', 'query', 'skill', 'description'].find(
    k => typeof input[k] === 'string',
  )

  return main ? `${tool} ${main}=${String(input[main])}` : `${tool} ${JSON.stringify(input)}`
}

export function permissionText(tool: string, input: Record<string, unknown>): string {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const file = (key: string) => baseName(text(key))
  switch (tool) {
    case 'Bash': {
      const said = text('description') || text('command')
      return clipLabel(/^[A-Z][a-z]/.test(said) ? said.charAt(0).toLowerCase() + said.slice(1) : said, 60)
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return `edit ${file('file_path')}`
    case 'NotebookEdit':
      return `edit ${file('notebook_path')}`
    case 'Read':
      return `read ${file('file_path')}`
    case 'Glob':
    case 'Grep':
      return `search ${text('path') ? `${file('path')} ` : ''}for ${clipLabel(text('pattern'), 30)}`
    case 'WebFetch':
      return `fetch ${
        text('url')
          .replace(/^https?:\/\//, '')
          .split('/')[0]
      }`
    case 'WebSearch':
      return `search the web for ${clipLabel(text('query'), 30)}`
    case 'Skill':
      return `use the ${text('skill')} skill`
    case 'Agent':
    case 'Task':
      return text('description') ? `run an agent: ${text('description')}` : 'run an agent'
    default:
      return tool.startsWith('mcp__') ? tool.slice(5).replace(/__/g, ' ') : tool
  }
}

export const isHerdrCheckDue = herdrCheckGate()

/** A tool's structured result, or undefined when the call answered with text alone. */
export function toolRecord<Name extends string>(_tool: Name, result: unknown): ToolResultOf<Name> | undefined {
  return typeof result === 'object' && result !== null ? (result as ToolResultOf<Name>) : undefined
}

/** The child an agent's work belongs to: the subagent itself, or the workflow or subagent that spawned it. */
export function childRefOf(agentId: string): string {
  let id = agentId
  for (let depth = 0; depth < 8 && spawnedBy.has(id); depth++) id = spawnedBy.get(id)!

  return workflowTasks.get(id) ?? id
}

export const isActivityWorthSaving = activityGate()
