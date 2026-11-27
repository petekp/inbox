import type { Result, Storage } from './app.contract'
import { isSnapshot, record, strings } from './client-view'

const FILE = 'app:/data/views.json'
const MAX_BYTES = 4 * 1024 * 1024
const MAX_VIEWS = 32
const admitted = new Map<string, number>()
const nextRequest = (key: string) => {
  const value = (admitted.get(key) ?? 0) + 1
  admitted.set(key, value)
  return value
}
const statusOf = (error: unknown) =>
  error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : null
const accessRefused = (error: unknown) => [401, 403].includes(statusOf(error) ?? 0)
const incompatibleHelper = (error: unknown) => [404, 405, 415].includes(statusOf(error) ?? 0)
type Saved = { origin: string; directory?: Result<'loadSessions'>; views: Result<'loadInbox'>[] }
const states = new WeakMap<Storage, { loaded: Promise<Saved>; writing: Promise<void>; saved: string }>()

function isDirectory(value: unknown): value is Result<'loadSessions'> {
  return (
    record(value) &&
    strings(value, ['defaultId', 'error']) &&
    Array.isArray(value.entries) &&
    value.entries.every(
      s =>
        record(s) &&
        strings(s, ['id', 'session', 'name', 'project', 'location', 'host', 'agent', 'state', 'reason', 'attention']) &&
        typeof s.asks === 'number' &&
        typeof s.fresh === 'boolean' &&
        typeof s.readOnly === 'boolean' &&
        typeof s.duplicate === 'boolean',
    )
  )
}

function stateFor(storage: Storage, origin: string) {
  let state = states.get(storage)
  if (!state) {
    const loaded = (async (): Promise<Saved> => {
      try {
        const bytes = await storage.fs.readFile(FILE)
        if (bytes.byteLength > MAX_BYTES) throw new Error('Oversized saved views')
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
        if (
          record(value) &&
          value.origin === origin &&
          Array.isArray(value.views) &&
          value.views.length <= MAX_VIEWS &&
          value.views.every(isSnapshot)
        )
          return { origin, views: value.views, ...(isDirectory(value.directory) ? { directory: value.directory } : {}) }
      } catch {}
      return { origin, views: [] }
    })()
    state = { loaded, writing: Promise.resolve(), saved: '' }
    states.set(storage, state)
  }
  return state
}

async function save(storage: Storage, origin: string, update: (saved: Saved) => void) {
  const state = stateFor(storage, origin)
  state.writing = state.writing
    .catch(() => {})
    .then(async () => {
      const previous = await state.loaded
      if (previous.origin !== origin) return
      const saved = { ...previous, views: [...previous.views] }
      update(saved)
      let bytes = new TextEncoder().encode(JSON.stringify(saved))
      while (bytes.byteLength > MAX_BYTES && saved.views.length > 0) {
        saved.views.pop()
        bytes = new TextEncoder().encode(JSON.stringify(saved))
      }
      if (bytes.byteLength > MAX_BYTES) return
      state.loaded = Promise.resolve(saved)
      const fingerprint = JSON.stringify({
        origin,
        directory: saved.directory,
        views: saved.views.map(view => [
          view.key,
          view.name,
          view.rowVersion,
          view.prVersion,
          view.statusVersion,
          view.foldVersion,
          view.failure,
          view.readOnly,
          view.connectionState,
          view.banners,
        ]),
      })
      if (fingerprint === state.saved) return
      await storage.fs.atomicWriteFile(FILE, bytes)
      state.saved = fingerprint
    })
  await state.writing.catch(() => {})
}

const offline = (view: Result<'loadInbox'>, reason = '', connectionState = 'disconnected'): Result<'loadInbox'> => ({
  ...view,
  connected: false,
  readOnly: true,
  running: false,
  fresh: false,
  connectionState,
  failure: `${reason || 'Can’t reach your agent.'} Showing the last loaded Inbox. Your saved replies are kept.`,
})

export async function loadCachedInbox(
  storage: Storage,
  origin: string,
  session: string,
  load: () => Promise<unknown>,
): Promise<Result<'loadInbox'>> {
  const requestKey = JSON.stringify([origin, session])
  const generation = nextRequest(requestKey)
  try {
    const value = await load()
    if (!isSnapshot(value) || value.key !== session)
      throw Object.assign(new Error('The local Inbox helper returned an invalid view.'), { status: 400 })
    if (value.connected && new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_BYTES / 2)
      await save(storage, origin, saved => {
        if (admitted.get(requestKey) === generation)
          saved.views = [value, ...saved.views.filter(v => v.key !== session)].slice(0, MAX_VIEWS)
      })
    else if (value.connectionState === 'disconnected' || value.connectionState === 'unavailable') {
      const saved = await stateFor(storage, origin).loaded
      const prior = saved.origin === origin ? saved.views.find(v => v.key === session) : undefined
      if (prior) return offline(prior, value.failure, value.connectionState)
    }
    return value
  } catch (error) {
    if (accessRefused(error)) throw error
    if (incompatibleHelper(error))
      error = Object.assign(
        new Error('The Inbox helper on your Mac is older than this app. Update the helper to reconnect.'),
        { reason: 'helper-version' },
      )
    const saved = await stateFor(storage, origin).loaded
    const prior = saved.origin === origin ? saved.views.find(v => v.key === session) : undefined
    if (prior) return offline(prior, error instanceof Error ? error.message : 'The Inbox is unavailable.')
    throw error
  }
}

export async function loadCachedDirectory(
  storage: Storage,
  origin: string,
  load: () => Promise<unknown>,
): Promise<Result<'loadSessions'>> {
  const requestKey = JSON.stringify([origin, 'directory'])
  const generation = nextRequest(requestKey)
  try {
    const value = await load()
    if (!isDirectory(value)) throw Object.assign(new Error('The session list could not be read.'), { status: 400 })
    await save(storage, origin, saved => {
      if (admitted.get(requestKey) === generation) saved.directory = value
    })
    return value
  } catch (error) {
    if (accessRefused(error)) throw error
    const saved = await stateFor(storage, origin).loaded
    if (saved.origin !== origin || !saved.directory) throw error
    return {
      ...saved.directory,
      error: 'Can’t reach your hosts. Showing the last loaded sessions.',
      entries: saved.directory.entries.map(entry => ({
        ...entry,
        fresh: false,
        readOnly: true,
        state: entry.state === 'ended' ? 'ended' : 'disconnected',
        reason: 'Host unavailable',
        attention: '',
      })),
    }
  }
}
