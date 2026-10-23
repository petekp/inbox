import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { applyExchangeUpdate, applyUpdate, EMPTY, parseReply, upgradeLedger } from '../hooks/ledger'
import {
  buildPrompt,
  CLAUDE_CODE,
  OVERVIEW_SYSTEM,
  overviewCatchUpPrompt,
  overviewPrompt,
  screenText,
  systemText,
  transcriptCatchUpPrompt,
} from '../hooks/model-text'
import { applyOverview, parseOverview } from '../hooks/overview'
import type { OverviewAnswer } from '../hooks/overview'
import { CODEX } from '../codex/src/texts'
import type { Exchange, Update } from '../hooks/ledger'
import type { Ledger, Overview, OverviewItem } from '../types'
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
type OverviewList = 'queue' | 'works' | 'open' | 'next' | 'since' | 'workstreams'

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
  /** The Overview call's answer: whether it changed the guide. */
  | { overview: 'unchanged' | 'written' }
  | { overviewKind: 'coordinator' | 'session' }
  /** Whether the guide reports a change of direction. */
  | { course: boolean }
  /** The earlier lines the guide has after the exchange, at least this many. */
  | { earlierAtLeast: number }
  /** No text names a command, a file, a commit, a ticket, a test run or a tool step. */
  | { featureLevel: true }
  /** No text restates what an open item or finding of the ledger asks. */
  | { asksNotRestated: true }
  | { sinceAtMost: number }
  /**
   * No two items of different lists, other than SINCE, say the same thing. Two pairs are not compared since the page
   * never draws them together: QUEUE with WORKS, and QUEUE with NEXT while the queue has a queued item.
   */
  | { partsNotRepeated: true }
  /** No item with this status matches the pattern in any list: finished work does not stay as under way. */
  | { noOverviewItem: string; status: OverviewItem['status'] }
  /** No text holds all of these words, as a paraphrase of a question that offers these choices would. */
  | { noTextWithAll: string[] }
  /** The answer stays on the same topic and writes no COURSE line. */
  | { sameTopicNoCourseLine: true }
  /** The answer does not rewrite a course the guide already had: it leaves it out or writes the same one. */
  | { courseKept: true }
  /** The answer starts a new topic with a FOLDED line that differs from the old headline. */
  | { foldsWithLine: true }
  /** No two SINCE items say the same thing. */
  | { sinceNoRepeat: true }
  | { workstreamsAtLeast: number }
  | { overviewItem: string; list: OverviewList; status?: OverviewItem['status'] }

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
    'overview systemText': OVERVIEW_SYSTEM,
    'overview prompts': [
      overviewPrompt(null, { turn: 1, person: 'p', activity: ['a'], reply: 'r' } as Exchange),
      overviewCatchUpPrompt(null, 'c'),
    ].join('\n'),
    'overview parser': [parseOverview, applyOverview].map(String).join('\n'),
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

const OVERVIEW_KEYS = [
  'overview',
  'overviewKind',
  'course',
  'earlierAtLeast',
  'featureLevel',
  'asksNotRestated',
  'sinceAtMost',
  'partsNotRepeated',
  'noOverviewItem',
  'noTextWithAll',
  'sameTopicNoCourseLine',
  'courseKept',
  'foldsWithLine',
  'sinceNoRepeat',
  'workstreamsAtLeast',
  'overviewItem',
] as const

type OverviewCheck = Extract<Check, Partial<Record<(typeof OVERVIEW_KEYS)[number], unknown>>>

function isOverviewCheck(c: Check): c is OverviewCheck {
  return OVERVIEW_KEYS.some(k => k in c)
}

/** What the Overview call did in one run: its parsed answer and the guide after it. */
type OverviewRun = { answer: OverviewAnswer | null; before: Overview | null; after: Overview | null }

const LISTS: OverviewList[] = ['queue', 'works', 'open', 'next', 'since', 'workstreams']

const textsOf = (o: Overview): string[] => [
  o.headline,
  o.status,
  o.course,
  ...LISTS.flatMap(l => o[l].flatMap(i => [i.text, i.detail ?? ''])),
  ...o.earlier,
]

/** Every text with an item's detail joined to its text, as a sentence the person reads. */
const joinedTextsOf = (o: Overview): string[] => [
  o.headline,
  o.status,
  o.course,
  ...LISTS.flatMap(l => o[l].map(i => `${i.text} ${i.detail ?? ''}`.trim())),
  ...o.earlier,
]

/** What an event list is made of: a command, a path, a commit, a ticket, a test run or a tool step. */
const EVENT_PATTERNS: RegExp[] = [
  /`/,
  /\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|mjs|swift|py|rs|go|sh|css|html)\b/i,
  /\b[0-9a-f]{7,40}\b/,
  /(?:^|\s)#\d+\b|\b[A-Z]{2,}-\d+\b/,
  /\b\d+\s+(?:[\p{L}-]+\s+){0,2}(?:tests?|files?|commits?|lines?|calls?|ms|seconds?|minutes?|checks?)\b/iu,
  /\bcommit(?:s|ted|ting)?\b/i,
  /^(?:ran|run|edited|editing|opened|searched|grepped|installed|executed|called)\b/i,
  /\b(?:tests? (?:ran|run)|tool call|npm |git )\b/i,
  /\b(?:pushed|merged|tested)\b/i,
]

const WORD = /[\p{L}\p{N}]+/gu
const keyWordsOf = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 3))

/** Whether `text` has most of the key words of `other`, as a restatement does. */
function restatesText(text: string, other: string): boolean {
  const mine = keyWordsOf(text)
  const theirs = [...keyWordsOf(other)]

  return theirs.length >= 3 && theirs.filter(w => mine.has(w)).length / theirs.length >= 0.7
}

/**
 * Whether two items say the same thing: the same words once a stream's "name: what it does" is cut to its name, so a
 * one- or two-word item is compared too, or a restatement of most of the key words. A step that names a stream, such
 * as a review of it, has other words and is not a repeat.
 */
function repeatsFact(a: string, b: string): boolean {
  const key = (t: string) => [...keyWordsOf(t.split(':')[0]!)].sort().join(' ')

  return (key(a) !== '' && key(a) === key(b)) || restatesText(a, b) || restatesText(b, a)
}

function overviewFailures(c: OverviewCheck, after: Ledger, run: OverviewRun | null): string[] {
  if (run === null || run.answer === null) return ['no Overview answer the mod can read']
  const o = run.after
  if ('overview' in c) {
    const kind = run.answer.kind
    return kind === c.overview ? [] : [`the Overview call answered ${kind}, not ${c.overview}`]
  }
  if (o === null) return ['no Overview written']
  if ('overviewKind' in c)
    return (o.isCoordinator ? 'coordinator' : 'session') === c.overviewKind ? [] : [`kind is not ${c.overviewKind}`]
  if ('course' in c)
    return (o.course !== '') === c.course ? [] : [c.course ? 'no course reported' : `course reported: "${o.course}"`]
  if ('earlierAtLeast' in c) return o.earlier.length >= c.earlierAtLeast ? [] : [`${o.earlier.length} earlier lines`]
  if ('featureLevel' in c) {
    const bad = textsOf(o).filter(t => EVENT_PATTERNS.some(re => re.test(t)))
    return bad.map(t => `event text: "${t}"`)
  }
  if ('asksNotRestated' in c) {
    const asks = [...after.items.map(i => i.ask), ...after.findings.map(f => f.title)]
    return textsOf(o).flatMap(t => asks.filter(a => restatesText(t, a)).map(a => `"${t}" restates "${a}"`))
  }
  if ('noOverviewItem' in c) {
    const re = new RegExp(c.noOverviewItem, 'i')
    return LISTS.flatMap(l =>
      o[l].filter(i => i.status === c.status && re.test(i.text)).map(i => `${l} still has ${c.status}: "${i.text}"`),
    )
  }
  if ('courseKept' in c) {
    const a = run.answer
    const was = run.before?.course ?? ''
    return a.kind === 'unchanged' || a.overview.course === '' || a.overview.course === was
      ? []
      : [`the answer rewrote the course: "${a.overview.course}"`]
  }
  if ('noTextWithAll' in c) {
    const words = c.noTextWithAll
    return joinedTextsOf(o)
      .filter(t => words.every(w => t.toLowerCase().includes(w.toLowerCase())))
      .map(t => `"${t}" names all of ${words.join(', ')}`)
  }
  if ('sameTopicNoCourseLine' in c) {
    const a = run.answer
    return a.kind === 'written' && !a.isNewTopic && a.overview.course === ''
      ? []
      : ['the answer started a new topic or wrote a COURSE line']
  }
  if ('foldsWithLine' in c) {
    const a = run.answer
    if (a.kind !== 'written' || !a.isNewTopic) return ['the answer did not start a new topic']
    return a.folded !== '' && a.folded !== run.before?.headline ? [] : ['no FOLDED line beyond the old headline']
  }
  if ('sinceAtMost' in c) return o.since.length <= c.sinceAtMost ? [] : [`${o.since.length} since items`]
  if ('partsNotRepeated' in c) {
    const hasQueued = o.queue.some(i => i.status === 'queued')
    const lists = [o.queue, o.works, o.open, ...(hasQueued ? [] : [o.next]), o.workstreams]
    return lists.flatMap((a, n) =>
      a.flatMap(x =>
        lists
          .slice(n + 1)
          .filter(b => !(a === o.queue && b === o.works))
          .flat()
          .filter(y => repeatsFact(x.text, y.text))
          .map(y => `repeated across lists: "${x.text}" and "${y.text}"`),
      ),
    )
  }
  if ('sinceNoRepeat' in c)
    return o.since.flatMap((a, n) =>
      o.since
        .slice(n + 1)
        .filter(b => restatesText(a.text, b.text) || restatesText(b.text, a.text))
        .map(b => `repeated: "${a.text}" and "${b.text}"`),
    )
  if ('workstreamsAtLeast' in c)
    return o.workstreams.length >= c.workstreamsAtLeast ? [] : [`${o.workstreams.length} workstreams`]
  const found = o[c.list].some(
    i => new RegExp(c.overviewItem, 'i').test(i.text) && (!c.status || i.status === c.status),
  )

  return found ? [] : [`no ${c.list} item like /${c.overviewItem}/`]
}

function failures(
  before: Ledger,
  after: Ledger,
  checks: Check[],
  masked: string[],
  overview: OverviewRun | null,
): string[] {
  const has = (pattern: string, text: string | null) => text !== null && new RegExp(pattern, 'i').test(text)
  const added = after.items.filter(i => !before.items.some(b => b.id === i.id))
  const isOpen = (id: string) => after.items.some(i => i.id === id) || after.findings.some(f => f.id === id)
  const closedOutcome = (id: string) =>
    after.closed.find(c => c.id === id)?.outcome ?? after.closedFindings.find(f => f.id === id)?.outcome ?? null
  const finished = (after.card?.done ?? []).filter(line => !(before.card?.done ?? []).includes(line))
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
    else if (isOverviewCheck(c)) out.push(...overviewFailures(c, after, overview))
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
  /** The ledger call's answer. The Overview comes from `overviewAnswer`. */
  answer: string | null
  masked: string[]
  outputTokens: number | null
  inputTokens?: number | null
  cachedTokens?: number | null
  overviewAnswer?: string | null
  overviewModel?: string | null
  overviewOutputTokens?: number | null
  overviewInputTokens?: number | null
  overviewCachedTokens?: number | null
  /** How long each call took. The mod's limit applies to each call. */
  ledgerMs?: number
  overviewMs?: number
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
  const ask = (input: string, system: string): Promise<Answer> =>
    agent === 'codex'
      ? askCodex(input, system).then(text => ({ text, model: null, outputTokens: null }))
      : claude(input, system)
  const ledgerStarted = Date.now()
  const ledgerCall = await ask(prompt, systemText(host))
  const ledgerMs = Date.now() - ledgerStarted
  const { text: answer, model, outputTokens } = ledgerCall
  const base = {
    ...job(agent, c, n),
    model,
    answer,
    outputTokens,
    inputTokens: ledgerCall.inputTokens ?? null,
    cachedTokens: ledgerCall.cachedTokens ?? null,
    ledgerMs,
    attempts: 1,
    earlier: [],
    durationMs: 0,
  }
  if (answer === null) return { ...base, error: `${agent} gave no answer`, failed: [], masked: [] }
  const parsed = parseReply(answer, c.catchUp ?? `${ex.reply}\n${ex.activity.join('\n')}`)
  if (parsed === null) return { ...base, error: null, failed: ['no answer the mod can read'], masked: [] }
  const applied =
    c.catchUp === undefined
      ? applyExchangeUpdate(ledger, parsed, ex, NOW, NOW)
      : applyUpdate(ledger, parsed, NOW, ledger.turn, NOW)
  const masked = maskedAsks(parsed, ledger, applied)
  const needsOverview = c.checks.some(isOverviewCheck)
  if (!needsOverview) return { ...base, error: null, failed: failures(ledger, applied, c.checks, masked, null), masked }
  const overviewInput =
    c.catchUp === undefined ? overviewPrompt(applied.overview, ex) : overviewCatchUpPrompt(applied.overview, c.catchUp)
  const overviewStarted = Date.now()
  const overviewCall = await ask(overviewInput, OVERVIEW_SYSTEM)
  const withAnswer = {
    ...base,
    overviewMs: Date.now() - overviewStarted,
    overviewAnswer: overviewCall.text,
    overviewModel: overviewCall.model,
    overviewOutputTokens: overviewCall.outputTokens,
    overviewInputTokens: overviewCall.inputTokens ?? null,
    overviewCachedTokens: overviewCall.cachedTokens ?? null,
  }
  if (overviewCall.text === null)
    return { ...withAnswer, error: `${agent} gave no Overview answer`, failed: [], masked: [] }
  const overviewParsed = parseOverview(overviewCall.text)
  const overview: OverviewRun = {
    answer: overviewParsed,
    before: applied.overview,
    after: overviewParsed ? applyOverview(applied.overview, overviewParsed) : applied.overview,
  }
  const after = { ...applied, overview: overview.after }

  return { ...withAnswer, error: null, failed: failures(ledger, after, c.checks, masked, overview), masked }
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
  const slow = runs.filter(
    r => (r.ledgerMs ?? r.durationMs) > MOD_TIMEOUT_MS || (r.overviewMs ?? 0) > MOD_TIMEOUT_MS,
  ).length
  const long = runs.filter(
    r => (r.outputTokens ?? 0) > MOD_MAX_TOKENS || (r.overviewOutputTokens ?? 0) > MOD_MAX_TOKENS,
  ).length
  const notes = [
    masked > 0 ? `${masked} NEW lines dropped by the code` : '',
    slow > 0 ? `${slow} with a call slower than the mod's ${MOD_TIMEOUT_MS / 1000} s limit` : '',
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
