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
import type { OverviewInput } from '../hooks/model-text'
import { applyOps, applyOverview, askOverview, isOpen, parseOverview } from '../hooks/overview'
import type { OverviewAnswer } from '../hooks/overview'
import { CODEX } from '../codex/src/texts'
import type { Exchange, Update } from '../hooks/ledger'
import type { HostTask, Item, Ledger, Overview, SubjectStatus } from '../types'
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
  | { new: string; kind?: 'question' | 'task'; rec?: string | null; help?: string; design?: boolean }
  | { notNew: string }
  | { noHelp: string }
  | { item: string; rec?: string; options?: string }
  | { waiting: string; options?: string; rec?: string }
  | { openItems: number }
  /** NEW lines the code dropped as repeats, which the other checks cannot see. */
  | { dropped: number }
  /** The Overview call's answer: whether it changed the list. */
  | { overview: 'unchanged' | 'changed' }
  | { role: 'coordinator' | 'session' }
  /** The goal after the exchange matches the pattern. */
  | { goal: string }
  /** A shown subject whose name or text matches the pattern has this status, open or closed. */
  | { subject: string; status?: SubjectStatus }
  /** No shown subject matches the pattern, or none with `status` when one is given, as finished work stays under way. */
  | { noSubject: string; status?: SubjectStatus }
  /** The answer adds no subject, as an update to a subject the list already holds should not. */
  | { noNewSubject: true }
  /** At most this many subjects are open after the exchange. */
  | { openAtMost: number }
  /** No two open subjects name the same work. */
  | { subjectsNotRepeated: true }
  /** A subject keeps the plan a reversal replaced, matching the pattern. */
  | { was: string }
  /** The running child whose name matches `child` is linked to a subject whose name matches `to`. */
  | { linked: string; to: string }
  /** An open item whose ask matches `askLinked` is linked to an open subject whose name or text matches `to`. */
  | { askLinked: string; to: string }
  /** Every name a NEW line of the answer writes has at most this many words, before code clips it. */
  | { newNamesAtMost: number }
  /** No text names a command, a file, a commit, a ticket, a test run or a tool step. */
  | { featureLevel: true }
  /** No text names a time, which code writes. */
  | { noTimeWords: true }
  /** No text restates what an open item or finding of the ledger asks. */
  | { asksNotRestated: true }
  /** No text holds all of these words, as a paraphrase of a question that offers these choices would. */
  | { noTextWithAll: string[] }

type Case = {
  name: string
  about: string
  ledger: Partial<Ledger>
  exchange: Partial<Omit<Exchange, 'screen'>> & { reply: string }
  /** What the inbox shows, built with `screenText` for each agent's host. Closed when left out. */
  screen?: { isOpen: boolean; tab?: string; isPage?: boolean }
  /** A conversation to catch the ledger up on, in place of the exchange's per-reply update. */
  catchUp?: string
  /** The agent's own task list the Overview call reads beside the exchange. */
  hostTasks?: HostTask[]
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
/** An input whose prompt holds every block the asks change, so the provenance hash covers how they are written. */
const SAMPLE_INPUT: OverviewInput = { last: null, asks: [{ id: 'i1', ask: 'a' } as Item], tasks: [], now: NOW }
const cases: Case[] = selectCases(JSON.parse(readFileSync(values.cases, 'utf8')), values.case)
const about = provenance(
  'model',
  { claude: 'claude', codex: codexCli },
  {
    'systemText claude': systemText(CLAUDE_CODE),
    'systemText codex': systemText(CODEX),
    'overview systemText': OVERVIEW_SYSTEM,
    'overview prompts': [
      overviewPrompt(SAMPLE_INPUT, { turn: 1, person: 'p', activity: ['a'], reply: 'r' } as Exchange),
      overviewCatchUpPrompt(SAMPLE_INPUT, 'c'),
    ].join('\n'),
    'overview parser': [parseOverview, askOverview, applyOverview, applyOps].map(String).join('\n'),
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
 * Sonnet as the mod calls it: at low effort, and with no settings or MCP servers, so neither the runner's own CLAUDE.md
 * nor its account's connectors reach it.
 */
function claude(prompt: string, system: string): Promise<Answer> {
  const cwd = mkdtempSync(join(tmpdir(), 'inbox-eval-claude-'))

  return new Promise<Answer>(resolve => {
    const child = execFile(
      'claude',
      [
        '-p',
        '--no-session-persistence',
        '--model',
        CLAUDE_MODEL,
        '--effort',
        'low',
        '--strict-mcp-config',
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
  'role',
  'goal',
  'subject',
  'noSubject',
  'noNewSubject',
  'openAtMost',
  'subjectsNotRepeated',
  'was',
  'linked',
  'askLinked',
  'newNamesAtMost',
  'featureLevel',
  'noTimeWords',
  'asksNotRestated',
  'noTextWithAll',
] as const

type OverviewCheck = Extract<Check, Partial<Record<(typeof OVERVIEW_KEYS)[number], unknown>>>

function isOverviewCheck(c: Check): c is OverviewCheck {
  return OVERVIEW_KEYS.some(k => k in c)
}

/** What the Overview call did in one run: its parsed answer and the list before and after it. */
type OverviewRun = { answer: OverviewAnswer | null; before: Overview | null; after: Overview | null }

const shownOf = (o: Overview) => o.subjects.filter(s => s.into === null)

const textsOf = (o: Overview): string[] => [o.goal, ...shownOf(o).flatMap(s => [s.name, s.text, s.was ?? ''])]

/** What an event list is made of: a command, a path, a commit, a ticket, a test run or a tool step. */
const EVENT_PATTERNS: RegExp[] = [
  /`/,
  /\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|mjs|swift|py|rs|go|sh|css|html)\b/i,
  /\b[0-9a-f]{7,40}\b/,
  /(?:^|\s)#\d+\b|\b[A-Z]{2,}-\d+\b/,
  /\b\d+\s+(?:[\p{L}-]+\s+){0,2}(?:tests?|files?|commits?|lines?|calls?|ms|seconds?|minutes?|checks?)\b/iu,
  /\bcommit(?:s|ted|ting)?\b/i,
  /^(?:ran|run|edited|editing|opened|searched|grepped|installed|executed|called)\b/i,
  /\b(?:tests? (?:ran|run|pass(?:ing|es)?)|tool call|npm |git )\b/i,
  /\b(?:pushed|merged|tested|rebuilt|restarted)\b/i,
]

const TIME_WORDS =
  /\b(today|yesterday|tonight|tomorrow|this (morning|afternoon|evening|week)|last night|ago|just now|earlier today|\d+\s*(m|h|d|min|mins|minutes?|hours?|days?))\b/i

const WORD = /[\p{L}\p{N}]+/gu
const keyWordsOf = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 3))

/** Whether `text` has most of the key words of `other`, as a restatement does. */
function restatesText(text: string, other: string): boolean {
  const mine = keyWordsOf(text)
  const theirs = [...keyWordsOf(other)]

  return theirs.length >= 3 && theirs.filter(w => mine.has(w)).length / theirs.length >= 0.7
}

/**
 * Whether two subjects name the same work: every key word of one name is in the other. Texts are left out, since
 * parallel parts, such as three delegated parts awaiting review, often stand in the same place.
 */
function repeatsSubject(a: { name: string }, b: { name: string }): boolean {
  const [shorter, longer] = [keyWordsOf(a.name), keyWordsOf(b.name)].sort((x, y) => x.size - y.size)

  return shorter!.size > 0 && [...shorter!].every(w => longer!.has(w))
}

function overviewFailures(c: OverviewCheck, after: Ledger, run: OverviewRun | null): string[] {
  if (run === null || run.answer === null) return ['no Overview answer the mod can read']
  if ('overview' in c) {
    const kind = run.answer.kind === 'ops' ? 'changed' : 'unchanged'
    return kind === c.overview ? [] : [`the Overview call answered ${kind}, not ${c.overview}`]
  }
  const o = run.after
  if (o === null) return ['no Overview written']
  const matches = (pattern: string, s: { name: string; text: string }) =>
    new RegExp(pattern, 'i').test(`${s.name}: ${s.text}`)
  if ('role' in c) return o.role === c.role ? [] : [`role is ${o.role}, not ${c.role}`]
  if ('goal' in c) return new RegExp(c.goal, 'i').test(o.goal) ? [] : [`goal "${o.goal}" is not like /${c.goal}/`]
  if ('noSubject' in c)
    return shownOf(o)
      .filter(s => (c.status === undefined || s.status === c.status) && matches(c.noSubject, s))
      .map(s => `${c.status ? `still ${c.status}` : 'a subject'}: "${s.name}: ${s.text}"`)
  if ('subject' in c) {
    const found = shownOf(o).filter(s => matches(c.subject, s))
    if (found.length === 0) return [`no subject like /${c.subject}/`]
    return !c.status || found.some(s => s.status === c.status)
      ? []
      : [`/${c.subject}/ is ${found.map(s => s.status).join(', ')}, not ${c.status}`]
  }
  if ('noNewSubject' in c) {
    const added = o.subjects.filter(s => !(run.before?.subjects ?? []).some(b => b.id === s.id))
    return added.map(s => `added "${s.name}: ${s.text}"`)
  }
  if ('openAtMost' in c) {
    const open = o.subjects.filter(isOpen).length
    return open <= c.openAtMost ? [] : [`${open} open subjects`]
  }
  if ('subjectsNotRepeated' in c) {
    const open = o.subjects.filter(isOpen)
    return open.flatMap((a, n) =>
      open
        .slice(n + 1)
        .filter(b => repeatsSubject(a, b))
        .map(b => `repeated: "${a.name}: ${a.text}" and "${b.name}: ${b.text}"`),
    )
  }
  if ('was' in c)
    return shownOf(o).some(s => s.was !== null && new RegExp(c.was, 'i').test(s.was))
      ? []
      : [`no subject keeps a plan like /${c.was}/`]
  if ('linked' in c) {
    const child = o.children.find(x => new RegExp(c.linked, 'i').test(x.name))
    if (!child) return [`no child like /${c.linked}/`]
    const subject = o.subjects.find(s => s.id === child.subjectId)
    if (!subject) return [`"${child.name}" is not linked`]
    return matches(c.to, subject) ? [] : [`"${child.name}" is linked to "${subject.name}", not /${c.to}/`]
  }
  if ('askLinked' in c) {
    const asks = after.items.filter(i => new RegExp(c.askLinked, 'i').test(i.ask))
    if (asks.length === 0) return [`no open ask like /${c.askLinked}/`]
    const linked = asks.flatMap(i => o.subjects.filter(s => s.id === o.askSubjects[i.id] && isOpen(s)))
    if (linked.length === 0) return [`no ask like /${c.askLinked}/ is linked to an open subject`]
    return linked.some(s => matches(c.to, s))
      ? []
      : [`/${c.askLinked}/ is linked to ${linked.map(s => `"${s.name}"`).join(', ')}, not /${c.to}/`]
  }
  if ('newNamesAtMost' in c) {
    const ops = run.answer.kind === 'ops' ? run.answer.ops : []
    return ops.flatMap(op =>
      op.kind === 'new' && op.name.split(/\s+/).filter(Boolean).length > c.newNamesAtMost
        ? [`long name: "${op.name}"`]
        : [],
    )
  }
  if ('featureLevel' in c)
    return textsOf(o)
      .filter(t => EVENT_PATTERNS.some(re => re.test(t)))
      .map(t => `event text: "${t}"`)
  if ('noTimeWords' in c)
    return textsOf(o)
      .filter(t => TIME_WORDS.test(t))
      .map(t => `time word: "${t}"`)
  if ('asksNotRestated' in c) {
    const asks = [...after.items.map(i => i.ask), ...after.findings.map(f => f.title)]
    return textsOf(o).flatMap(t => asks.filter(a => restatesText(t, a)).map(a => `"${t}" restates "${a}"`))
  }
  const words = c.noTextWithAll
  return shownOf(o)
    .map(s => `${s.name} ${s.text} ${s.was ?? ''}`)
    .filter(t => words.every(w => t.toLowerCase().includes(w.toLowerCase())))
    .map(t => `"${t}" names all of ${words.join(', ')}`)
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
    else if (isOverviewCheck(c)) out.push(...overviewFailures(c, after, overview))
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
    tasks: c.hostTasks ?? [],
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
  const input = { last: applied.overview, asks: applied.items, tasks: c.hostTasks ?? [], now: NOW }
  const overviewInput = c.catchUp === undefined ? overviewPrompt(input, ex) : overviewCatchUpPrompt(input, c.catchUp)
  const overviewStarted = Date.now()
  const { first: firstCall, last: overviewCall } = await askOverview(() => ask(overviewInput, OVERVIEW_SYSTEM))
  const isRetried = overviewCall !== firstCall
  const withAnswer = {
    ...base,
    overviewMs: Date.now() - overviewStarted,
    overviewAnswer: overviewCall.text,
    overviewFirstAnswer: isRetried ? firstCall.text : null,
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
    after: overviewParsed
      ? applyOverview(applied.overview, overviewParsed, NOW, new Set(applied.items.map(i => i.id)))
      : applied.overview,
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
