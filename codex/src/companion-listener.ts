import { createHash } from 'node:crypto'
import net from 'node:net'
import { chmod, lstat, mkdir, readFile, unlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { isSessionFile } from '../../hooks/session-files'
import { pressFile } from '../../hooks/herdr-press-file'
import type { CompanionHandler, CompanionRequest, CompanionSession } from './companion-protocol'

async function scope(dir: string): Promise<CompanionSession[]> {
  const path = join(dir, 'companion.json')
  const info = await lstat(path)
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 16384 ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    throw new Error('The companion configuration must be a private file owned by this user.')
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (
    !value ||
    typeof value !== 'object' ||
    !('enabled' in value) ||
    value.enabled !== true ||
    !('sessions' in value) ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > 64
  )
    throw new Error('The companion connection is not enabled.')
  const sessions: CompanionSession[] = []
  for (const row of value.sessions) {
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isSessionFile(`${row.id}.json`) ||
      typeof row.name !== 'string' ||
      row.name.length > 160
    )
      throw new Error('The companion session configuration is invalid.')
    sessions.push({ id: row.id, name: row.name })
  }
  return sessions
}

function parse(value: unknown): CompanionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid companion request.')
  const v = value as Record<string, unknown>
  if (v.version !== 1) throw new Error('Unsupported companion protocol.')
  const keys = Object.keys(v).sort().join(',')
  if (v.operation === 'list' && keys === 'operation,version') return { version: 1, operation: 'list' }
  if (typeof v.session !== 'string' || !isSessionFile(`${v.session}.json`))
    throw new Error('Invalid companion session.')
  if (v.operation === 'view' && keys === 'opened,operation,session,version' && typeof v.opened === 'boolean')
    return { version: 1, operation: 'view', session: v.session, opened: v.opened }
  if (v.operation === 'apply' && keys === 'file,operation,session,version') {
    const file = pressFile(JSON.stringify(v.file))
    if (file.ok && file.file.format === 2 && file.file.session === v.session)
      return { version: 1, operation: 'apply', session: v.session, file: file.file }
  }
  throw new Error('Invalid companion operation.')
}

async function liveSocket(path: string): Promise<boolean> {
  return new Promise(resolve => {
    const client = net.createConnection(path)
    const finish = (live: boolean) => {
      client.destroy()
      resolve(live)
    }
    client.once('connect', () => finish(true))
    client.once('error', () => finish(false))
    client.setTimeout(500, () => finish(true))
  })
}

export async function startCompanion(
  dir: string,
  handler: () => Promise<CompanionHandler>,
  log: (text: string) => void,
): Promise<() => Promise<void>> {
  try {
    await scope(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      log(error instanceof Error ? error.message : 'Companion configuration failed.')
    return async () => {}
  }
  const profile = createHash('sha256')
    .update(await realpath(dir))
    .digest('hex')
  const folder = join(dir, 'companion')
  await mkdir(folder, { mode: 0o700 }).catch(error => {
    if (error.code !== 'EEXIST') throw error
  })
  const folderInfo = await lstat(folder)
  if (
    !folderInfo.isDirectory() ||
    folderInfo.isSymbolicLink() ||
    folderInfo.uid !== process.getuid?.() ||
    (folderInfo.mode & 0o077) !== 0
  )
    throw new Error('The companion socket folder must be private.')
  const path = join(folder, 'bridge.sock')
  if (Buffer.byteLength(path) > 103) throw new Error('The companion socket path is too long.')
  const existing = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing) {
    if (!existing.isSocket() || existing.uid !== process.getuid?.() || (await liveSocket(path))) return async () => {}
    const current = await lstat(path)
    if (current.ino !== existing.ino) return async () => {}
    await unlink(path)
  }
  const clients = new Set<net.Socket>()
  let active = 0
  const server = net.createServer(client => {
    if (clients.size >= 8) {
      client.destroy()
      return
    }
    clients.add(client)
    const deadline = setTimeout(() => client.destroy(), 90_000)
    deadline.unref()
    client.once('close', () => {
      clearTimeout(deadline)
      clients.delete(client)
    })
    client.on('error', () => {})
    client.setTimeout(90_000, () => client.destroy())
    let input = Buffer.alloc(0),
      started = false
    client.on('data', chunk => {
      if (started) {
        client.destroy()
        return
      }
      input = Buffer.concat([input, typeof chunk === 'string' ? Buffer.from(chunk) : chunk])
      if (input.length > 65536) {
        client.destroy()
        return
      }
      const end = input.indexOf(10)
      if (end < 0) return
      started = true
      if (active >= 8) {
        client.destroy()
        return
      }
      active++
      void (async () => {
        try {
          if (
            input
              .subarray(end + 1)
              .toString()
              .trim() !== ''
          )
            throw new Error('Use one request per connection.')
          const request = parse(JSON.parse(input.subarray(0, end).toString('utf8')))
          const sessions = await scope(dir)
          if ('session' in request && !sessions.some(s => s.id === request.session))
            throw new Error('This chat is not shared with the companion.')
          const result = await (await handler())(request, sessions)
          const response = JSON.stringify({ ok: true, profile, result })
          if (Buffer.byteLength(response) > 4 * 1024 * 1024) throw new Error('The companion response is too large.')
          client.end(response + '\n')
        } catch (error) {
          client.end(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Companion request failed.' }) +
              '\n',
          )
        } finally {
          active--
        }
      })()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  server.on('error', error => log(error.message))
  await chmod(path, 0o600)
  const owned = await lstat(path)
  return async () => {
    for (const client of clients) client.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    const current = await lstat(path).catch(() => null)
    if (current?.ino === owned.ino) await unlink(path)
  }
}
