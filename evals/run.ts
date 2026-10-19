import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { applyUpdate, EMPTY, parseReply, upgradeLedger } from '../hooks/ledger'
import { buildPrompt, CLAUDE_CODE, systemText, transcriptCatchUpPrompt } from '../hooks/model-text'
import type { Exchange } from '../hooks/ledger'
import type { Ledger } from '../types'
import { run } from '../codex/src/run'
import { codexAsk } from '../codex/src/update'
import { codexCli } from './codex-cli'

type Agent = 'claude' | 'codex'

/** Patterns are case-insensitive regular expressions. */
type Check =
  | { open: string }
  | { closed: string; outcome?: string }
  | { added: number }
  | { new: string; kind?: 'question' | 'task'; rec?: string | null; help?: string }
  | { notNew: string }
  | { noHelp: string }
  | { item: string; rec?: string; options?: string }
  | { waiting: string; options?: string }
  | { results: number }
  | { result: string }
  | { noResult: string }

type Case = {
  name: string
  about: string
  ledger: Partial<Ledger>
  exchange: Partial<Exchange> & { reply: string }
  /** A conversation to catch the ledger up on, in place of the exchange's per-reply update. */
  catchUp?: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
}

const MIN = 0.75
const NOW = 100

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    runs: { type: 'string', default: '8' },
    case: { type: 'string' },
    out: { type: 'string' },
    cases: { type: 'string', default: 'evals/cases.json' },
  },
})
const agents: Agent[] = values.agent === 'both' ? ['claude', 'codex'] : [values.agent as Agent]
const runs = Number(values.runs)
const wanted = values.case ? new Set(values.case.split(',')) : null
const cases: Case[] = JSON.parse(readFileSync(values.cases, 'utf8')).filter((c: Case) => !wanted || wanted.has(c.name))

function claude(prompt: string): Promise<string | null> {
  return new Promise(resolve => {
    const child = execFile(
      'claude',
      ['-p', '--model', 'sonnet', '--tools', '', '--system-prompt', systemText(CLAUDE_CODE)],
      { maxBuffer: 1 << 22, timeout: 300_000, cwd: mkdtempSync(join(tmpdir(), 'inbox-eval-claude-')) },
      (err, out) => resolve(err ? null : out),
    )
    child.stdin?.end(prompt)
  })
}

const askCodex = codexAsk(run, codexCli, mkdtempSync(join(tmpdir(), 'inbox-eval-')))

function failures(before: Ledger, after: Ledger, checks: Check[]): string[] {
  const has = (pattern: string, text: string | null) => text !== null && new RegExp(pattern, 'i').test(text)
  const added = after.items.filter(i => !before.items.some(b => b.id === i.id))
  const isOpen = (id: string) => after.items.some(i => i.id === id) || after.findings.some(f => f.id === id)
  const closedOutcome = (id: string) =>
    after.closed.find(c => c.id === id)?.outcome ?? after.closedFindings.find(f => f.id === id)?.outcome ?? null
  const results = after.milestones.filter(m => m.source === 'done' && !before.milestones.some(b => b.id === m.id))
  const out: string[] = []
  for (const c of checks) {
    if ('open' in c && !isOpen(c.open)) out.push(`${c.open} closed`)
    else if ('closed' in c) {
      const outcome = closedOutcome(c.closed)
      if (outcome === null) out.push(`${c.closed} still open`)
      else if (c.outcome && !has(c.outcome, outcome)) out.push(`${c.closed} closed as "${outcome}"`)
    } else if ('added' in c && added.length !== c.added) out.push(`${added.length} items added`)
    else if ('results' in c && results.length !== c.results)
      out.push(`${results.length} results: ${results.map(m => `"${m.text}"`).join(', ')}`)
    else if ('result' in c && !results.some(m => has(c.result, m.text)))
      out.push(`no result like /${c.result}/: ${results.map(m => `"${m.text}"`).join(', ')}`)
    else if ('noResult' in c && results.some(m => has(c.noResult, m.text)))
      out.push(`a result like /${c.noResult}/: ${results.map(m => `"${m.text}"`).join(', ')}`)
    else if ('new' in c) {
      const match = added.find(
        i =>
          has(c.new, i.ask) &&
          (!c.kind || i.kind === c.kind) &&
          (c.rec === undefined || (c.rec === null ? i.rec === null : has(c.rec, i.rec))) &&
          (!c.help || i.helps.some(h => h.kind === c.help)),
      )
      if (!match) out.push(`no new item like /${c.new}/: ${added.map(i => `"${i.ask}" rec=${i.rec}`).join(', ')}`)
    } else if ('notNew' in c && added.some(i => has(c.notNew, i.ask))) out.push(`added an item like /${c.notNew}/`)
    else if ('noHelp' in c && added.some(i => i.helps.some(h => h.kind === c.noHelp))) out.push(`a ${c.noHelp} step`)
    else if ('waiting' in c) {
      const match = after.items.find(
        i => has(c.waiting, i.ask) && (!c.options || has(c.options, i.options.join(' / '))),
      )
      if (!match) out.push(`no open item like /${c.waiting}/: ${after.items.map(i => `"${i.ask}"`).join(', ')}`)
    } else if ('item' in c) {
      const item = after.items.find(i => i.id === c.item)
      if (!item) out.push(`${c.item} closed`)
      else if (c.rec && !has(c.rec, item.rec)) out.push(`${c.item} rec=${item.rec}`)
      else if (c.options && !has(c.options, item.options.join(' / ')))
        out.push(`${c.item} options ${item.options.join(' / ')}`)
    }
  }

  return out
}

type Result = { agent: Agent; name: string; run: number; answer: string | null; failed: string[] }

async function once(agent: Agent, c: Case, n: number): Promise<Result> {
  const ledger = upgradeLedger({ ...EMPTY, ...c.ledger } as Ledger)
  const ex: Exchange = {
    person: null,
    trigger: null,
    activity: [],
    turn: ledger.turn,
    press: null,
    screen: agent === 'codex' ? 'The Inbox tab is closed.' : 'The /inbox pane is closed.',
    ...c.exchange,
  }
  const prompt =
    c.catchUp === undefined ? buildPrompt(ledger, ex) : transcriptCatchUpPrompt(ledger, ex.screen, c.catchUp)
  const answer = agent === 'codex' ? await askCodex(prompt) : await claude(prompt)
  const update = answer === null ? null : parseReply(answer, `${ex.reply}\n${ex.activity.join('\n')}`)
  const failed =
    update === null
      ? ['no answer the mod can read']
      : failures(ledger, applyUpdate(ledger, update, NOW, ledger.turn, NOW, c.catchUp !== undefined), c.checks)

  return { agent, name: c.name, run: n, answer, failed }
}

const jobs = agents.flatMap(a => cases.flatMap(c => Array.from({ length: runs }, (_, n) => () => once(a, c, n))))
const results: Result[] = []
let next = 0
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) results.push(await jobs[next++]!())
  }),
)
if (values.out) writeFileSync(values.out, JSON.stringify(results, null, 1))

let isFailing = false
for (const agent of agents)
  for (const c of cases) {
    const mine = results.filter(r => r.agent === agent && r.name === c.name)
    const passed = mine.filter(r => r.failed.length === 0).length
    const isPass = passed / mine.length >= (c.min?.[agent] ?? MIN)
    isFailing ||= !isPass
    console.log(`${isPass ? '  ok' : '  x '} ${agent} ${c.name}: ${passed} of ${mine.length}`)
    if (!isPass) for (const r of mine) if (r.failed.length > 0) console.log(`       ${r.failed.join('; ')}`)
  }
process.exit(isFailing ? 1 : 0)
