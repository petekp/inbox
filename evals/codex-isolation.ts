import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { PROBE } from './agent-cli'
import { IsolationError } from './harness'

/**
 * A top-level config key, so it goes before any table. It turns web search off, and `assertCodexUsedOnlyProbe` stays
 * as the backstop.
 */
export const CODEX_WEB_SEARCH_CONFIG = 'web_search = "disabled"'

/**
 * Config that keeps a Codex run's tools to its shell and the probe. Apps are the account's connectors, served as the
 * `codex_apps` MCP server, which `codex mcp list` leaves out. Plugins bring their own skills and apps. Bundled skills
 * come with Codex.
 */
export const CODEX_ISOLATION_CONFIG = [
  '[features]',
  'apps = false',
  'plugins = false',
  '[skills.bundled]',
  'enabled = false',
]

/**
 * The whole environment of a Codex run. Codex finds user skills under `$HOME/.agents/skills`, and its shell runs
 * `zsh -l`, which reads the rc files in `$HOME`. So the run gets an empty `HOME` and none of the runner's variables.
 */
export function codexEnv(runDir: string, codexHome: string): NodeJS.ProcessEnv {
  const home = join(runDir, 'home')
  mkdirSync(home, { recursive: true })

  return { PATH: process.env.PATH, HOME: home, CODEX_HOME: codexHome }
}

type Rpc = { result?: any; error?: { message: string } }

/**
 * Asks Codex's app-server, under a run's config and environment, for the MCP servers, apps and skills a session in
 * `cwd` would get. Throws unless the only server is the probe and there are no apps or skills.
 */
export async function assertCodexOffersOnlyProbe(cli: string, cwd: string, env: NodeJS.ProcessEnv) {
  const server = spawn(cli, ['app-server'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map<number, (r: Rpc) => void>()
  let stderr = ''
  server.stderr.on('data', (c: Buffer) => (stderr += c))
  createInterface({ input: server.stdout }).on('line', line => {
    let m: { id?: number } & Rpc
    try {
      m = JSON.parse(line)
    } catch {
      return
    }
    if (m.id !== undefined) waiting.get(m.id)?.(m)
  })
  let next = 0
  const send = (message: object) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  const ask = (method: string, params: object) =>
    new Promise<any>((resolve, reject) => {
      const id = ++next
      const timer = setTimeout(
        () => reject(new IsolationError(`Codex's app-server did not answer ${method}: ${stderr}`)),
        30_000,
      )
      waiting.set(id, r => {
        clearTimeout(timer)
        if (r.error) reject(new IsolationError(`Codex's app-server refused ${method}: ${r.error.message}`))
        else resolve(r.result)
      })
      send({ id, method, params })
    })
  try {
    await ask('initialize', { clientInfo: { name: 'inbox-agent-eval', version: '0' } })
    send({ method: 'initialized' })
    const servers: { name: string }[] = (await ask('mcpServerStatus/list', { detail: 'toolsAndAuthOnly' })).data
    const apps: { id: string }[] = (await ask('app/list', { forceRefetch: true })).data
    const skills: { skills: { path: string }[] }[] = (await ask('skills/list', { cwds: [cwd], forceReload: true })).data
    const names = servers.map(s => s.name)
    const skillPaths = skills.flatMap(s => s.skills.map(k => k.path))
    if (names.join() !== PROBE)
      throw new IsolationError(`Codex's MCP servers are not just ${PROBE}: ${names.join(', ')}`)
    if (apps.length > 0) throw new IsolationError(`Codex offers apps: ${apps.map(a => a.id).join(', ')}`)
    if (skillPaths.length > 0) throw new IsolationError(`Codex offers skills: ${skillPaths.join(', ')}`)
  } finally {
    server.kill()
  }
}

/**
 * Codex's own tools for MCP resources. Codex offers them whenever a session has an MCP server, and no config turns
 * them off. Each lists or reads the resources of the session's own MCP servers, which the preflight holds to the
 * probe. Its event names the server the call asked for, or `codex` when it asked for none.
 */
const CODEX_RESOURCE_TOOLS = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']
const CODEX_OWN_SERVER = 'codex'

const itemOf = (e: Record<string, any>) => (e.type === 'item.completed' || e.type === 'item.started' ? e.item : null)

const isResourceCall = (item: Record<string, any>) =>
  item.type === 'mcp_tool_call' &&
  CODEX_RESOURCE_TOOLS.includes(item.tool) &&
  (item.server === CODEX_OWN_SERVER || item.server === PROBE)

/**
 * Throws on a `codex exec --json` event that reached past the probe: another MCP server's tool, a web search, or a
 * command that names the runner's home folder, where its skills and config live.
 */
export function assertCodexUsedOnlyProbe(events: Record<string, any>[]) {
  const runnerHome = homedir()
  for (const item of events.map(itemOf)) {
    if (!item) continue
    if (item.type === 'mcp_tool_call' && item.server !== PROBE && !isResourceCall(item))
      throw new IsolationError(`Codex called ${item.server} ${item.tool}`)
    if (item.type === 'web_search') throw new IsolationError('Codex searched the web')
    if (item.type === 'command_execution' && String(item.command).includes(runnerHome))
      throw new IsolationError(`Codex ran a command in the runner's home folder: ${item.command}`)
  }
}

/** Why a run that called one of Codex's resource tools cannot be graded, or null when it called none. */
export function codexResourceCall(events: Record<string, any>[]): string | null {
  const calls = events
    .map(itemOf)
    .filter(item => item?.type === 'mcp_tool_call' && isResourceCall(item))
    .map(item => `${item.server} ${item.tool}`)
  if (calls.length === 0) return null

  return `Codex called its own resource tool, which a run cannot turn off: ${[...new Set(calls)].join(', ')}`
}
