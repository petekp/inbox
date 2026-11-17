import { heartbeat } from './viewers'
import { resolve, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import { submitPress, readReceipt } from './commands'
import { sessionDirectory, selectedView } from './catalog'
import { appRoot, buildRoot, runtimeRoot } from '../tools/paths'

const saved: unknown = await readFile(resolve(runtimeRoot, 'private-connection.json'), 'utf8').then(
  text => JSON.parse(text),
  error => {
    if (error.code === 'ENOENT') return {}
    throw error
  },
)
if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid private connection settings.')
const raw = saved as Record<string, unknown>
if (raw.origin !== undefined && typeof raw.origin !== 'string') throw new Error('The private origin must be a URL.')
if (raw.user !== undefined && typeof raw.user !== 'string') throw new Error('The Tailscale owner must be a login name.')
if (raw.port !== undefined && typeof raw.port !== 'number') throw new Error('The local port must be a number.')
const settings = { origin: raw.origin, user: raw.user, port: raw.port }
const port = Number(process.env.INBOX_PORT ?? settings.port ?? 8877)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local Inbox port.')
const publicOrigin = process.env.INBOX_ORIGIN ?? settings.origin ?? `http://127.0.0.1:${port}`
const origin = new URL(publicOrigin).origin
const localOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`])
const expectedUser = process.env.INBOX_TAILSCALE_USER ?? settings.user ?? ''
const dist = resolve(process.env.INBOX_DIST ?? resolve(buildRoot, 'inbox-exact-dist'))

function authorize(request: Request) {
  const requestOrigin = request.headers.get('origin')
  const hostOrigin = new URL(request.url).origin
  const isLocal = localOrigins.has(hostOrigin)
  const isProxied =
    request.headers.has('x-forwarded-for') ||
    request.headers.has('x-forwarded-proto') ||
    request.headers.has('tailscale-user-login')
  const hasExpectedOrigin = requestOrigin === null || requestOrigin === origin || localOrigins.has(requestOrigin)
  if (!hasExpectedOrigin || request.headers.get('sec-fetch-site') === 'cross-site') return false
  if (isLocal && !isProxied) return true
  const user = request.headers.get('tailscale-user-login')
  return expectedUser !== '' && user === expectedUser
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  maxRequestBodySize: 64 * 1024,
  async fetch(request) {
    if (!authorize(request)) return json({ error: 'This device cannot access this Inbox.' }, 403)
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/sessions') return json(await sessionDirectory())
    if (request.method === 'GET' && url.pathname === '/api/view') {
      const since = Number(url.searchParams.get('since') ?? Date.now())
      const shownSince = Number.isFinite(since) ? Math.min(since, Date.now()) : Date.now()
      return json(
        await selectedView(url.searchParams.get('session') ?? '', shownSince, url.searchParams.get('viewer') ?? ''),
      )
    }
    if (request.method === 'POST' && (url.pathname === '/api/press' || url.pathname === '/api/viewer')) {
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
        return json({ error: 'Use a JSON request.' }, 415)
      const body = await request.text()
      if (body.length > 64 * 1024) return json({ error: 'The reply is too long.' }, 413)
      try {
        return json(
          await (url.pathname === '/api/viewer' ? heartbeat(JSON.parse(body)) : submitPress(JSON.parse(body))),
        )
      } catch (error) {
        return json(
          { ok: false, id: '', state: 'failed', error: error instanceof Error ? error.message : 'The press failed.' },
          400,
        )
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/receipt') {
      try {
        return json(await readReceipt(url.searchParams.get('id') ?? ''))
      } catch {
        return json(
          { ok: false, id: '', state: 'unconfirmed', error: 'The receipt could not be read. Your reply is kept.' },
          404,
        )
      }
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const file = resolve(dist, relative)
    if (!file.startsWith(dist + sep)) return json({ error: 'Not found.' }, 404)
    const asset = Bun.file(file)
    if (await asset.exists()) return new Response(asset)
    const index = Bun.file(resolve(dist, 'index.html'))
    return (await index.exists())
      ? new Response(index)
      : new Response('Build the Exact web app before opening Inbox.', { status: 503 })
  },
})

console.log(`Inbox is listening at http://127.0.0.1:${server.port}`)
console.log(`Client origin: ${origin}`)
console.log(`App sources: ${appRoot}`)
