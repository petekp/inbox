import { appendFileSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { EMPTY, upgradeLedger } from '../hooks/ledger'
import { CLAUDE_CODE } from '../hooks/model-text'
import {
  CLOSE_DESCRIPTION,
  CLOSE_SCHEMA,
  RECORD_SCHEMA,
  recordClose,
  recordDescription,
  recordItem,
} from '../hooks/tools'
import { CODEX } from '../codex/src/texts'
import type { Ledger } from '../types'

const { values } = parseArgs({ options: { state: { type: 'string' }, log: { type: 'string' } } })
const state: { agent: 'claude' | 'codex'; ledger: Partial<Ledger> } = JSON.parse(readFileSync(values.state!, 'utf8'))
const host = state.agent === 'codex' ? CODEX : CLAUDE_CODE
let ledger = upgradeLedger({ ...EMPTY, ...state.ledger } as Ledger)

const TOOLS = [
  { name: 'record', description: recordDescription(host), inputSchema: RECORD_SCHEMA },
  { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
]

function send(id: unknown, result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function call(name: string, args: Record<string, unknown>): { text: string; isError: boolean } {
  const tool = name === 'record' ? recordItem : name === 'close' ? recordClose : null
  if (!tool) return { text: `Unknown tool: ${name}`, isError: true }
  const r = tool(host, ledger, args, Date.now())
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
