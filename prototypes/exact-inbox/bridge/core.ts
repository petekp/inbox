import { resolve } from 'node:path'
import { runtimeRoot } from '../tools/paths'

export const appHome = resolve(runtimeRoot, 'app-home')
const coreSession = 'exact'
const coreSocket = resolve(runtimeRoot, 'core.sock')
export type CoreEndpoint = { source: 'demo' | 'herdr'; socket: string }
export const demoEndpoint: CoreEndpoint = { source: 'demo', socket: coreSocket }

export function coreEnvironment(endpoint: CoreEndpoint = demoEndpoint): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.HC_SESSION
  delete env.HC_SOCKET
  delete env.HERDR_PANE_ID
  delete env.HC_TERMINAL_ID
  delete env.HC_TERMINAL_SOCKET
  delete env.HC_SCOPE
  env.HC_SOCKET = endpoint.socket
  if (endpoint.source === 'demo') {
    env.HC_SESSION = coreSession
    env.XDG_STATE_HOME = resolve(runtimeRoot, 'core-state')
  }
  return env
}

export type Terminal = {
  address: string
  created_ms?: number
  name?: string
  title?: string
  state: string
  labels: Record<string, string>
  status?: { app?: string; state?: string }
  foreground?: { argv: string[] }
}

export function coreRequest(
  method: 'machine.list',
  params: object,
  endpoint: CoreEndpoint,
): Promise<{ machines: { id: string; name: string; state: string }[] }>
export function coreRequest(
  method: 'file.read',
  params: { on: string; path: string },
  endpoint: CoreEndpoint,
): Promise<{ text: string; first: number; last: number; lines: number }>
export function coreRequest(
  method: 'terminal.list',
  params?: object,
  endpoint?: CoreEndpoint,
): Promise<{ terminals: Terminal[] }>
export function coreRequest(
  method: 'terminal.label',
  params: { terminal: string; labels: Record<string, string> },
  endpoint?: CoreEndpoint,
): Promise<Terminal>
export function coreRequest(
  method: 'terminal.kill',
  params: { terminal: string },
  endpoint?: CoreEndpoint,
): Promise<unknown>
export async function coreRequest(
  method: string,
  params: object = {},
  endpoint: CoreEndpoint = demoEndpoint,
): Promise<unknown> {
  const child = Bun.spawn(['hc', 'connect'], {
    env: coreEnvironment(endpoint),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n')
  child.stdin.end()
  const timer = setTimeout(() => child.kill(), method === 'file.read' ? 3000 : 5000)
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (code !== 0) throw new Error(stderr.trim() || 'Herdr Core did not answer.')
    for (const line of stdout.split('\n').filter(Boolean)) {
      const result = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } }
      if (result.id !== 1) continue
      if (result.error) throw new Error(result.error.message)
      if (result.result === undefined) throw new Error('Herdr Core returned no result.')
      return result.result
    }
    throw new Error('Herdr Core returned no reply.')
  } finally {
    clearTimeout(timer)
  }
}

const terminalReads = new Map<string, { at: number; terminals: Terminal[] }>()

export async function listTerminals(endpoint: CoreEndpoint, fresh = false): Promise<Terminal[]> {
  const cached = terminalReads.get(endpoint.socket)
  if (!fresh && cached && Date.now() - cached.at < 1000) return cached.terminals
  const { terminals } = await coreRequest('terminal.list', {}, endpoint)
  terminalReads.set(endpoint.socket, { at: Date.now(), terminals })
  return terminals
}

export async function currentTerminal(): Promise<Terminal | null> {
  const terminals = await listTerminals(demoEndpoint)
  const matches = terminals.filter(t => t.labels?.['inbox.prototype'] === 'exact')
  if (matches.length > 1) throw new Error('More than one prototype session is running.')
  return matches[0] ?? null
}
