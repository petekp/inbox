import type { Host } from '../hooks/model-text'
import { TOOL_FIELDS, V0_3_TOOL_FIELDS } from '../hooks/tool-schemas'
import { agentTools } from '../hooks/tools'
import type { ToolFields } from '../types'

/** The inbox tools a case gives the agent: this build's, or with `0.3.0`, those a session that 0.3.0 started keeps. */
export type CaseTools = '0.3.0'

/**
 * The tools a probe offers for a case, and their fields, which the answers take. A case that names no tools gets this
 * build's, as a new session does. With `0.3.0`, each schema keeps only 0.3.0's fields, and record has 0.3.0's
 * description, as a session 0.3.0 started sends them. The other descriptions, and the guidance in close's, are this
 * build's.
 */
export function probeTools(host: Host, tools: CaseTools | null | undefined) {
  if (tools !== '0.3.0') return { tools: agentTools(host), fields: TOOL_FIELDS }
  const only = (schema: Record<string, unknown>, fields: string[]) => ({
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>).filter(([field]) => fields.includes(field)),
    ),
  })
  const fields: ToolFields = V0_3_TOOL_FIELDS

  const offered = agentTools(host).map(t => ({
    ...t,
    ...(t.name === 'record' && { description: v0_3RecordDescription(host) }),
    inputSchema: only(t.inputSchema, fields[t.name]),
  }))

  return { tools: offered, fields }
}

/** The record tool's description in 0.3.0, from `recordDescription` in v0.3.0's `hooks/tools.ts`. */
function v0_3RecordDescription(host: Host): string {
  return `Record something the user must see in ${host.surface}, and still say it in your reply. Use it in the turn you raise it, once for each thing.
- question: a decision, approval or piece of information only the user has, which you need before you go on. Give options, and rec when you recommend one. This includes an act you hold until they say so, such as "say when you want those committed".
- task: a step only the user can do, such as signing in or running a command with their password. Put the commands, files and links in steps. A step your own tools can take is not a task: take it, or ask for their OK as a question when it changes something other people see.
- finding: something outside the current task that deserves their attention. It waits in ${host.findingsIn} until it is closed, and the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, once you have checked it. Leave out style nits, anything the user already decided, todos or ideas the user mentioned, problems in your own change, progress, and anything only the user can do or decide: handle those in your reply, or record them as a question or task.
Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.`
}
