import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

import { EMPTY } from '../hooks/ledger'
import { guidanceText } from '../hooks/model-text'
import { promptNotes, TOLD_NOTHING } from '../hooks/inbox-text'
import { agentTools, toolAnswer } from '../hooks/tools'
import type { AgentTool } from '../hooks/tools'
import { OMP } from '../omp/src/texts'
import type { Ledger } from '../types'

/**
 * The stand-in for omp/src/host.ts in the agent eval, as probe.ts is for the MCP hosts. It registers the real `record`
 * and `close` tools and answers them from the case's ledger. It mirrors only what decides what the model reads in
 * host.ts: the tools, the guidance appended to the system prompt, and the inbox notes as a hidden custom message.
 * `promptNotes` is the function host.ts reaches through `notePrompt`. The real host's state, panel and band are not
 * loaded.
 *
 * The runner passes the case through the environment. INBOX_EVAL_STATE holds `{ shown, ledger }`: the inbox the agent is
 * shown, and the inbox the tools answer from. INBOX_EVAL_LOG is the file each call is appended to. INBOX_EVAL_TOOLS is
 * the file where the probe writes the tools the session offers, which the runner checks. INBOX_EVAL_NO_GUIDANCE=1
 * leaves the guidance out, for the control run.
 */
const MESSAGE_TYPE = 'inbox'

type State = { shown: Partial<Ledger>; ledger: Partial<Ledger> }

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)

  return value
}

const statePath = required('INBOX_EVAL_STATE')
const logPath = required('INBOX_EVAL_LOG')
const toolsPath = required('INBOX_EVAL_TOOLS')
const isGuided = process.env.INBOX_EVAL_NO_GUIDANCE !== '1'
const state: State = JSON.parse(readFileSync(statePath, 'utf8'))
const shown = { ...EMPTY, ...state.shown } as Ledger
let ledger = { ...EMPTY, ...state.ledger } as Ledger

/**
 * The slice of omp's `ExtensionAPI` this extension uses. It is declared here because the eval is typed with the
 * Codex plugin's tools, which do not install omp's packages.
 */
type Pi = {
  on(
    event: 'before_agent_start',
    handler: (event: { prompt: string; systemPrompt: string[] }) => {
      systemPrompt: string[]
      message?: { customType: string; content: string; display: boolean; attribution: 'agent' }
    },
  ): void
  getActiveTools(): string[]
  getAllTools(): { name: string; sourceInfo: { origin: string; source: string } }[]
  registerTool(tool: {
    name: string
    label: string
    description: string
    parameters: object
    loadMode: 'essential'
    approval: 'read'
    execute: (toolCallId: string, args: unknown) => Promise<{ content: { type: 'text'; text: string }[] }>
  }): void
}

export default function (pi: Pi): void {
  pi.on('before_agent_start', event => {
    const all = pi.getAllTools().map(t => ({ name: t.name, origin: t.sourceInfo.origin, source: t.sourceInfo.source }))
    writeFileSync(toolsPath, JSON.stringify({ active: pi.getActiveTools(), all }))
    const text = guidanceText(OMP)
    const systemPrompt =
      !isGuided || event.systemPrompt.includes(text) ? event.systemPrompt : [...event.systemPrompt, text]
    const { notes } = promptNotes(
      OMP,
      { ...shown, turn: shown.turn + 1 },
      { text: event.prompt, isPress: false, isOpen: false },
      TOLD_NOTHING,
    )
    if (notes.length === 0) return { systemPrompt }

    return {
      systemPrompt,
      message: { customType: MESSAGE_TYPE, content: notes.join('\n\n'), display: false, attribution: 'agent' as const },
    }
  })

  const tool = (name: AgentTool, description: string, parameters: object) => {
    pi.registerTool({
      name,
      label: `Inbox ${name}`,
      description,
      parameters,
      loadMode: 'essential',
      approval: 'read',
      execute: async (_toolCallId, args) => {
        const r = toolAnswer(OMP, ledger, name, args as Record<string, unknown>, Date.now())
        ledger = r.ledger
        appendFileSync(logPath, `${JSON.stringify({ tool: name, args, result: r.result })}\n`)

        return { content: [{ type: 'text', text: r.result }] }
      },
    })
  }
  for (const { name, description, inputSchema } of agentTools(OMP)) tool(name, description, inputSchema)
}
