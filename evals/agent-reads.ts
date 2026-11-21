import { CODEX } from '../codex/src/texts'
import { EMPTY } from '../core/domain/ledger'
import { CLAUDE_CODE, guidanceText } from '../core/domain/model-text'
import type { Host } from '../core/domain/model-text'
import { toolAnswer } from '../core/runtime/tools'
import type { AgentTool } from '../core/runtime/tools'
import { OMP } from '../omp/src/texts'
import type { Ledger } from '../types'
import type { Agent, Case } from './agent-checks'
import { guidance, message } from './agent-cli'
import { caseEarlier } from './case-history'
import { ompNotes, servedTools } from './probe-tools'

const HOSTS: Record<Agent, Host> = { claude: CLAUDE_CODE, codex: CODEX, omp: OMP }

/** A fixed time for the sample answers, so the same build gives the same answers in every run. */
const SAMPLE_NOW = 1_000_000

/** Calls whose answers stand for the tools' answers, with a close and a repeat record for each open row. */
const SAMPLE_CALLS: [AgentTool, Record<string, unknown>][] = [
  [
    'record',
    {
      kind: 'question',
      ask: 'Which cache should the API use?',
      context: 'The API needs a cache before launch.',
      options: ['Redis', 'In-memory'],
      rec: 'Redis',
      why: 'it is shared across hosts',
    },
  ],
  ['record', { kind: 'question', ask: 'Which cache should the API use?' }],
  ['record', { kind: 'task', ask: 'Sign in to GitHub', steps: ['gh auth login'] }],
  [
    'record',
    {
      kind: 'finding',
      title: 'A test fails one run in ten',
      detail: 'It races the server start.',
      finding_kind: 'issue',
    },
  ],
  ['close', { id: 'i999', reason: 'no longer applies' }],
  ['order_prs', { numbers: [12, 7], repo: 'acme/web', label: 'Review in this order', why: '7 waits on 12' }],
  ['order_prs', { numbers: [] }],
]

/**
 * What an agent's model reads for a case: the guidance where that agent gets it outside the tools, the tools the
 * probe serves, the text the case's prompt arrives with, and the answers to sample calls on the inbox the tools answer
 * from.
 */
export function readsFor(agent: Agent, c: Case, isGuided: boolean): string[] {
  const host = HOSTS[agent]
  const { tools, fields } = servedTools(host, c.tools, agent === 'claude' && isGuided)
  const ledger = { ...EMPTY, ...(c.toolLedger ?? c.ledger) } as Ledger
  const presses = { lastActions: c.lastActions ?? {}, turnStartedAt: SAMPLE_NOW }
  const rowCalls: [AgentTool, Record<string, unknown>][] = [
    ...ledger.items.flatMap((i): [AgentTool, Record<string, unknown>][] => [
      ['record', { kind: i.kind, ask: i.ask }],
      ['close', { id: i.id, answer: 'yes' }],
    ]),
    ...ledger.findings.map((f): [AgentTool, Record<string, unknown>] => ['close', { id: f.id, reason: 'fixed' }]),
    ...(c.history ?? []).map((h): [AgentTool, Record<string, unknown>] => [
      'record',
      { kind: 'question', ask: h.ask, options: ['Yes', 'No'] },
    ]),
  ]
  const answers = [...SAMPLE_CALLS, ...rowCalls].map(([name, args]) => {
    const earlier = name === 'record' ? caseEarlier(c.history ?? [], args, SAMPLE_NOW) : []
    return toolAnswer(host, ledger, name, args, SAMPLE_NOW, presses, fields, c.delegate ?? null, earlier).result
  })
  const shown = { ...EMPTY, ...c.ledger } as Ledger
  const told = agent === 'omp' ? [...ompNotes(host, shown, c.prompt), c.prompt] : [message(c, host)]
  const instructions = !isGuided || agent === 'claude' ? '' : agent === 'codex' ? guidance(CODEX) : guidanceText(OMP)

  return [instructions, JSON.stringify(tools), ...told, ...answers]
}
