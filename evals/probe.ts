import { appendFileSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { EMPTY } from '../hooks/ledger'
import { CLAUDE_CODE, guidedCloseDescription } from '../hooks/model-text'
import { agentTools, isAgentTool, toolAnswer } from '../hooks/tools'
import { CODEX } from '../codex/src/texts'
import type { Ledger } from '../types'

const { values } = parseArgs({ options: { state: { type: 'string' }, log: { type: 'string' } } })
const state: { agent: 'claude' | 'codex'; isGuided: boolean; ledger: Partial<Ledger> } = JSON.parse(
  readFileSync(values.state!, 'utf8'),
)
const host = state.agent === 'codex' ? CODEX : CLAUDE_CODE
let ledger = { ...EMPTY, ...state.ledger } as Ledger

/** Claude Code reads the guidance in `close`'s description, as in the mod; the other agents get it another way. */
const TOOLS = agentTools(host).map(tool =>
  state.agent === 'claude' && state.isGuided && tool.name === 'close'
    ? {
        ...tool,
        description: guidedCloseDescription(host, tool.description).replaceAll('mcp__inbox__', 'mcp__probe__'),
      }
    : tool,
)

function send(id: unknown, result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function call(name: string, args: Record<string, unknown>): { text: string; isError: boolean } {
  if (!isAgentTool(name)) return { text: `Unknown tool: ${name}`, isError: true }
  const r = toolAnswer(host, ledger, name, args, Date.now())
  ledger = r.ledger
  appendFileSync(values.log!, `${JSON.stringify({ tool: name, args, result: r.result })}\n`)

  return { text: r.result, isError: false }
}

createInterface({ input: process.stdin }).on('line', line => {
  const msg = JSON.parse(line)
  if (msg.id === undefined) return
  switch (msg.method) {
    case 'initialize':
      return send(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'probe', version: '0.0.0' },
      })
    case 'tools/list':
      return send(msg.id, { tools: TOOLS })
    case 'tools/call': {
      const r = call(msg.params?.name, msg.params?.arguments ?? {})
      return send(msg.id, { content: [{ type: 'text', text: r.text }], isError: r.isError })
    }
    default:
      return send(msg.id, {})
  }
})
