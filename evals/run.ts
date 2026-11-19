import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { EMPTY, upgradeLedger } from '../hooks/ledger'
import { applyExchangeUpdate, applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { buildPrompt, systemText } from '../hooks/ledger-prompt'
import { CLAUDE_CODE } from '../hooks/model-text'
import { screenText } from '../hooks/inbox-text'
import { transcriptCatchUpPrompt } from '../hooks/catch-up-text'
import { CODEX } from '../codex/src/texts'
import type { Exchange, Ledger } from '../types'
import { run } from '../codex/src/run'
import { codexAsk, MODEL } from '../codex/src/update'
import { claude, CLAUDE_MODEL } from './claude-model'
import type { Answer } from './claude-model'
import { codexCli } from './codex-cli'
import {
  earlierRuns,
  finish,
  provenance,
  readBaselines,
  readCases,
  repoFile,
  report,
  resultsPath,
  runCount,
  runJobs,
  selectCases,
  stamp,
  writeResults,
} from './harness'
import type { Job, Run, Stamps } from './harness'
import { failures, maskedAsks } from './model-checks'
import type { Check } from './model-checks'

type Agent = 'claude' | 'codex'

type Case = {
  name: string
  about: string
  ledger: Partial<Ledger>
  exchange: Partial<Omit<Exchange, 'screen'>>
  /** What the inbox shows, built with `screenText` for each agent's host. Closed when left out. */
  screen?: { isOpen: boolean; tab?: string; isPage?: boolean }
  /** A conversation to catch the ledger up on, in place of the exchange's per-reply update. */
  catchUp?: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
}

const MIN = 0.75
const NOW = 100
/** The mod's limits on the inbox model's call, in `askInboxModel` in `hooks/register.tsx`. */
const MOD_TIMEOUT_MS = 45_000
const MOD_MAX_TOKENS = 1600

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    runs: { type: 'string', default: '8' },
    case: { type: 'string' },
    out: { type: 'string' },
    'set-baseline': { type: 'boolean', default: false },
    with: { type: 'string' },
    cases: { type: 'string', default: 'evals/cases' },
  },
})
const AGENTS: Record<string, Agent[]> = { both: ['claude', 'codex'], claude: ['claude'], codex: ['codex'] }
const selected = AGENTS[values.agent]
if (!selected) throw new Error(`Unknown --agent ${values.agent}. Use claude, codex or both.`)
const agents: Agent[] = selected
const runs = runCount(values.runs)
const caseFiles = readCases<Case>(values.cases)
const cases: Case[] = selectCases(caseFiles.cases, values.case)
const about = provenance(
  'model',
  { claude: 'claude', codex: codexCli },
  {
    'systemText claude': systemText(CLAUDE_CODE),
    'systemText codex': systemText(CODEX),
    cases: caseFiles.text,
    models: JSON.stringify({ claude: CLAUDE_MODEL, codex: MODEL }),
    runner: readFileSync(process.argv[1]!, 'utf8'),
  },
)
const path = resultsPath(values.out, about)
const firstRuns = earlierRuns<Result>(values.with, about, path)

const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
// Without auth.json, codexAsk runs the model in the person's own Codex home, where it reads their AGENTS.md.
if (agents.includes('codex') && !existsSync(join(codexHome, 'auth.json')))
  throw new Error(`The Codex runs need a Codex sign-in in ${join(codexHome, 'auth.json')}, not the keyring`)
const codexData = mkdtempSync(join(tmpdir(), 'inbox-eval-'))
const askCodex = codexAsk(run, codexCli, codexData, codexHome)

/**
 * `masked`: the asks of the update's NEW lines that never became an item, because the code took them for a repeat of a
 * closed item or an open one. For reading only: the checks see the ledger after the code.
 */
type Result = Run & {
  /** The ledger call's answer. */
  answer: string | null
  masked: string[]
  outputTokens: number | null
  inputTokens?: number | null
  cachedTokens?: number | null
  /** What the call cost in US dollars, as the claude CLI reports it. Codex reports none. */
  costUsd?: number | null
  /** How long the call took. The mod's limit applies to it. */
  ledgerMs?: number
}

/** The ledger and exchange a case starts from, and the system text and prompt the model reads. */
function inputs(agent: Agent, c: Case) {
  const ledger = upgradeLedger({ ...EMPTY, ...c.ledger } as Ledger)
  const ex: Exchange = {
    person: null,
    trigger: null,
    activity: [],
    reply: '',
    turn: ledger.turn,
    press: null,
    tasks: [],
    screen: screenText(
      agent === 'codex' ? CODEX : CLAUDE_CODE,
      c.screen?.isOpen ?? false,
      c.screen?.tab === undefined ? null : { label: c.screen.tab, isPage: c.screen.isPage ?? false },
    ),
    ...c.exchange,
  }
  const host = agent === 'codex' ? CODEX : CLAUDE_CODE
  const prompt =
    c.catchUp === undefined ? buildPrompt(ledger, ex) : transcriptCatchUpPrompt(ledger, ex.screen, c.catchUp)

  return { ledger, ex, prompt, system: systemText(host) }
}

async function once(agent: Agent, c: Case, n: number): Promise<Result> {
  const { ledger, ex, prompt, system } = inputs(agent, c)
  const ask = (input: string, system: string): Promise<Answer> =>
    agent === 'codex'
      ? askCodex(input, system, { call: 'ledger', reads: 'reply', isRetry: false }).then(text => ({
          text,
          model: null,
          outputTokens: null,
        }))
      : claude(input, system)
  const runInfo = { ...job(agent, c, n), attempts: 1, earlier: [], durationMs: 0 }
  const ledgerStarted = Date.now()
  const ledgerCall = await ask(prompt, system)
  const ledgerMs = Date.now() - ledgerStarted
  const { text: answer, model, outputTokens } = ledgerCall
  const base = {
    ...runInfo,
    model,
    answer,
    outputTokens,
    inputTokens: ledgerCall.inputTokens ?? null,
    cachedTokens: ledgerCall.cachedTokens ?? null,
    costUsd: ledgerCall.costUsd ?? null,
    ledgerMs,
  }
  if (answer === null) return { ...base, error: `${agent} gave no answer`, failed: [], masked: [] }
  const parsed = parseReply(answer, c.catchUp ?? `${ex.reply}\n${ex.activity.join('\n')}`)
  if (parsed === null) return { ...base, error: null, failed: ['no answer the mod can read'], masked: [] }
  const applied =
    c.catchUp === undefined
      ? applyExchangeUpdate(ledger, parsed, ex, NOW, NOW)
      : applyUpdate(ledger, parsed, NOW, ledger.turn, NOW)
  const masked = maskedAsks(parsed, ledger, applied)

  return { ...base, error: null, failed: failures(ledger, applied, c.checks, masked), masked }
}

function job(agent: Agent, c: Case, n: number) {
  return { agent, name: c.name, run: n, requested: agent === 'codex' ? MODEL : CLAUDE_MODEL }
}

const jobs: Job<Result>[] = agents.flatMap(a =>
  cases.flatMap(c =>
    Array.from({ length: runs }, (_, n) => ({
      go: () => once(a, c, n),
      unrun: (error: string): Result => ({
        ...job(a, c, n),
        model: null,
        answer: null,
        outputTokens: null,
        masked: [],
        error,
        failed: [],
        attempts: 1,
        earlier: [],
        durationMs: 0,
      }),
    })),
  ),
)
const { results, stopped } = await runJobs(jobs, so => writeResults(path, about, so))
writeResults(path, about, results, stopped)
const judged = [...firstRuns, ...results]
const GRADING = ['hooks/reply-parse.ts', 'hooks/ledger-update.ts', 'evals/model-checks.ts'].map(repoFile)
const CALL: Record<Agent, string> = { claude: repoFile('evals/claude-model.ts'), codex: MODEL }
const stamps: Stamps = Object.fromEntries(
  agents.flatMap(a =>
    cases.map(c => {
      const { prompt, system } = inputs(a, c)
      return [`${a} ${c.name}`, stamp(c, [system, prompt], [...GRADING, CALL[a]])]
    }),
  ),
)
const verdict = report(agents, cases, judged, runs, MIN, readBaselines(about.suite), stamps, (_agent, _c, mine) => {
  const runs = mine as Result[]
  const masked = runs.reduce((sum, r) => sum + r.masked.length, 0)
  const slow = runs.filter(r => (r.ledgerMs ?? r.durationMs) > MOD_TIMEOUT_MS).length
  const long = runs.filter(r => (r.outputTokens ?? 0) > MOD_MAX_TOKENS).length
  const notes = [
    masked > 0 ? `${masked} NEW lines dropped by the code` : '',
    slow > 0 ? `${slow} slower than the mod's ${MOD_TIMEOUT_MS / 1000} s limit` : '',
    long > 0 ? `${long} longer than the mod's ${MOD_MAX_TOKENS} tokens` : '',
  ].filter(Boolean)

  return notes.length > 0 ? `, ${notes.join(', ')}` : ''
})
rmSync(codexData, { recursive: true, force: true })
finish(about, path, judged, stopped, verdict, values['set-baseline'], stamps)
