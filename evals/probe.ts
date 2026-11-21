import { appendFileSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { EMPTY } from '../core/domain/ledger'
import { CLAUDE_CODE } from '../core/domain/model-text'
import { isAgentTool, toolAnswer } from '../core/runtime/tools'
import type { DelegateSession } from '../core/remote/hc-terminals'
import { CODEX } from '../codex/src/texts'
import type { LastAction, Ledger } from '../types'
import { caseEarlier, type CaseAnswer } from './case-history'
import { servedTools, type CaseTools } from './probe-tools'

const { values } = parseArgs({ options: { state: { type: 'string' }, log: { type: 'string' } } })
const state: {
  agent: 'claude' | 'codex'
  isGuided: boolean
  ledger: Partial<Ledger>
  lastActions: Record<string, LastAction>
  tools: CaseTools | null
  delegate: DelegateSession | null
  history: CaseAnswer[]
} = JSON.parse(readFileSync(values.state!, 'utf8'))
const host = state.agent === 'codex' ? CODEX : CLAUDE_CODE
let ledger = { ...EMPTY, ...state.ledger } as Ledger
const presses = { lastActions: state.lastActions, turnStartedAt: Date.now() }
const offered = servedTools(host, state.tools, state.agent === 'claude' && state.isGuided)

function send(id: unknown, result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function call(name: string, args: Record<string, unknown>): { text: string; isError: boolean } {
  if (!isAgentTool(name)) return { text: `Unknown tool: ${name}`, isError: true }
  const now = Date.now()
  const earlier = name === 'record' ? caseEarlier(state.history ?? [], args, now) : []
  const r = toolAnswer(host, ledger, name, args, now, presses, offered.fields, state.delegate, earlier)
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
      return send(msg.id, { tools: offered.tools })
    case 'tools/call': {
      const r = call(msg.params?.name, msg.params?.arguments ?? {})
      return send(msg.id, { content: [{ type: 'text', text: r.text }], isError: r.isError })
    }
    default:
      return send(msg.id, {})
  }
})
