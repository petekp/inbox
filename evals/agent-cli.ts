import { execFile } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { EMPTY } from '../hooks/ledger'
import { CLAUDE_CODE, guidanceText } from '../hooks/model-text'
import { statusCarryText, closedText, inboxText } from '../hooks/inbox-text'
import type { Host } from '../hooks/model-text'
import type { Ledger } from '../types'
import { OMP } from '../omp/src/texts'
import { agentTools } from '../hooks/tools'
import type { Case } from './agent-checks'
import { IsolationError } from './harness'

export const PROBE = 'probe'

export const TIMEOUT_MS = 300_000

/**
 * The guidance the agent reads, from the shipped text. It names the tools of the real inbox server; the stand-in
 * server is named probe instead, because an agent session that can reach a server named inbox lets the real
 * installed mod answer the calls and save them to the person's real inbox.
 */
export function guidance(host: Host): string {
  const text = guidanceText(host).replaceAll('mcp__inbox__', `mcp__${PROBE}__`)
  if (text.includes('inbox__')) throw new Error('guidanceText names a tool this eval does not map to the probe server')

  return text
}

export function message(c: Case, host: Host): string {
  if (!c.ledger) return c.prompt
  const ledger = { ...EMPTY, ...c.ledger } as Ledger
  const carry = host === CLAUDE_CODE ? statusCarryText(ledger) : null
  const notes = [carry, inboxText(host, ledger, false), closedText(ledger.closed)].filter(Boolean)

  return `${notes.join('\n')}\n\n${c.prompt}`
}

export function exec(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv; input?: string }) {
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

export function lines(stdout: string): Record<string, any>[] {
  return stdout.split('\n').flatMap(l => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
}

export const PROBE_TOOLS = agentTools(CLAUDE_CODE).map(t => `mcp__${PROBE}__${t.name}`)

/** Throws unless the session has exactly the connected probe server and no tool besides its own. */
export function assertOnlyProbe(init: Record<string, any>) {
  const servers: { name: string; status: string }[] = init.mcp_servers ?? []
  const tools: string[] = init.tools ?? []
  if (servers.length !== 1 || servers[0]!.name !== PROBE || servers[0]!.status !== 'connected')
    throw new IsolationError(`MCP servers are not just a connected ${PROBE}: ${JSON.stringify(servers)}`)
  const extra = tools.filter(t => !PROBE_TOOLS.includes(t))
  if (extra.length > 0) throw new IsolationError(`unexpected tools: ${extra.join(', ')}`)
}

export function tomlString(s: string): string {
  return JSON.stringify(s)
}

/** Throws unless the omp session offers exactly its `bash` and the probe's tools, and no MCP server's tools. */
export function assertOnlyOmpProbe(toolsFile: string) {
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
export function writesOnlyUnder(dir: string): string {
  const paths = [realpathSync(dir), realpathSync(tmpdir())].map(p => `(subpath ${JSON.stringify(p)})`).join(' ')

  return `(version 1)(allow default)(deny file-write*)(allow file-write* ${paths} (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))`
}

/**
 * The Claude sign-in of your own omp profile, which a run's empty `HOME` gets through its environment. Each run asks
 * again, since `omp token` refreshes a token that has expired.
 */
export async function ompClaudeToken(): Promise<{ token: string; error: string | null }> {
  const r = await exec(['omp', 'token', 'anthropic'], { cwd: tmpdir(), env: process.env })
  const token = r.stdout.trim()

  return r.code === 0 && token !== ''
    ? { token, error: null }
    : {
        token: '',
        error: `The omp agent needs a Claude sign-in in omp (run omp, then /login): ${r.stderr.slice(0, 300)}`,
      }
}
