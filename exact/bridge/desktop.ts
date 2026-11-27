import net from 'node:net'
import { createHash } from 'node:crypto'
import { lstat, readFile, writeFile, rename } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { hostname } from 'node:os'
import { runtimeRoot } from '../tools/paths'
import { projectInbox } from './inbox-projection'
import { NO_HOLDS } from '../../core/view/timing'
import { isSessionFile } from '../../core/view/session-files'
import type { CompanionRequest, CompanionView } from '../../core/remote/companion-protocol'
import type { ViewPreferences } from './collapse-view'
import type { CurrentView } from './view'
import type { Result } from '../app.contract'

export type DesktopBinding = { source: 'codex'; socket: string; profile: string; session: string }
type Endpoint = { socket: string; profile: string; name: string }
type Entry = Result<'loadSessions'>['entries'][number]
const entries = new Map<string, { binding: DesktopBinding; entry: Entry }>()
const catalogFile = resolve(runtimeRoot, 'desktop-catalog.json')
let restored = false
let persisted = ''
let listing: Promise<{ entries: Entry[]; error: string }> | null = null
const keyOf = (binding: DesktopBinding) => createHash('sha256').update(JSON.stringify(binding)).digest('hex')

async function endpoints(): Promise<Endpoint[]> {
  const file = resolve(runtimeRoot, 'desktop-hosts.json')
  const info = await lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!info) return []
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 16384 ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    throw new Error('Desktop connections must be configured in a private file.')
  const values: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (
    !Array.isArray(values) ||
    values.length > 8 ||
    !values.every(
      v =>
        v &&
        typeof v.socket === 'string' &&
        isAbsolute(v.socket) &&
        typeof v.profile === 'string' &&
        /^[a-f0-9]{64}$/.test(v.profile) &&
        typeof v.name === 'string' &&
        v.name.length <= 160,
    )
  )
    throw new Error('Invalid desktop connection settings.')
  return values
}

export async function desktopRequest(
  binding: Pick<DesktopBinding, 'socket' | 'profile'>,
  request: CompanionRequest,
): Promise<unknown> {
  const configured = (await endpoints()).some(
    endpoint => endpoint.socket === binding.socket && endpoint.profile === binding.profile,
  )
  if (!configured) throw new Error('This desktop connection is no longer configured.')
  const info = await lstat(binding.socket)
  if (!info.isSocket() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
    throw new Error('The desktop connection is not private.')
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(binding.socket)
    let bytes = Buffer.alloc(0),
      settled = false
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    const deadline = setTimeout(
      () => finish(new Error('The desktop host did not answer.')),
      request.operation === 'apply' ? 90_000 : request.operation === 'list' ? 3000 : 10000,
    )
    socket.once('connect', () => socket.write(JSON.stringify(request) + '\n'))
    socket.once('error', error => finish(error))
    socket.once('end', () => {
      if (!settled) finish(new Error('The desktop host closed without an answer.'))
    })
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, typeof chunk === 'string' ? Buffer.from(chunk) : chunk])
      if (bytes.length > 4 * 1024 * 1024 + 1024) return finish(new Error('The desktop response is too large.'))
      const end = bytes.indexOf(10)
      if (end < 0) return
      try {
        const response = JSON.parse(bytes.subarray(0, end).toString('utf8'))
        if (!response || response.ok !== true)
          throw new Error(
            typeof response?.error === 'string' ? response.error : 'The desktop host refused the request.',
          )
        if (response.profile !== binding.profile) throw new Error('The desktop host identity changed.')
        finish(null, response.result)
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid desktop response.'))
      }
    })
  })
}

async function discoverDesktop(): Promise<{ entries: Entry[]; error: string }> {
  const hosts = await endpoints()
  if (!restored) {
    restored = true
    try {
      const raw = await readFile(catalogFile, 'utf8')
      if (Buffer.byteLength(raw) > 512 * 1024) throw new Error('Oversized session history')
      const values: unknown = JSON.parse(raw)
      if (Array.isArray(values))
        for (const value of values.slice(0, 512)) {
          const binding = value?.binding,
            entry = value?.entry
          if (
            !binding ||
            binding.source !== 'codex' ||
            !hosts.some(host => host.socket === binding.socket && host.profile === binding.profile) ||
            typeof binding.session !== 'string' ||
            !isSessionFile(`${binding.session}.json`) ||
            !entry ||
            entry.id !== keyOf(binding) ||
            entry.session !== binding.session ||
            !['name', 'project', 'location', 'host', 'agent', 'attention'].every(key => typeof entry[key] === 'string')
          )
            continue
          entries.set(entry.id, {
            binding,
            entry: {
              ...entry,
              state: 'disconnected',
              reason: 'The desktop host is disconnected.',
              fresh: false,
              readOnly: true,
              duplicate: false,
              asks: Number.isSafeInteger(entry.asks) ? entry.asks : 0,
            },
          })
        }
    } catch {}
  }
  for (const [key, value] of entries)
    if (!hosts.some(host => host.socket === value.binding.socket && host.profile === value.binding.profile))
      entries.delete(key)
  const failures: string[] = []
  await Promise.all(
    hosts.map(async host => {
      try {
        const response = (await desktopRequest(host, { version: 1, operation: 'list' })) as {
          version?: number
          sessions?: unknown
        }
        if (response.version !== 1 || !Array.isArray(response.sessions))
          throw new Error('Invalid desktop session list.')
        const present = new Set<string>()
        for (const row of response.sessions) {
          if (
            !row ||
            typeof row.id !== 'string' ||
            !isSessionFile(`${row.id}.json`) ||
            typeof row.name !== 'string' ||
            typeof row.project !== 'string' ||
            typeof row.working !== 'boolean' ||
            typeof row.available !== 'boolean' ||
            typeof row.fresh !== 'boolean' ||
            typeof row.error !== 'string' ||
            !['asks', 'findings', 'prs'].every(key => typeof row[key] === 'number')
          )
            throw new Error('Invalid desktop session.')
          const binding: DesktopBinding = {
            source: 'codex',
            socket: host.socket,
            profile: host.profile,
            session: row.id,
          }
          const id = keyOf(binding)
          present.add(id)
          if (!row.available) {
            const previous = entries.get(id)?.entry
            entries.set(id, {
              binding,
              entry: {
                id,
                session: row.id,
                name: row.name,
                project: previous?.project ?? '',
                location: previous?.location ?? '',
                host: host.name || hostname(),
                agent: 'Codex',
                state: 'unavailable',
                reason: row.error,
                asks: previous?.asks ?? 0,
                attention: previous?.attention ?? '',
                fresh: false,
                readOnly: true,
                duplicate: false,
              },
            })
            continue
          }
          entries.set(id, {
            binding,
            entry: {
              id,
              session: row.id,
              name: row.name,
              project: basename(row.project),
              location: row.project,
              host: host.name || hostname(),
              agent: 'Codex',
              state: row.working ? 'working' : 'active',
              reason: '',
              asks: row.asks,
              attention: [
                row.asks ? `Asks ${row.asks}` : '',
                row.findings ? `Finds ${row.findings}` : '',
                row.prs ? `PRs ${row.prs}` : '',
              ]
                .filter(Boolean)
                .join(' · '),
              fresh: row.fresh,
              readOnly: process.env.INBOX_EXPERIMENTAL_PROTOCOL !== '2',
              duplicate: false,
            },
          })
        }
        for (const [id, value] of entries)
          if (value.binding.profile === host.profile && !present.has(id))
            value.entry = {
              ...value.entry,
              state: 'ended',
              reason: 'This chat is no longer shared.',
              readOnly: true,
              fresh: false,
            }
      } catch {
        failures.push(`${host.name || 'Codex'} is disconnected.`)
        for (const value of entries.values())
          if (value.binding.profile === host.profile)
            value.entry = {
              ...value.entry,
              state: 'disconnected',
              reason: 'The desktop host is disconnected.',
              readOnly: true,
              fresh: false,
            }
      }
    }),
  )
  const saved = JSON.stringify([...entries.values()])
  if (saved !== persisted && Buffer.byteLength(saved) <= 512 * 1024) {
    try {
      await writeFile(catalogFile + '.tmp', saved, { mode: 0o600 })
      await rename(catalogFile + '.tmp', catalogFile)
      persisted = saved
    } catch {
      failures.push('Desktop session history could not be saved.')
    }
  }
  return { entries: [...entries.values()].map(value => value.entry), error: failures.join(' ') }
}

export function desktopDirectory() {
  listing ??= discoverDesktop().finally(() => {
    listing = null
  })
  return listing
}

export function desktopEntry(id: string): Entry | undefined {
  return entries.get(id)?.entry
}

export async function desktopBinding(id: string): Promise<DesktopBinding | null> {
  if (!entries.has(id)) await desktopDirectory()
  return entries.get(id)?.binding ?? null
}

export async function desktopView(
  binding: DesktopBinding,
  shownSince: number,
  viewerId: string,
  preferences: ViewPreferences,
  opened: boolean,
): Promise<CurrentView> {
  const read = (await desktopRequest(binding, {
    version: 1,
    operation: 'view',
    session: binding.session,
    opened,
  })) as CompanionView
  if (
    !read ||
    read.sessionId !== binding.session ||
    !read.session ||
    typeof read.serverNow !== 'number' ||
    typeof read.writtenAt !== 'number' ||
    !Array.isArray(read.remoteActions) ||
    !Array.isArray(read.warnings)
  )
    throw new Error('The desktop Inbox could not be read.')
  const viewer = read.viewers?.[viewerId]
  const active = viewer && !viewer.released && viewer.expiresAt > read.serverNow
  const holds = active
    ? { ...NO_HOLDS, replies: viewer.replies, shownSince: viewer.shownSince, listInput: viewer.listInput }
    : { ...NO_HOLDS, shownSince }
  const durable = process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2'
  const projected = await projectInbox(
    keyOf(binding),
    read.session,
    {
      sessionId: read.sessionId,
      agent: 'Codex',
      name: read.name,
      connected: true,
      waiting: false,
      writtenAt: read.writtenAt,
      fetching: read.isFetchingPrs,
      reliable: true,
      canPublish: true,
      durable,
      actions: durable ? read.remoteActions : [],
    },
    read.serverNow,
    holds,
    preferences,
  )
  projected.snapshot.failure = read.warnings.join(' ')
  projected.snapshot.fresh = projected.snapshot.fresh && read.warnings.length === 0
  return {
    ...projected,
    binding,
    projectFolder: read.projectFolder,
    canPublish: durable,
    envelope: {
      host: 'codex',
      agent: 'Codex',
      sessionId: read.sessionId,
      writtenAt: read.writtenAt,
      version: read.version,
      remoteProtocol: 2,
      remoteActions: read.remoteActions,
      receipts: read.receipts,
      viewers: read.viewers,
      remoteHistoryAfter: read.remoteHistoryAfter,
    },
  }
}
