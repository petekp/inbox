import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { hostname } from 'node:os'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { runtimeRoot } from '../tools/paths'
import { readPublished, publishedTerminal, remoteHost } from './remote'
import { isSessionFile } from '../../../hooks/session-files'
import { bandCounts } from '../../../hooks/band'
import { readSession } from '../../../herdr/src/files'
import { activeBinding, verifiedAgent } from './binding'
import type { SessionBinding } from './binding'
import { coreRequest, listTerminals } from './core'
import { currentView, emptySnapshot } from './view'

import type { Result } from '../app.contract'

type Directory = Result<'loadSessions'>
type Entry = Omit<Directory['entries'][number], 'duplicate'>
const entries = new Map<string, { binding: SessionBinding; entry: Entry }>()
const keyOf = (b: SessionBinding) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        b.machine
          ? [b.socket, b.appHome, b.terminal, b.session, b.machineId]
          : [b.socket, b.appHome, b.terminal, b.session],
      ),
    )
    .digest('hex')
let refreshing: Promise<Directory> | null = null

const cachePath = resolve(runtimeRoot, 'session-catalog.json')
let loaded = false
let persisted = ''

async function restoreCatalog(selected: SessionBinding) {
  if (loaded) return
  const raw = await readFile(cachePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '[]'
    throw error
  })
  const saved: unknown = JSON.parse(raw)
  if (!Array.isArray(saved)) throw new Error('Saved sessions could not be read.')
  for (const value of saved) {
    if (!value || typeof value !== 'object') continue
    const b = value.binding,
      e = value.entry
    if (
      !b ||
      !e ||
      b.socket !== selected.socket ||
      (b.machine
        ? remoteHost(b.terminal)?.appHome !== b.appHome || remoteHost(b.terminal)?.id !== b.machineId
        : b.appHome !== selected.appHome) ||
      typeof b.terminal !== 'string' ||
      typeof b.session !== 'string'
    )
      continue
    if (b.session !== '' && !isSessionFile(`${b.session}.json`)) continue
    if (!['name', 'project', 'host', 'agent'].every(k => typeof e[k] === 'string')) continue
    const binding = {
      ...selected,
      appHome: b.appHome,
      session: b.session,
      terminal: b.terminal,
      ...(b.machine ? { machine: b.machine, machineId: b.machineId } : {}),
    }
    const id = keyOf(binding)
    entries.set(id, {
      binding,
      entry: {
        id,
        session: b.session,
        name: e.name,
        project: e.project,
        location: typeof e.location === 'string' ? e.location : '',
        host: e.host,
        agent: e.agent,
        state: 'disconnected',
        reason: 'The agent host is disconnected.',
        asks: 0,
        attention: '',
        fresh: false,
        readOnly: id !== keyOf(selected),
      },
    })
  }
  loaded = true
}

async function saveCatalog() {
  const text = JSON.stringify(
    [...entries.values()].map(({ binding, entry }) => ({
      binding,
      entry: {
        name: entry.name,
        project: entry.project,
        location: entry.location,
        host: entry.host,
        agent: entry.agent,
      },
    })),
  )
  if (text === persisted) return
  const temporary = `${cachePath}.tmp`
  await writeFile(temporary, text, { mode: 0o600 })
  await rename(temporary, cachePath)
  persisted = text
}

function directoryEntries() {
  const values = [...entries.values()].map(v => v.entry)
  const counts = new Map<string, number>()
  for (const entry of values) if (entry.state !== 'ended') counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  return values
    .map(entry => ({ ...entry, duplicate: (counts.get(entry.name) ?? 0) > 1 }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

async function discover() {
  const selected = await activeBinding()
  if (!selected) return { entries: [], defaultId: '', error: 'No agent host is configured.' }
  const defaultId = keyOf(selected)
  try {
    await restoreCatalog(selected)
  } catch {
    return { entries: directoryEntries(), defaultId, error: 'Saved session history could not be read.' }
  }
  try {
    const [terminals, machineResult] = await Promise.all([
      listTerminals(selected),
      coreRequest('machine.list', {}, selected),
    ])
    const present = new Set<string>()
    await Promise.all(
      terminals.map(async terminal => {
        const publishedId = terminal.labels?.['inbox.session'] ?? ''
        const validId = publishedId !== '' && isSessionFile(`${publishedId}.json`)
        const session = validId ? publishedId : ''
        const foreground = basename(terminal.foreground?.argv[0] ?? '')
        const shell = ['zsh', 'bash', 'sh', 'fish', 'nu'].includes(foreground)
        if (terminal.state !== 'live' || shell) return
        if (session === '' && !terminal.status?.app) return
        const remote = remoteHost(terminal.address)
        const machine = remote && machineResult.machines.find(m => m.name === remote.name && m.id === remote.id)
        const binding = {
          ...selected,
          terminal: terminal.address,
          session,
          ...(remote ? { appHome: remote.appHome, machine: remote.name, machineId: remote.id } : {}),
        }
        const id = keyOf(binding)
        const isLocal = /^t[0-9a-z]+$/.test(terminal.address)
        const isClaude =
          terminal.status?.app === 'claude-code' &&
          (selected.source === 'demo' || basename(terminal.foreground?.argv[0] ?? '') === 'claude')
        if (isLocal && !isClaude && terminal.status?.app === 'zsh') return
        present.add(id)
        const old = entries.get(id)?.entry
        const entry: Entry = {
          id,
          session,
          name: terminal.labels['inbox.title'] || terminal.title || terminal.name || 'Agent session',
          project: old?.project ?? '',
          location: [
            terminal.labels['where'],
            terminal.created_ms ? `Terminal opened ${new Date(terminal.created_ms).toLocaleString()}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          host: isLocal ? hostname() : terminal.address.split('/')[0],
          agent: terminal.status?.app ?? 'Unknown agent',
          state: 'unsupported',
          reason: isLocal ? 'This agent is not supported yet.' : 'This remote host needs its own Inbox connection.',
          asks: 0,
          attention: '',
          fresh: false,
          readOnly: id !== defaultId,
        }
        if (isLocal && terminal.status?.app === 'claude-code' && (!isClaude || !validId)) {
          entry.state = 'unavailable'
          entry.reason = !validId
            ? 'This session has not published a valid Inbox identity.'
            : 'Cannot verify that Claude is running.'
        }
        const supportedRemote = remote && verifiedAgent(terminal)
        if (remote && (!machine || machine.state !== 'connected')) {
          entry.state = 'disconnected'
          entry.reason = 'The agent host is disconnected.'
        }
        if (((isLocal && isClaude) || (supportedRemote && machine?.state === 'connected')) && validId) {
          try {
            const published = readSession(await readPublished(binding))
            if (
              published.is !== 'read' ||
              published.envelope.sessionId !== session ||
              published.envelope.terminal !== publishedTerminal(binding) ||
              published.envelope.host !== terminal.status?.app
            )
              throw new Error('The published Inbox does not match this session.')
            const current = await currentView(0, binding)
            if (!current) throw new Error('The Inbox is unavailable.')
            entry.project = basename(published.projectFolder ?? '')
            entry.agent = published.envelope.agent
            entry.state =
              terminal.status?.state === 'blocked'
                ? 'waiting'
                : current.snapshot.running || terminal.status?.state === 'working'
                  ? 'working'
                  : 'active'
            entry.asks = current.view.needsYou.count
            entry.attention = bandCounts(current.view)
              .map(c => `${c.label} ${c.count}`)
              .join(' · ')
            entry.fresh = current.snapshot.fresh
            entry.reason = ''
            entry.readOnly =
              process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2'
                ? !isLocal || !isClaude || published.envelope.remoteProtocol !== 2
                : id !== defaultId
          } catch (error) {
            entry.state = 'unavailable'
            entry.reason = error instanceof Error ? error.message : 'The Inbox could not be read.'
          }
        }
        entries.set(id, { binding, entry })
      }),
    )
    for (const [id, saved] of entries)
      if (!present.has(id)) {
        const offline =
          saved.binding.machine &&
          !machineResult.machines.some(
            m => m.name === saved.binding.machine && m.id === saved.binding.machineId && m.state === 'connected',
          )
        saved.entry = {
          ...saved.entry,
          state: offline ? 'disconnected' : 'ended',
          reason: offline ? 'The agent host is disconnected.' : 'This session ended.',
          fresh: false,
        }
      }
    let error = ''
    try {
      await saveCatalog()
    } catch {
      error = 'Session history could not be saved. Keep the helper running.'
    }
    return {
      entries: directoryEntries(),
      defaultId,
      error,
    }
  } catch {
    for (const saved of entries.values())
      saved.entry = { ...saved.entry, state: 'disconnected', fresh: false, reason: 'The agent host is disconnected.' }
    return { entries: directoryEntries(), defaultId, error: 'The agent host is disconnected.' }
  }
}

export function sessionDirectory() {
  if (!refreshing)
    refreshing = discover().finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function selectedView(id: string, since: number, viewer = ''): Promise<Result<'loadInbox'>> {
  const existing = id ? entries.get(id) : undefined
  const defaultId = existing ? id : (await sessionDirectory()).defaultId
  const saved = existing ?? entries.get(id || defaultId)
  if (!saved)
    return {
      ...emptySnapshot('This session is unavailable. Choose a session to continue.'),
      key: id,
      readOnly: true,
      connectionState: 'unavailable',
    }
  const { entry, binding } = saved
  if (entry.state !== 'active' && entry.state !== 'working' && entry.state !== 'waiting')
    return {
      ...emptySnapshot(entry.reason),
      session: entry.session,
      name: entry.name,
      key: entry.id,
      connectionState: entry.state,
      readOnly: entry.readOnly,
    }
  try {
    const current = await currentView(since, binding, false, viewer)
    if (!current) throw new Error('The Inbox is unavailable.')
    const snapshot = current.snapshot
    const readOnly =
      process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2'
        ? Boolean(binding.machine) || current.envelope.remoteProtocol !== 2
        : entry.readOnly
    const rows = (values: typeof snapshot.asks) =>
      values.map(row => ({
        ...row,
        actions: row.actions.map(action => ({ ...action, disabled: action.disabled || readOnly })),
      }))
    return {
      ...snapshot,
      asks: rows(snapshot.asks),
      findings: rows(snapshot.findings),
      key: entry.id,
      connectionState: entry.state,
      readOnly,
    }
  } catch (error) {
    return {
      ...emptySnapshot(error instanceof Error ? error.message : 'The Inbox is unavailable.'),
      session: entry.session,
      name: entry.name,
      key: entry.id,
      connectionState: entry.state,
      readOnly: entry.readOnly,
    }
  }
}

export async function selectedBinding(id: string): Promise<SessionBinding> {
  await sessionDirectory()
  const saved = entries.get(id)
  if (!saved || !['active', 'working', 'waiting'].includes(saved.entry.state))
    throw new Error('This agent session is unavailable.')
  return saved.binding
}
