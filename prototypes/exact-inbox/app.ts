import {
  readPending,
  settlePending,
  keepPending,
  recoverDrafts,
  storeDrafts,
  discardPendingDraft,
} from './client-recovery'
import type { Answer, Result, Sources } from './app.contract.d.ts'

const API = import.meta.env.API_BASE_URL ?? 'http://127.0.0.1:8877'
export const grants = `net.fetch ${API}\nfs.read app:/data/drafts.json\nfs.write app:/data/drafts.json\nfs.read app:/data/navigation.json\nfs.write app:/data/navigation.json\nfs.read app:/data/pending\nfs.write app:/data/pending`
const NAVIGATION = 'app:/data/navigation.json'
const DRAFTS = 'app:/data/drafts.json'
const viewingTimes = new Map<string, number>()

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: Record<string, unknown>, names: string[]) =>
  names.every(name => typeof value[name] === 'string')

function isButton(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['key', 'label', 'reason']) &&
    ['primary', 'disabled', 'input'].every(key => typeof value[key] === 'boolean')
  )
}

function isRow(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'kind', 'title', 'detail', 'context', 'recommendation', 'feedback', 'state', 'mark']) &&
    Array.isArray(value.actions) &&
    value.actions.every(isButton)
  )
}

function isSnapshot(value: unknown): value is Result<'loadInbox'> {
  if (
    !record(value) ||
    !strings(value, [
      'connectionState',
      'key',
      'session',
      'name',
      'failure',
      'statusError',
      'statusTitle',
      'statusDetail',
    ])
  )
    return false
  if (!['connected', 'running', 'fresh', 'readOnly'].every(key => typeof value[key] === 'boolean')) return false
  if (
    !['updatedAt', 'serverNow', 'questionCount', 'taskCount'].every(
      key => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  )
    return false
  if (!Array.isArray(value.asks) || !value.asks.every(isRow)) return false
  if (!Array.isArray(value.findings) || !value.findings.every(isRow)) return false
  return (
    Array.isArray(value.statusRows) &&
    value.statusRows.every(
      row => record(row) && strings(row, ['id', 'title', 'detail', 'mark']) && typeof row.depth === 'number',
    )
  )
}

function isReceipt(value: unknown): value is Result<'press'> {
  return record(value) && strings(value, ['id', 'state', 'error']) && typeof value.ok === 'boolean'
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    exactTimeout: 10000,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  if (!response.ok) throw new Error('The local Inbox helper refused the request.')
  return response.json()
}

type Viewer = {
  id: string
  generation: number
  sequence: number
  active: boolean
  tab: string
  startedAt: number
  shownRows: string[]
  seenAt: number
}
const viewers = new Map<string, Viewer>()
let viewerId = ''

const sources: Sources = {
  heartbeat: async ([session, active, tab, replies, shownRows, seenAt, clientNow, listActive]) => {
    const hostTab = tab === 'status' ? 'overview' : tab === 'asks' || tab === 'sessions' ? 'needsYou' : tab
    for (const [previousSession, previous] of viewers) {
      const leaving = previous.active && (previousSession !== session || previous.tab !== hostTab || !active)
      if (!leaving) continue
      previous.active = false
      previous.sequence += 1
      await request('/api/viewer', {
        method: 'POST',
        body: JSON.stringify({
          session: previousSession,
          id: previous.id,
          generation: previous.generation,
          sequence: previous.sequence,
          active: false,
          replies: [],
          shownRows: previous.shownRows,
          seenAt: previous.seenAt,
          tab: previous.tab,
          listActive: false,
          visibleForMs: Math.max(0, clientNow - previous.startedAt),
        }),
      }).catch(() => undefined)
    }
    if (!viewerId)
      viewerId = `viewer-${Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')}`
    let viewer = viewers.get(session)
    if (!viewer) {
      viewer = {
        id: viewerId,
        generation: 0,
        sequence: 0,
        active: false,
        tab: hostTab,
        startedAt: clientNow,
        shownRows: [],
        seenAt: 0,
      }
      viewers.set(session, viewer)
    }
    if (active && !viewer.active) {
      viewer.generation += 1
      viewer.startedAt = clientNow
    }
    viewer.active = active
    viewer.tab = hostTab
    viewer.shownRows = shownRows
    viewer.seenAt = seenAt
    viewer.sequence += 1
    const result = await request('/api/viewer', {
      method: 'POST',
      body: JSON.stringify({
        session,
        id: viewer.id,
        generation: viewer.generation,
        sequence: viewer.sequence,
        active,
        replies,
        tab: hostTab,
        shownRows: hostTab === 'overview' ? shownRows : [],
        seenAt,
        visibleForMs: Math.max(0, clientNow - viewer.startedAt),
        listActive,
      }),
    })
    if (
      !record(result) ||
      typeof result.enabled !== 'boolean' ||
      typeof result.released !== 'boolean' ||
      !['generation', 'sequence', 'expiresAt', 'hostNow'].every(k => typeof result[k] === 'number')
    )
      throw new Error('The viewer acknowledgment could not be read.')
    if (
      result.enabled &&
      result.generation === viewer.generation &&
      (result.released || Number(result.expiresAt) <= Number(result.hostNow))
    )
      viewer.active = false
    return {
      enabled: result.enabled,
      generation: Number(result.generation),
      sequence: Number(result.sequence),
      expiresAt: Number(result.expiresAt),
      hostNow: Number(result.hostNow),
      released: result.released,
    }
  },
  loadRecovery: async ([session], _store, storage) => {
    const kept = await readPending(storage)
    const pending = kept.filter(p => p.session === session).at(-1)
    if (!pending) return { id: '', session, key: '', row: '', draft: '', text: '' }
    const publicRecovery = (p: typeof pending) => ({
      id: p.id,
      session: p.session,
      key: p.key,
      row: p.row,
      draft: p.draft,
      text: p.text,
    })
    if (pending.id) return publicRecovery(pending)
    const value = await request('/api/press', {
      method: 'POST',
      body: JSON.stringify({
        session,
        operation: pending.protocol === 2 ? pending.journal : undefined,
        viewer: pending.viewer,
        key: pending.key,
        text: pending.text,
        shownSince: 0,
      }),
    })
    if (!isReceipt(value) || !value.id) throw new Error('The saved action could not be recovered.')
    const recovered = { ...pending, id: value.id, receipt: value }
    await keepPending(storage, recovered)
    return publicRecovery(recovered)
  },
  forgetPending: async ([id, confirmed], _store, storage) => {
    await settlePending(storage, id, confirmed)
    return { ok: true, id, state: 'stored', error: '' }
  },
  loadSessions: async () => {
    const value = await request('/api/sessions')
    if (
      !record(value) ||
      !strings(value, ['defaultId', 'error']) ||
      !Array.isArray(value.entries) ||
      !value.entries.every(
        s =>
          record(s) &&
          strings(s, [
            'id',
            'session',
            'name',
            'project',
            'location',
            'host',
            'agent',
            'state',
            'reason',
            'attention',
          ]) &&
          typeof s.asks === 'number' &&
          typeof s.fresh === 'boolean' &&
          typeof s.readOnly === 'boolean' &&
          typeof s.duplicate === 'boolean',
      )
    )
      throw new Error('The session list could not be read.')
    return value as Result<'loadSessions'>
  },
  loadNavigation: async (_args, _store, storage) => {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(await storage.fs.readFile(NAVIGATION)))
      if (
        !record(value) ||
        !strings(value, ['selected', 'search']) ||
        !Array.isArray(value.places) ||
        !value.places.every(
          p =>
            record(p) &&
            strings(p, ['id', 'name', 'tab', 'asksExpanded', 'findsExpanded', 'reply']) &&
            ['asksTop', 'findsTop', 'statusTop'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])),
        )
      )
        throw new Error('Saved navigation could not be read.')
      return {
        ...value,
        listTop: typeof value.listTop === 'number' && Number.isFinite(value.listTop) ? value.listTop : 0,
        tab: typeof value.tab === 'string' ? value.tab : 'sessions',
      } as Result<'loadNavigation'>
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT')
        return { selected: '', search: '', places: [], tab: 'sessions', listTop: 0 }
      throw error
    }
  },
  saveNavigation: async ([selected, search, places, tab, listTop], _store, storage) => {
    await storage.fs.atomicWriteFile(
      NAVIGATION,
      new TextEncoder().encode(JSON.stringify({ selected, search, places, tab, listTop })),
    )
    return { ok: true, id: '', state: 'stored', error: '' }
  },
  loadDrafts: async (_args, _store, storage) => {
    try {
      const bytes = await storage.fs.readFile(DRAFTS)
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (
        !Array.isArray(value) ||
        !value.every(d => record(d) && strings(d, ['id', 'row', 'session', 'title', 'key', 'text']))
      )
        throw new Error('Saved replies could not be read.')
      const drafts = await recoverDrafts(storage, value as Result<'loadDrafts'>)
      const legacy = drafts.filter(d => !/^[a-f0-9]{64}$/.test(d.session))
      if (!legacy.length) return drafts
      const directory = await request('/api/sessions')
      if (!record(directory) || !Array.isArray(directory.entries))
        throw new Error('Saved replies could not be matched to their sessions.')
      const entries = directory.entries
      const upgraded = drafts.map(d => {
        if (/^[a-f0-9]{64}$/.test(d.session)) return d
        const matches = entries.filter(
          (e: unknown) => record(e) && e.session === d.session && e.id === directory.defaultId,
        )
        if (matches.length !== 1 || typeof matches[0].id !== 'string') return d
        return { ...d, session: matches[0].id, id: `${matches[0].id}:${d.row}` }
      })
      await storage.fs.atomicWriteFile(DRAFTS, new TextEncoder().encode(JSON.stringify(upgraded)))
      return upgraded
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return recoverDrafts(storage, [])
      throw error
    }
  },
  saveDrafts: async ([drafts], _store, storage) => {
    await storeDrafts(storage, drafts)
    return { ok: true, id: '', state: 'stored', error: '' }
  },
  discardDraft: async ([id], _store, storage) => {
    await discardPendingDraft(storage, id)
    return { ok: true, id, state: 'stored', error: '' }
  },
  loadInbox: async ([session]) => {
    const shownSince = viewingTimes.get(session) ?? 0
    const value = await request(
      `/api/view?session=${encodeURIComponent(session)}&since=${shownSince}&viewer=${encodeURIComponent(viewers.get(session)?.id ?? '')}`,
    )
    if (!isSnapshot(value)) throw new Error('The local Inbox helper returned an invalid view.')
    if (shownSince === 0) viewingTimes.set(session, value.serverNow)
    return value
  },
  press: async ([session, key, text, row, draft], _store, storage) => {
    const existing = (await readPending(storage)).find(p => p.session === session && p.key === key && p.text === text)
    const pending =
      existing ??
      (await keepPending(storage, {
        protocol: 2,
        session,
        key,
        text,
        row,
        draft,
        id: '',
        viewer: viewers.get(session)?.id,
      }))
    const value = await request('/api/press', {
      method: 'POST',
      body: JSON.stringify({
        session,
        operation: pending.protocol === 2 ? pending.journal : undefined,
        viewer: pending.viewer,
        key,
        text,
        shownSince: viewingTimes.get(session) ?? 0,
      }),
    })
    if (!isReceipt(value)) throw new Error('The local Inbox helper returned an invalid receipt.')
    await keepPending(storage, { ...pending, id: value.id, receipt: value })
    return value
  },
  loadReceipt: async ([id], _store, storage) => {
    const saved = (await readPending(storage)).find(p => p.id === id)?.receipt
    if (saved && ['stale', 'failed', 'refused', 'cancelled', 'expired'].includes(saved.state)) return saved
    const value = await request(`/api/receipt?id=${encodeURIComponent(id)}`)
    if (!isReceipt(value)) throw new Error('The local Inbox helper returned an invalid receipt.')
    return value
  },
}

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native)
