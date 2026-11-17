import { basename, isAbsolute, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { isSessionFile } from '../../../hooks/session-files'
import { runtimeRoot } from '../tools/paths'
import { coreRequest, appHome, currentTerminal, demoEndpoint, listTerminals } from './core'
import type { CoreEndpoint, Terminal } from './core'

export type SessionBinding = CoreEndpoint & {
  session: string
  terminal: string
  appHome: string
  machine?: string
  machineId?: string
}

const saved: unknown = await readFile(resolve(runtimeRoot, 'session-connection.json'), 'utf8').then(
  text => JSON.parse(text),
  error => {
    if (error.code === 'ENOENT') return null
    throw error
  },
)

function readBinding(value: unknown): SessionBinding | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid session connection.')
  const v = value as Record<string, unknown>
  const validSession = typeof v.session === 'string' && isSessionFile(`${v.session}.json`)
  const validTerminal = typeof v.terminal === 'string' && /^t[0-9a-z]+$/.test(v.terminal)
  const validSocket = typeof v.socket === 'string' && isAbsolute(v.socket)
  const validHome = typeof v.appHome === 'string' && isAbsolute(v.appHome)
  if (!validSession || !validTerminal || !validSocket || !validHome) throw new Error('Invalid session connection.')
  return {
    source: 'herdr',
    session: v.session as string,
    terminal: v.terminal as string,
    socket: v.socket as string,
    appHome: v.appHome as string,
  }
}

const configured = readBinding(saved)

export async function activeBinding(): Promise<SessionBinding | null> {
  if (configured) return configured
  const terminal = await currentTerminal()
  const session = terminal?.labels['inbox.session']
  if (!terminal || !session || !isSessionFile(`${session}.json`)) return null
  return { ...demoEndpoint, appHome, session, terminal: terminal.address }
}

export async function boundTerminal(binding: SessionBinding, fresh = false): Promise<Terminal> {
  const terminals = await listTerminals(binding, fresh)
  const terminal = terminals.find(t => t.address === binding.terminal)
  if (binding.machine) {
    const { machines } = await coreRequest('machine.list', {}, binding)
    const machine = machines.find(m => m.name === binding.machine && m.id === binding.machineId)
    if (!machine || machine.state !== 'connected') throw new Error('The agent host is disconnected.')
  }
  const sameSession = terminal?.labels?.['inbox.session'] === binding.session
  const runningClaude =
    terminal?.state === 'live' &&
    (binding.machine
      ? verifiedAgent(terminal)
      : terminal.status?.app === 'claude-code' &&
        (binding.source === 'demo' || basename(terminal.foreground?.argv[0] ?? '') === 'claude'))
  if (!terminal || !sameSession || !runningClaude)
    throw new Error('This Claude session is no longer connected. Replies remain attached to it.')
  return terminal
}

export function verifiedAgent(terminal: Terminal): boolean {
  const programs: Record<string, string> = { 'claude-code': 'claude', omp: 'omp', codex: 'codex' }
  const expected = programs[terminal.status?.app ?? '']
  return expected !== undefined && basename(terminal.foreground?.argv[0] ?? '') === expected
}
