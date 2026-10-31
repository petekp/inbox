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
import type { Exchange } from '../hooks/ledger'
import type { Update } from '../hooks/reply-parse'
import type { Ledger } from '../types'
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
  report,
  resultsPath,
  runCount,
  runJobs,
  selectCases,
  writeResults,
} from './harness'
import type { Job, Run } from './harness'

type Agent = 'claude' | 'codex'

/** Patterns are case-insensitive regular expressions. */
type Check =
  | { open: string }
  | { closed: string; outcome?: string }
  | { added: number }
  | { new: string; kind?: 'question' | 'task'; rec?: string | null; help?: string; design?: boolean }
  | { notNew: string }
  | { noHelp: string }
  | { item: string; rec?: string; options?: string }
  | { waiting: string; options?: string; rec?: string }
  | { openItems: number }
  /** NEW lines the code dropped as repeats, which the other checks cannot see. */
  | { dropped: number }

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
/** The mod's limits on the inbox model's call, in `askLedgerModel` and its caller in `hooks/register.tsx`. */
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

/** Pairs each check with its own item, so one item cannot pass two checks, by augmenting paths. */
function matchEach<C, I>(checks: C[], items: I[], fits: (c: C, i: I) => boolean): Map<C, I> {
  const owner = new Map<I, C>()
  const claim = (c: C, seen: Set<I>): boolean =>
    items.some(i => {
      if (seen.has(i) || !fits(c, i)) return false
      seen.add(i)
      const held = owner.get(i)
      if (held !== undefined && !claim(held, seen)) return false
      owner.set(i, c)

      return true
    })
  for (const c of checks) claim(c, new Set())

  return new Map([...owner].map(([i, c]) => [c, i]))
}

function failures(before: Ledger, after: Ledger, checks: Check[], masked: string[]): string[] {
  const has = (pattern: string, text: string | null) => text !== null && new RegExp(pattern, 'i').test(text)
  const added = after.items.filter(i => !before.items.some(b => b.id === i.id))
  const isOpen = (id: string) => after.items.some(i => i.id === id) || after.findings.some(f => f.id === id)
  const closedOutcome = (id: string) =>
    after.closed.find(c => c.id === id)?.outcome ?? after.closedFindings.find(f => f.id === id)?.outcome ?? null
  const newChecks = checks.filter((c): c is Extract<Check, { new: string }> => 'new' in c)
  const newMatches = matchEach(
    newChecks,
    added,
    (c, i) =>
      has(c.new, i.ask) &&
      (!c.kind || i.kind === c.kind) &&
      (c.rec === undefined || (c.rec === null ? i.rec === null : has(c.rec, i.rec))) &&
      (!c.help || i.helps.some(h => h.kind === c.help)) &&
      (c.design === undefined || (i.isDesignChoice === true) === c.design),
  )
  const out: string[] = []
  for (const c of checks) {
    if ('open' in c && !isOpen(c.open)) out.push(`${c.open} closed`)
    else if ('closed' in c) {
      const outcome = closedOutcome(c.closed)
      if (outcome === null) out.push(`${c.closed} still open`)
      else if (c.outcome && !has(c.outcome, outcome)) out.push(`${c.closed} closed as "${outcome}"`)
    } else if ('added' in c && added.length !== c.added) out.push(`${added.length} items added`)
    else if ('new' in c) {
      const match = newMatches.get(c)
      if (!match)
        out.push(
          `no new item like /${c.new}/: ${added.map(i => `"${i.ask}" kind=${i.kind} rec=${i.rec} design=${i.isDesignChoice === true} helps=${i.helps.map(h => h.kind).join('+') || '-'}`).join(', ')}`,
        )
    } else if ('notNew' in c && added.some(i => has(c.notNew, i.ask))) out.push(`added an item like /${c.notNew}/`)
    else if ('noHelp' in c && added.some(i => i.helps.some(h => h.kind === c.noHelp))) out.push(`a ${c.noHelp} step`)
    else if ('waiting' in c) {
      const match = after.items.find(
        i =>
          has(c.waiting, i.ask) &&
          (!c.options || has(c.options, i.options.join(' / '))) &&
          (!c.rec || has(c.rec, i.rec)),
      )
      if (!match)
        out.push(
          `no open item like /${c.waiting}/: ${after.items.map(i => `"${i.ask}" options=${i.options.join(' / ')} rec=${i.rec}`).join(', ')}`,
        )
    } else if ('dropped' in c && masked.length !== c.dropped)
      out.push(`the code dropped ${masked.length} NEW lines: ${masked.map(a => `"${a}"`).join(', ')}`)
    else if ('openItems' in c && after.items.length !== c.openItems)
      out.push(`${after.items.length} open items: ${after.items.map(i => `"${i.ask}"`).join(', ')}`)
    else if ('item' in c) {
      const item = after.items.find(i => i.id === c.item)
      if (!item) out.push(`${c.item} closed`)
      else if (c.rec && !has(c.rec, item.rec)) out.push(`${c.item} rec=${item.rec}`)
      else if (c.options && !has(c.options, item.options.join(' / ')))
        out.push(`${c.item} options ${item.options.join(' / ')}`)
    }
  }

  return out
}

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
  /** How long the call took. The mod's limit applies to it. */
  ledgerMs?: number
}

function maskedAsks(update: Update, before: Ledger, after: Ledger): string[] {
  const made = new Set(after.items.filter(i => !before.items.some(b => b.id === i.id)).map(i => i.ask))

  return update.added.map(a => a.ask).filter(ask => !made.has(ask))
}

async function once(agent: Agent, c: Case, n: number): Promise<Result> {
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
  const ask = (input: string, system: string): Promise<Answer> =>
    agent === 'codex'
      ? askCodex(input, system).then(text => ({ text, model: null, outputTokens: null }))
      : claude(input, system)
  const runInfo = { ...job(agent, c, n), attempts: 1, earlier: [], durationMs: 0 }
  const prompt =
    c.catchUp === undefined ? buildPrompt(ledger, ex) : transcriptCatchUpPrompt(ledger, ex.screen, c.catchUp)
  const ledgerStarted = Date.now()
  const ledgerCall = await ask(prompt, systemText(host))
  const ledgerMs = Date.now() - ledgerStarted
  const { text: answer, model, outputTokens } = ledgerCall
  const base = {
    ...runInfo,
    model,
    answer,
    outputTokens,
    inputTokens: ledgerCall.inputTokens ?? null,
    cachedTokens: ledgerCall.cachedTokens ?? null,
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
const verdict = report(agents, cases, judged, runs, MIN, readBaselines(about.suite), (_agent, _c, mine) => {
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
finish(
  about,
  path,
  judged,
  stopped,
  verdict,
  values['set-baseline'],
  cases.map(c => c.name),
)
