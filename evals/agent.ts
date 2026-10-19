import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { EMPTY, upgradeLedger } from '../hooks/ledger'
import { CLAUDE_CODE, closedText, guidanceText, inboxText } from '../hooks/model-text'
import type { Host } from '../hooks/model-text'
import type { Ledger } from '../types'
import { CODEX } from '../codex/src/texts'
import { MODEL } from '../codex/src/update'
import { codexCli } from './codex-cli'

type Agent = 'claude' | 'codex'

/** Patterns are case-insensitive regular expressions. */
type Check =
  | {
      calls: 'record' | 'close' | 'progress'
      /** Matches the call's `kind`, as a whole. */
      kind?: string
      /** Matches each named argument. */
      match?: Record<string, string>
      /** Arguments that must be non-empty. */
      has?: string[]
      /** Exactly this many matching calls. Without `count` and `max`, at least `min` (default 1). */
      count?: number
      min?: number
      max?: number
    }
  | { reply: string }
  | { notReply: string }

type Case = {
  name: string
  about: string
  /** The inbox the agent is shown. */
  ledger?: Partial<Ledger>
  /** The inbox the tools answer from, when it differs from what the agent was shown. */
  toolLedger?: Partial<Ledger>
  prompt: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
}

type Call = { tool: string; args: Record<string, unknown>; result: string }

const MIN = 0.75
const PROBE = 'probe'

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    'claude-model': { type: 'string', default: 'opus' },
    runs: { type: 'string', default: '5' },
    case: { type: 'string' },
    out: { type: 'string' },
    cases: { type: 'string', default: 'evals/agent-cases.json' },
    probe: { type: 'string' },
  },
})
const agents: Agent[] = values.agent === 'both' ? ['claude', 'codex'] : [values.agent as Agent]
const runs = Number(values.runs)
const wanted = values.case ? new Set(values.case.split(',')) : null
const cases: Case[] = JSON.parse(readFileSync(values.cases, 'utf8')).filter((c: Case) => !wanted || wanted.has(c.name))
const probeServer = values.probe ?? fileURLToPath(new URL('./probe.mjs', import.meta.url))

const CODEX_EFFORT = 'medium'
const CLAUDE_MODEL = values['claude-model']
const TIMEOUT_MS = 300_000

/**
 * The guidance the agent reads, from the shipped text. It names the tools of the real inbox server; the stand-in
 * server is named probe instead, because an agent session that can reach a server named inbox lets the real
 * installed mod answer the calls and save them to the person's real inbox.
 */
function guidance(host: Host): string {
  const text = guidanceText(host).replaceAll('mcp__inbox__', `mcp__${PROBE}__`)
  if (text.includes('inbox__')) throw new Error('guidanceText names a tool this eval does not map to the probe server')

  return text
}

function message(c: Case, host: Host): string {
  if (!c.ledger) return c.prompt
  const ledger = upgradeLedger({ ...EMPTY, ...c.ledger } as Ledger)
  const notes = [inboxText(host, ledger, false), closedText(ledger.closed)].filter(Boolean)

  return `${notes.join('\n')}\n\n${c.prompt}`
}

function exec(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv; input?: string }) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
    const [file = '', ...rest] = args
    const child = execFile(
      file,
      rest,
      { cwd: opts.cwd, env: opts.env, timeout: TIMEOUT_MS, maxBuffer: 1 << 26, encoding: 'utf8' },
      (err, stdout, stderr) =>
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout, stderr }),
    )
    child.stdin?.end(opts.input ?? '')
  })
}

function lines(stdout: string): Record<string, any>[] {
  return stdout.split('\n').flatMap(l => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
}

type Outcome = { reply: string; calls: Call[]; error: string | null }

/** A fresh folder for one run: the stand-in server's state and log, and an empty working folder. */
function sandbox(c: Case, agent: Agent) {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-agent-eval-'))
  const work = join(dir, 'work')
  mkdirSync(work)
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.jsonl')
  writeFileSync(state, JSON.stringify({ agent, ledger: c.toolLedger ?? c.ledger ?? {} }))
  writeFileSync(log, '')
  const serverArgs = [probeServer, '--state', state, '--log', log]
  const calls = (): Call[] =>
    lines(readFileSync(log, 'utf8')).map(l => ({ tool: l.tool, args: l.args, result: l.result }))

  return { dir, work, serverArgs, calls }
}

const PROBE_TOOLS = [`mcp__${PROBE}__record`, `mcp__${PROBE}__close`, `mcp__${PROBE}__progress`]

/** Throws unless the session has exactly the connected probe server and no tool besides its own. */
function assertOnlyProbe(init: Record<string, any> | undefined) {
  if (!init) throw new Error('claude printed no init event')
  const servers: { name: string; status: string }[] = init.mcp_servers ?? []
  const tools: string[] = init.tools ?? []
  if (servers.length !== 1 || servers[0]!.name !== PROBE || servers[0]!.status !== 'connected')
    throw new Error(`MCP servers are not just a connected ${PROBE}: ${JSON.stringify(servers)}`)
  const extra = tools.filter(t => !PROBE_TOOLS.includes(t))
  if (extra.length > 0) throw new Error(`unexpected tools: ${extra.join(', ')}`)
}

async function runClaude(c: Case): Promise<Outcome> {
  const s = sandbox(c, 'claude')
  try {
    return await claudeIn(c, s)
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
}

async function claudeIn(c: Case, s: ReturnType<typeof sandbox>): Promise<Outcome> {
  const config = join(s.dir, 'mcp.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { [PROBE]: { command: process.execPath, args: s.serverArgs } } }))
  // stream-json carries every assistant message. --output-format json returns only the text after the last tool call.
  const r = await exec(
    [
      'claude',
      '-p',
      '--model',
      CLAUDE_MODEL,
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--mcp-config',
      config,
      '--append-system-prompt',
      guidance(CLAUDE_CODE),
      '--tools',
      '',
      '--allowedTools',
      PROBE_TOOLS.join(','),
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    { cwd: s.work, input: message(c, CLAUDE_CODE) },
  )
  const events = lines(r.stdout)
  const init = events.find(e => e.type === 'system' && e.subtype === 'init')
  assertOnlyProbe(init)
  const reply = events
    .filter(e => e.type === 'assistant')
    .flatMap(e => e.message.content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const failed = !events.some(e => e.type === 'result' && e.is_error === false)

  return { reply, calls: s.calls(), error: failed ? `claude exited ${r.code}: ${r.stderr.slice(0, 300)}` : null }
}

function tomlString(s: string): string {
  return JSON.stringify(s)
}

function codexHome(s: ReturnType<typeof sandbox>): string {
  const home = join(s.dir, 'codex-home')
  mkdirSync(home)
  const real = join(homedir(), '.codex')
  for (const f of ['auth.json', 'AGENTS.md']) if (existsSync(join(real, f))) symlinkSync(join(real, f), join(home, f))
  writeFileSync(
    join(home, 'config.toml'),
    [
      `model = ${tomlString(MODEL)}`,
      `model_reasoning_effort = ${tomlString(CODEX_EFFORT)}`,
      `developer_instructions = ${tomlString(guidance(CODEX))}`,
      `[mcp_servers.${PROBE}]`,
      `command = ${tomlString(process.execPath)}`,
      `args = ${JSON.stringify(s.serverArgs)}`,
      `default_tools_approval_mode = "approve"`,
      '',
    ].join('\n'),
  )

  return home
}

async function runCodex(c: Case): Promise<Outcome> {
  const s = sandbox(c, 'codex')
  try {
    return await codexIn(c, s)
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
}

async function codexIn(c: Case, s: ReturnType<typeof sandbox>): Promise<Outcome> {
  const home = codexHome(s)
  const r = await exec(
    [
      codexCli,
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--strict-config',
      '--json',
      '-s',
      'read-only',
      '-C',
      s.work,
      message(c, CODEX),
    ],
    { cwd: s.work, env: { ...process.env, CODEX_HOME: home } },
  )
  const events = lines(r.stdout)
  const reply = events
    .filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message')
    .map(e => e.item.text as string)
    .join('\n')

  return { reply, calls: s.calls(), error: r.code === 0 ? null : `codex exited ${r.code}: ${r.stderr.slice(0, 300)}` }
}

function failures(o: Outcome, checks: Check[]): string[] {
  const has = (pattern: string, text: string) => new RegExp(pattern, 'i').test(text)
  const out: string[] = []
  for (const c of checks) {
    if ('reply' in c) {
      if (!has(c.reply, o.reply)) out.push(`reply lacks /${c.reply}/`)
    } else if ('notReply' in c) {
      const m = o.reply.match(new RegExp(c.notReply, 'i'))
      if (m) out.push(`reply has "${m[0]}"`)
    } else {
      const mine = o.calls.filter(
        call =>
          call.tool === c.calls &&
          (!c.kind || has(`^(?:${c.kind})$`, String(call.args.kind ?? ''))) &&
          Object.entries(c.match ?? {}).every(([k, p]) => has(p, String(call.args[k] ?? ''))) &&
          (c.has ?? []).every(k => {
            const v = call.args[k]
            return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
          }),
      )
      const label = `${c.calls}${c.kind ? ` ${c.kind}` : ''}${c.match ? ` ${JSON.stringify(c.match)}` : ''}${c.has ? ` with ${c.has.join(', ')}` : ''}`
      const exact = c.count
      const min = exact ?? c.min ?? (c.max === undefined ? 1 : 0)
      const max = exact ?? c.max ?? Infinity
      if (mine.length < min || mine.length > max)
        out.push(
          `${mine.length} ${label} calls, want ${exact ?? `${min}${max === Infinity ? '+' : `-${max}`}`}; calls: ${
            o.calls.map(x => `${x.tool}(${JSON.stringify(x.args)})`).join(' ') || 'none'
          }`,
        )
    }
  }

  return out
}

type Result = Outcome & { agent: Agent; name: string; run: number; failed: string[] }

async function once(agent: Agent, c: Case, n: number): Promise<Result> {
  const o = await (agent === 'codex' ? runCodex(c) : runClaude(c)).catch((e): Outcome => ({
    reply: '',
    calls: [],
    error: String(e),
  }))
  const failed = o.error ? [o.error] : failures(o, c.checks)

  return { ...o, agent, name: c.name, run: n, failed }
}

async function assertNoInboxServer() {
  if (!agents.includes('codex')) return
  const probe = sandbox({ name: 'preflight', about: '', prompt: '', checks: [] }, 'codex')
  const home = codexHome(probe)
  const r = await exec([codexCli, 'mcp', 'list'], { cwd: probe.work, env: { ...process.env, CODEX_HOME: home } })
  const names = r.stdout
    .split('\n')
    .slice(1)
    .map(l => l.split(/\s+/)[0])
    .filter(Boolean)
  if (r.code !== 0 || names.join() !== PROBE)
    throw new Error(`Codex's MCP servers are not just ${PROBE}:\n${r.stdout}${r.stderr}`)
  rmSync(probe.dir, { recursive: true, force: true })
}

await assertNoInboxServer()
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
