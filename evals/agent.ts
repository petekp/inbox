import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { EMPTY } from '../hooks/ledger'
import {
  CLAUDE_CODE,
  statusCarryText,
  closedText,
  guidanceText,
  guidedCloseDescription,
  inboxText,
  MAX_TOOL_DESCRIPTION,
} from '../hooks/model-text'
import type { Host } from '../hooks/model-text'
import type { Ledger } from '../types'
import { CODEX } from '../codex/src/texts'
import { OMP } from '../omp/src/texts'
import { MODEL } from '../codex/src/update'
import { agentTools } from '../hooks/tools'
import type { AgentTool } from '../hooks/tools'
import { codexCli } from './codex-cli'
import {
  earlierRuns,
  finish,
  IsolationError,
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

type Agent = 'claude' | 'codex' | 'omp'

/** Patterns are case-insensitive regular expressions. */
type Check =
  | {
      calls: AgentTool
      /** Matches the call's `kind`, as a whole. */
      kind?: string
      /** Matches each named argument. */
      match?: Record<string, string>
      /** Arguments that must be non-empty. */
      has?: string[]
      /** Matches the tool's answer. */
      result?: string
      /** Exactly this many matching calls. Without `count` and `max`, at least `min` (default 1). */
      count?: number
      min?: number
      max?: number
    }
  | { reply: string }
  | { notReply: string }
  /** No inbox id, such as i3 or f112, in the reply. Ids are lowercase, so "F1" is not one. */
  | { noIds: true }

type Case = {
  name: string
  about: string
  /** The inbox the agent is shown. */
  ledger?: Partial<Ledger>
  /** The inbox the tools answer from, when it differs from what the agent was shown. */
  toolLedger?: Partial<Ledger>
  /** Files to put in the folder the agent runs in, by path within it. */
  files?: Record<string, string>
  prompt: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
  /** The agents that run the case, when not all of them do. */
  agents?: Agent[]
}

type Call = { tool: string; args: Record<string, unknown>; result: string }

const MIN = 0.75
const PROBE = 'probe'
const OMP_MODEL = 'anthropic/claude-opus-5-5'

const { values } = parseArgs({
  options: {
    agent: { type: 'string', default: 'both' },
    'claude-model': { type: 'string', default: 'opus' },
    'omp-model': { type: 'string', default: OMP_MODEL },
    runs: { type: 'string', default: '5' },
    case: { type: 'string' },
    out: { type: 'string' },
    'set-baseline': { type: 'boolean', default: false },
    with: { type: 'string' },
    cases: { type: 'string', default: 'evals/agent-cases.json' },
    probe: { type: 'string' },
    'omp-probe': { type: 'string' },
    'no-guidance': { type: 'boolean', default: false },
  },
})
const AGENTS: Record<string, Agent[]> = {
  both: ['claude', 'codex'],
  all: ['claude', 'codex', 'omp'],
  claude: ['claude'],
  codex: ['codex'],
  omp: ['omp'],
}
const selected = AGENTS[values.agent]
if (!selected) throw new Error(`Unknown --agent ${values.agent}. Use claude, codex, omp, both or all.`)
const agents: Agent[] = selected
const runs = runCount(values.runs)
const cases: Case[] = selectCases(JSON.parse(readFileSync(values.cases, 'utf8')), values.case)
/** The control run: every agent gets the tools and the inbox text, and none gets the guidance. */
const isGuided = !values['no-guidance']
const probeServer = values.probe ?? fileURLToPath(new URL('./probe.mjs', import.meta.url))
const ompProbe = values['omp-probe'] ?? fileURLToPath(new URL('./omp-probe.mjs', import.meta.url))

const CODEX_EFFORT = 'medium'
const CLAUDE_MODEL = values['claude-model']
const OMP_RUN_MODEL = values['omp-model']
const OMP_RUN_MODEL_ID = OMP_RUN_MODEL.split('/').at(-1)
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
  const ledger = { ...EMPTY, ...c.ledger } as Ledger
  const carry = host === CLAUDE_CODE ? statusCarryText(ledger) : null
  const notes = [carry, inboxText(host, ledger, false), closedText(ledger.closed)].filter(Boolean)

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

/**
 * `error`: why the run could not be graded. `model`: the model that answered, as the agent reported it. `raw`: the
 * agent's own output, kept in the results as the evidence for each verdict.
 */
type Outcome = { reply: string; calls: Call[]; error: string | null; model: string | null; raw: string }

/** A fresh folder for one run: the stand-in server's state and log, and an empty working folder. */
function sandbox(c: Case, agent: Agent) {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-agent-eval-'))
  const work = join(dir, 'work')
  mkdirSync(work)
  for (const [path, text] of Object.entries(c.files ?? {})) {
    mkdirSync(dirname(join(work, path)), { recursive: true })
    writeFileSync(join(work, path), text)
  }
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.jsonl')
  writeFileSync(
    state,
    JSON.stringify({ agent, isGuided, shown: c.ledger ?? {}, ledger: c.toolLedger ?? c.ledger ?? {} }),
  )
  writeFileSync(log, '')
  const serverArgs = [probeServer, '--state', state, '--log', log]
  const calls = (): Call[] =>
    lines(readFileSync(log, 'utf8')).map(l => ({ tool: l.tool, args: l.args, result: l.result }))

  return { dir, work, state, log, serverArgs, calls }
}

const PROBE_TOOLS = agentTools(CLAUDE_CODE).map(t => `mcp__${PROBE}__${t.name}`)

/** Throws unless the session has exactly the connected probe server and no tool besides its own. */
function assertOnlyProbe(init: Record<string, any>) {
  const servers: { name: string; status: string }[] = init.mcp_servers ?? []
  const tools: string[] = init.tools ?? []
  if (servers.length !== 1 || servers[0]!.name !== PROBE || servers[0]!.status !== 'connected')
    throw new IsolationError(`MCP servers are not just a connected ${PROBE}: ${JSON.stringify(servers)}`)
  const extra = tools.filter(t => !PROBE_TOOLS.includes(t))
  if (extra.length > 0) throw new IsolationError(`unexpected tools: ${extra.join(', ')}`)
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
      '--no-session-persistence',
      '--model',
      CLAUDE_MODEL,
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--mcp-config',
      config,
      '--tools',
      '',
      '--allowedTools',
      PROBE_TOOLS.join(','),
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    {
      cwd: s.work,
      env: { ...process.env, CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH: String(MAX_TOOL_DESCRIPTION) },
      input: message(c, CLAUDE_CODE),
    },
  )
  const events = lines(r.stdout)
  const init = events.find(e => e.type === 'system' && e.subtype === 'init')
  if (!init)
    return {
      reply: '',
      calls: s.calls(),
      error: `claude exited ${r.code} before it started a session: ${r.stderr.slice(0, 300)}`,
      model: null,
      raw: r.stdout,
    }
  const servers: { name: string; status: string }[] = init.mcp_servers ?? []
  const isProbeDown = servers.length === 1 && servers[0]!.name === PROBE && servers[0]!.status !== 'connected'
  if (isProbeDown)
    return {
      reply: '',
      calls: s.calls(),
      error: `the ${PROBE} server did not connect: ${servers[0]!.status}`,
      model: init.model ?? null,
      raw: r.stdout,
    }
  assertOnlyProbe(init)
  const reply = events
    .filter(e => e.type === 'assistant')
    .flatMap(e => e.message.content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const failed = !events.some(e => e.type === 'result' && e.is_error === false)

  return {
    reply,
    calls: s.calls(),
    error: failed ? `claude exited ${r.code}: ${r.stderr.slice(0, 300)}` : null,
    model: init?.model ?? null,
    raw: r.stdout,
  }
}

function tomlString(s: string): string {
  return JSON.stringify(s)
}

function codexHome(s: ReturnType<typeof sandbox>): string {
  const home = join(s.dir, 'codex-home')
  mkdirSync(home)
  // Only the sign-in: the runner's own AGENTS.md would reach the agent.
  const auth = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json')
  if (existsSync(auth)) symlinkSync(auth, join(home, 'auth.json'))
  writeFileSync(
    join(home, 'config.toml'),
    [
      `model = ${tomlString(MODEL)}`,
      `model_reasoning_effort = ${tomlString(CODEX_EFFORT)}`,
      ...(isGuided ? [`developer_instructions = ${tomlString(guidance(CODEX))}`] : []),
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

  return {
    reply,
    calls: s.calls(),
    error: r.code === 0 ? null : `codex exited ${r.code}: ${r.stderr.slice(0, 300)}`,
    model: null,
    raw: r.stdout,
  }
}

/** Throws unless the omp session offers exactly its `bash` and the probe's tools, and no MCP server's tools. */
function assertOnlyOmpProbe(toolsFile: string) {
  if (!existsSync(toolsFile)) throw new IsolationError('the omp probe wrote no tool list')
  const seen: { active: string[]; all: { name: string; source: string }[] } = JSON.parse(
    readFileSync(toolsFile, 'utf8'),
  )
  const wanted = ['bash', ...agentTools(OMP).map(t => t.name)].toSorted()
  if (seen.active.toSorted().join() !== wanted.join())
    throw new IsolationError(`omp's active tools are not just ${wanted.join(' and ')}: ${seen.active.join(', ')}`)
  const mcp = seen.all.filter(t => /mcp/i.test(t.source))
  if (mcp.length > 0) throw new IsolationError(`omp offers MCP tools: ${mcp.map(t => t.name).join(', ')}`)
}

/**
 * A macOS sandbox profile that lets a process write only under `dir` and the system temp folder, as Codex's
 * `-s read-only` keeps its shell from changing the person's files.
 */
function writesOnlyUnder(dir: string): string {
  const paths = [realpathSync(dir), realpathSync(tmpdir())].map(p => `(subpath ${JSON.stringify(p)})`).join(' ')

  return `(version 1)(allow default)(deny file-write*)(allow file-write* ${paths} (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))`
}

/**
 * The Claude sign-in of your own omp profile, which a run's empty `HOME` gets through its environment. Each run asks
 * again, since `omp token` refreshes a token that has expired.
 */
async function ompClaudeToken(): Promise<{ token: string; error: string | null }> {
  const r = await exec(['omp', 'token', 'anthropic'], { cwd: tmpdir(), env: process.env })
  const token = r.stdout.trim()

  return r.code === 0 && token !== ''
    ? { token, error: null }
    : {
        token: '',
        error: `The omp agent needs a Claude sign-in in omp (run omp, then /login): ${r.stderr.slice(0, 300)}`,
      }
}

/**
 * Runs omp in print mode with its `bash` tool and the probe extension, in a fresh HOME that holds nothing of the
 * person's omp config. Like Codex, it has a shell that can write only in the case's folder. The sign-in token reaches
 * omp through the environment of this one command.
 */
async function ompIn(c: Case, s: ReturnType<typeof sandbox>): Promise<Outcome> {
  const signIn = await ompClaudeToken()
  if (signIn.error) return { reply: '', calls: s.calls(), error: signIn.error, model: null, raw: '' }
  const home = join(s.dir, 'omp-home')
  mkdirSync(home)
  const toolsFile = join(s.dir, 'tools.json')
  const r = await exec(
    [
      'sandbox-exec',
      '-p',
      writesOnlyUnder(s.dir),
      'omp',
      '-p',
      '--mode',
      'json',
      '--no-session',
      '--no-extensions',
      '-e',
      ompProbe,
      '--tools=bash',
      '--approval-mode=yolo',
      '--no-lsp',
      '--no-skills',
      '--no-rules',
      '--no-title',
      '--model',
      OMP_RUN_MODEL,
      c.prompt,
    ],
    {
      cwd: s.work,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        ANTHROPIC_OAUTH_TOKEN: signIn.token,
        INBOX_EVAL_STATE: s.state,
        INBOX_EVAL_LOG: s.log,
        INBOX_EVAL_TOOLS: toolsFile,
        ...(isGuided ? {} : { INBOX_EVAL_NO_GUIDANCE: '1' }),
      },
    },
  )
  const events = lines(r.stdout)
  if (!existsSync(toolsFile) && r.code !== 0) {
    const why = r.code === -1 ? `timed out after ${TIMEOUT_MS / 1000}s or was killed` : `exited ${r.code}`
    return {
      reply: '',
      calls: s.calls(),
      error: `omp ${why} before it listed its tools: ${r.stderr.slice(0, 300)}`,
      model: null,
      raw: r.stdout,
    }
  }
  if (!existsSync(toolsFile))
    return { reply: '', calls: s.calls(), error: 'omp did not load the probe extension', model: null, raw: r.stdout }
  assertOnlyOmpProbe(toolsFile)
  // Like the Claude run, the reply is every assistant message's text, since the text after a tool call is not the whole reply.
  const reply = events
    .filter(e => e.type === 'message_end' && e.message?.role === 'assistant')
    .flatMap(e => e.message.content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const end = events.findLast(e => e.type === 'agent_end')
  const lastAssistant = end?.messages?.findLast((m: { role: string }) => m.role === 'assistant')
  const failed =
    r.code !== 0 || !end || lastAssistant?.stopReason === 'error' || lastAssistant?.stopReason === 'aborted'
  // omp runs the nearest model its catalog has when it lacks the one named, and says so only in each message.
  const models = events
    .filter(e => e.type === 'message_end' && e.message?.role === 'assistant')
    .map(e => e.message.model as string)
  const otherModel = models.find(m => m !== OMP_RUN_MODEL_ID)

  return {
    reply,
    calls: s.calls(),
    error: failed
      ? `omp ${r.code === -1 ? 'timed out or was killed' : `exited ${r.code}`}${end ? '' : ' without agent_end'}: ${lastAssistant?.errorMessage ?? r.stderr.slice(0, 300)}`
      : otherModel !== undefined
        ? `omp ran ${otherModel}, not ${OMP_RUN_MODEL}`
        : null,
    model: models[0] ?? null,
    raw: r.stdout,
  }
}

async function runOmp(c: Case): Promise<Outcome> {
  const s = sandbox(c, 'omp')
  try {
    return await ompIn(c, s)
  } finally {
    rmSync(s.dir, { recursive: true, force: true })
  }
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
    } else if ('noIds' in c) {
      const m = o.reply.match(/\b[if]\d+\b/)
      if (m) out.push(`reply has the id "${m[0]}"`)
    } else {
      const mine = o.calls.filter(
        call =>
          call.tool === c.calls &&
          (!c.kind || has(`^(?:${c.kind})$`, String(call.args.kind ?? ''))) &&
          Object.entries(c.match ?? {}).every(([k, p]) => has(p, String(call.args[k] ?? ''))) &&
          (!c.result || has(c.result, call.result)) &&
          (c.has ?? []).every(k => {
            const v = call.args[k]
            return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
          }),
      )
      const label = `${c.calls}${c.kind ? ` ${c.kind}` : ''}${c.match ? ` ${JSON.stringify(c.match)}` : ''}${c.has ? ` with ${c.has.join(', ')}` : ''}${c.result ? ` answered /${c.result}/` : ''}`
      const exact = c.count
      const min = exact ?? c.min ?? (c.max === undefined ? 1 : 0)
      const max = exact ?? c.max ?? Infinity
      if (mine.length < min || mine.length > max)
        out.push(
          `${mine.length} ${label} calls, want ${exact ?? `${min}${max === Infinity ? '+' : `-${max}`}`}; calls: ${
            o.calls.map(x => `${x.tool}(${JSON.stringify(x.args)}) → ${x.result}`).join(' ') || 'none'
          }`,
        )
    }
  }

  return out
}

type Result = Run & { reply: string; calls: Call[]; raw: string }

/** An `IsolationError` is thrown on, so the whole run stops. */
async function once(agent: Agent, c: Case, n: number): Promise<Result> {
  const run = agent === 'codex' ? runCodex : agent === 'omp' ? runOmp : runClaude
  const o = await run(c).catch((e): Outcome => {
    if (e instanceof IsolationError) throw e

    return { reply: '', calls: [], error: String(e), model: null, raw: '' }
  })
  const failed = o.error ? [] : failures(o, c.checks)

  return { ...o, ...job(agent, c, n), failed, attempts: 1, earlier: [], durationMs: 0 }
}

const REQUESTED: Record<Agent, string> = { claude: CLAUDE_MODEL, codex: MODEL, omp: OMP_RUN_MODEL }

function job(agent: Agent, c: Case, n: number) {
  return { agent, name: c.name, run: n, requested: REQUESTED[agent] }
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
    throw new IsolationError(`Codex's MCP servers are not just ${PROBE}:\n${r.stdout}${r.stderr}`)
  rmSync(probe.dir, { recursive: true, force: true })
}

/** One trivial omp run, which fails when the session offers any tool besides the probe's, or any MCP server's. */
async function assertOnlyOmpProbeSession() {
  if (!agents.includes('omp')) return
  const o = await runOmp({ name: 'preflight', about: '', prompt: 'Reply with the word ok.', checks: [] })
  if (o.error) throw new IsolationError(`omp preflight failed: ${o.error}`)
}

if (isGuided && agents.includes('claude')) {
  guidance(CLAUDE_CODE)
  const closeDescription = guidedCloseDescription(
    CLAUDE_CODE,
    agentTools(CLAUDE_CODE).find(t => t.name === 'close')!.description,
  )
  if (closeDescription.length > MAX_TOOL_DESCRIPTION)
    throw new Error(
      `close's description is ${closeDescription.length} characters, and Claude Code sends ${MAX_TOOL_DESCRIPTION}`,
    )
}

const about = provenance(
  isGuided ? 'agent' : 'agent-no-guidance',
  { claude: 'claude', codex: codexCli, omp: 'omp' },
  {
    ...Object.fromEntries(
      [CLAUDE_CODE, CODEX, OMP].flatMap(host => [
        [`guidanceText ${host.agent}`, guidanceText(host)],
        [`tools ${host.agent}`, JSON.stringify(agentTools(host))],
      ]),
    ),
    'close description Claude': guidedCloseDescription(CLAUDE_CODE, ''),
    cases: readFileSync(values.cases, 'utf8'),
    models: JSON.stringify(REQUESTED),
    runner: readFileSync(process.argv[1]!, 'utf8'),
    probe: readFileSync(probeServer, 'utf8'),
    'omp probe': readFileSync(ompProbe, 'utf8'),
  },
)
const path = resultsPath(values.out, about)
const firstRuns = earlierRuns<Result>(values.with, about, path)
const preflight = await Promise.all([assertNoInboxServer(), assertOnlyOmpProbeSession()]).then(
  () => null,
  (e: unknown) => `preflight: ${String(e)}`,
)
const casesFor = (a: Agent) => cases.filter(c => c.agents?.includes(a) ?? true)
const jobs: Job<Result>[] = agents.flatMap(a =>
  casesFor(a).flatMap(c =>
    Array.from({ length: runs }, (_, n) => ({
      go: () => once(a, c, n),
      unrun: (error: string): Result => ({
        ...job(a, c, n),
        model: null,
        reply: '',
        calls: [],
        raw: '',
        error,
        failed: [],
        attempts: 1,
        earlier: [],
        durationMs: 0,
      }),
    })),
  ),
)
const { results, stopped } =
  preflight === null
    ? await runJobs(jobs, so => writeResults(path, about, so))
    : { results: [] as Result[], stopped: preflight }
writeResults(path, about, results, stopped)
const judged = [...firstRuns, ...results]
const baselines = readBaselines(about.suite)
const verdicts = agents.map(a => report([a], casesFor(a), judged, runs, MIN, baselines))
const verdict = verdicts.includes('fail') ? 'fail' : verdicts.includes('not run') ? 'not run' : 'pass'
finish(
  about,
  path,
  judged,
  stopped,
  verdict,
  values['set-baseline'],
  cases.map(c => c.name),
)
