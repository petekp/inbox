import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { applyExchangeUpdate, applyUpdate, EMPTY, parseReply, upgradeLedger, withResults } from '../hooks/ledger'
import {
  buildPrompt,
  CLAUDE_CODE,
  RESULTS_SYSTEM,
  resultsCatchUpPrompt,
  resultsPrompt,
  screenText,
  systemText,
  transcriptCatchUpPrompt,
} from '../hooks/model-text'
import { CODEX } from '../codex/src/texts'
import type { Exchange, Update } from '../hooks/ledger'
import type { Ledger } from '../types'
import { run } from '../codex/src/run'
import { codexAsk, MODEL } from '../codex/src/update'
import { codexCli } from './codex-cli'
import {
  earlierRuns,
  finish,
  provenance,
  readBaselines,
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
  | { done: string }
  | { new: string; kind?: 'question' | 'task'; rec?: string | null; help?: string }
  | { notNew: string }
  | { noHelp: string }
  | { item: string; rec?: string; options?: string }
  | { waiting: string; options?: string; rec?: string }
  | { openItems: number }
  /** NEW lines the code dropped as repeats, which the other checks cannot see. */
  | { dropped: number }
  /** The DONE lines this exchange added to the ledger's results, counted after the code's cap. */
  | { results: number }
  | { resultsAtLeast: number }
  | { result: string }
  | { noResult: string }

type Case = {
  name: string
  about: string
  ledger: Partial<Ledger>
  exchange: Partial<Omit<Exchange, 'screen'>> & { reply: string }
  /** What the inbox shows, built with `screenText` for each agent's host. Closed when left out. */
  screen?: { isOpen: boolean; tab?: string; isPage?: boolean }
  /** A conversation to catch the ledger up on, in place of the exchange's per-reply update. */
  catchUp?: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
}

const MIN = 0.75
const NOW = 100
/** The mod's limits on the inbox model's call, in `askLedgerModel` and its caller in `hooks/claude-host.ts`. */
const MOD_TIMEOUT_MS = 45_000
const MOD_MAX_TOKENS = 1600
const CLAUDE_MODEL = 'sonnet'

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    runs: { type: 'string', default: '8' },
    case: { type: 'string' },
    out: { type: 'string' },
    'set-baseline': { type: 'boolean', default: false },
    with: { type: 'string' },
    cases: { type: 'string', default: 'evals/cases.json' },
  },
})
const AGENTS: Record<string, Agent[]> = { both: ['claude', 'codex'], claude: ['claude'], codex: ['codex'] }
const selected = AGENTS[values.agent]
if (!selected) throw new Error(`Unknown --agent ${values.agent}. Use claude, codex or both.`)
const agents: Agent[] = selected
const runs = runCount(values.runs)
const cases: Case[] = selectCases(JSON.parse(readFileSync(values.cases, 'utf8')), values.case)
const about = provenance(
  'model',
  { claude: 'claude', codex: codexCli },
  {
    'systemText claude': systemText(CLAUDE_CODE),
    'systemText codex': systemText(CODEX),
    'results systemText': RESULTS_SYSTEM,
    cases: readFileSync(values.cases, 'utf8'),
    models: JSON.stringify({ claude: CLAUDE_MODEL, codex: MODEL }),
    runner: readFileSync(process.argv[1]!, 'utf8'),
  },
)
const path = resultsPath(values.out, about)
const firstRuns = earlierRuns<Result>(values.with, about, path)

type Answer = {
  text: string | null
  model: string | null
  outputTokens: number | null
  /** Input tokens the call read, cached ones included, and how many of them came from the cache. Codex reports none. */
  inputTokens?: number | null
  cachedTokens?: number | null
}

/**
 * Sonnet as the mod calls it: at low effort, and with no settings, so the runner's own CLAUDE.md never reaches it.
 */
function claude(prompt: string, system: string): Promise<Answer> {
  const cwd = mkdtempSync(join(tmpdir(), 'inbox-eval-claude-'))

  return new Promise<Answer>(resolve => {
    const child = execFile(
      'claude',
      [
        '-p',
        '--model',
        CLAUDE_MODEL,
        '--effort',
        'low',
        '--setting-sources',
        '',
        '--tools',
        '',
        '--output-format',
        'json',
        '--system-prompt',
        system,
      ],
      { maxBuffer: 1 << 22, timeout: 300_000, cwd },
      (err, out) => {
        if (err) return resolve({ text: null, model: null, outputTokens: null })
        try {
          const parsed: unknown = JSON.parse(out)
          const events = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, any>[]
          const result = events.find(e => e.type === 'result')
          const model = events.find(e => e.type === 'system' && e.subtype === 'init')?.model ?? null
          const usage = result?.usage
          const outputTokens = usage?.output_tokens ?? null
          const cachedTokens = usage ? (usage.cache_read_input_tokens ?? 0) : null
          const inputTokens = usage
            ? (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (cachedTokens ?? 0)
            : null
          resolve({
            text: result && !result.is_error ? String(result.result) : null,
            model,
            outputTokens,
            inputTokens,
            cachedTokens,
          })
        } catch {
          resolve({ text: null, model: null, outputTokens: null })
        }
      },
    )
    child.stdin?.end(prompt)
  }).finally(() => rmSync(cwd, { recursive: true, force: true }))
}

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
  const finished = (after.card?.done ?? []).filter(line => !(before.card?.done ?? []).includes(line))
  const results = after.milestones.filter(m => m.source === 'done' && !before.milestones.some(b => b.id === m.id))
  const listed = () => results.map(m => `"${m.text}"`).join(', ')
  const newChecks = checks.filter((c): c is Extract<Check, { new: string }> => 'new' in c)
  const newMatches = matchEach(
    newChecks,
    added,
    (c, i) =>
      has(c.new, i.ask) &&
      (!c.kind || i.kind === c.kind) &&
      (c.rec === undefined || (c.rec === null ? i.rec === null : has(c.rec, i.rec))) &&
      (!c.help || i.helps.some(h => h.kind === c.help)),
  )
  const out: string[] = []
  for (const c of checks) {
    if ('open' in c && !isOpen(c.open)) out.push(`${c.open} closed`)
    else if ('closed' in c) {
      const outcome = closedOutcome(c.closed)
      if (outcome === null) out.push(`${c.closed} still open`)
      else if (c.outcome && !has(c.outcome, outcome)) out.push(`${c.closed} closed as "${outcome}"`)
    } else if ('added' in c && added.length !== c.added) out.push(`${added.length} items added`)
    else if ('done' in c && !finished.some(line => has(c.done, line)))
      out.push(`no done line like /${c.done}/: ${finished.map(line => `"${line}"`).join(', ')}`)
    else if ('results' in c && results.length !== c.results) out.push(`${results.length} results: ${listed()}`)
    else if ('resultsAtLeast' in c && results.length < c.resultsAtLeast)
      out.push(`${results.length} results, not ${c.resultsAtLeast} or more: ${listed()}`)
    else if ('result' in c && !results.some(m => has(c.result, m.text)))
      out.push(`no result like /${c.result}/: ${listed()}`)
    else if ('noResult' in c && results.some(m => has(c.noResult, m.text)))
      out.push(`a result like /${c.noResult}/: ${listed()}`)
    else if ('new' in c) {
      const match = newMatches.get(c)
      if (!match)
        out.push(
          `no new item like /${c.new}/: ${added.map(i => `"${i.ask}" kind=${i.kind} rec=${i.rec} helps=${i.helps.map(h => h.kind).join('+') || '-'}`).join(', ')}`,
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
  /** The ledger call's answer. Its DONE lines are dropped; the results come from `resultsAnswer`. */
  answer: string | null
  masked: string[]
  outputTokens: number | null
  inputTokens?: number | null
  cachedTokens?: number | null
  resultsAnswer?: string | null
  resultsModel?: string | null
  resultsOutputTokens?: number | null
  resultsInputTokens?: number | null
  resultsCachedTokens?: number | null
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
    turn: ledger.turn,
    press: null,
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
  const resultsInput = c.catchUp === undefined ? resultsPrompt(ledger, ex) : resultsCatchUpPrompt(ledger, c.catchUp)
  const ask = (input: string, system: string): Promise<Answer> =>
    agent === 'codex'
      ? askCodex(input, system).then(text => ({ text, model: null, outputTokens: null }))
      : claude(input, system)
  const [ledgerCall, resultsCall] = await Promise.all([
    ask(prompt, systemText(host)),
    ask(resultsInput, RESULTS_SYSTEM),
  ])
  const { text: answer, model, outputTokens } = ledgerCall
  const base = {
    ...job(agent, c, n),
    model,
    answer,
    outputTokens,
    inputTokens: ledgerCall.inputTokens ?? null,
    cachedTokens: ledgerCall.cachedTokens ?? null,
    resultsAnswer: resultsCall.text,
    resultsModel: resultsCall.model,
    resultsOutputTokens: resultsCall.outputTokens,
    resultsInputTokens: resultsCall.inputTokens ?? null,
    resultsCachedTokens: resultsCall.cachedTokens ?? null,
    attempts: 1,
    earlier: [],
    durationMs: 0,
  }
  if (answer === null) return { ...base, error: `${agent} gave no answer`, failed: [], masked: [] }
  if (resultsCall.text === null) return { ...base, error: `${agent} gave no results answer`, failed: [], masked: [] }
  const parsed = parseReply(answer, c.catchUp ?? `${ex.reply}\n${ex.activity.join('\n')}`)
  if (parsed === null) return { ...base, error: null, failed: ['no answer the mod can read'], masked: [] }
  const update = withResults(parsed, resultsCall.text)
  const after =
    c.catchUp === undefined
      ? applyExchangeUpdate(ledger, update, ex, NOW, NOW)
      : applyUpdate(ledger, update, NOW, ledger.turn, NOW, true)

  const masked = maskedAsks(update, ledger, after)

  return { ...base, error: null, failed: failures(ledger, after, c.checks, masked), masked }
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
  const slow = runs.filter(r => r.durationMs > MOD_TIMEOUT_MS).length
  const long = runs.filter(
    r => (r.outputTokens ?? 0) > MOD_MAX_TOKENS || (r.resultsOutputTokens ?? 0) > MOD_MAX_TOKENS,
  ).length
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
