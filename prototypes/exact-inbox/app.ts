import { loadSavedNavigation, storeNavigation } from './client-navigation'
/// <reference path="./clipboard.d.ts" />
import { loadCachedInbox, loadCachedDirectory } from './client-cache'
import {
  loadSavedDrafts,
  readPending,
  settlePending,
  prepareSubmission,
  SubmissionRefusedError,
  storeDrafts,
  discardSavedDraft,
} from './client-recovery'
import { writeText } from '@exact/clipboard'
import { advanceMotion, advanceSelection, formatLocal, helpLegend, loadKeys, changeFolds } from './client-shared.js'
import { record, strings, isReceipt } from './client-view'
import type { Answer, Result, Sources } from './app.contract.d.ts'

const CONFIGURED_API = import.meta.env.API_BASE_URL ?? 'http://127.0.0.1:8877'
const LOCAL_ORIGINS = ['http://127.0.0.1:8877', 'http://localhost:8877']
const pageOrigin = typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : ''
const API = LOCAL_ORIGINS.includes(pageOrigin) ? pageOrigin : CONFIGURED_API
export const grants = `net.fetch ${CONFIGURED_API}\nnet.fetch http://127.0.0.1:8877\nnet.fetch http://localhost:8877\nfs.read app:/data/drafts.json\nfs.write app:/data/drafts.json\nfs.read app:/data/navigation.json\nfs.read app:/data/navigation-v2.json\nfs.write app:/data/navigation-v2.json\nfs.read app:/data/pending\nfs.write app:/data/pending\nfs.read app:/data/views.json\nfs.write app:/data/views.json`
const viewingTimes = new Map<string, number>()

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    exactTimeout: 10000,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  const value: unknown = await response.json().catch(error => {
    if (response.ok) throw error
    return null
  })
  if (!response.ok)
    throw Object.assign(
      new Error(
        record(value) && typeof value.error === 'string' ? value.error : 'The local Inbox helper refused the request.',
      ),
      { status: response.status },
    )
  return value
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
  loadKeys: () => loadKeys(),
  changeFolds: args => changeFolds(args),
  prepareLocal: async ([sequence, session, key, row, version]) => {
    const operation = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join(
      '',
    )
    try {
      const value = await request('/api/local', {
        method: 'POST',
        body: JSON.stringify({ session, key, row, version, operation }),
      })
      if (
        !record(value) ||
        value.ok !== true ||
        value.id !== operation ||
        value.session !== session ||
        value.row !== row ||
        value.version !== version ||
        !Array.isArray(value.effects) ||
        value.effects.length === 0 ||
        !value.effects.every(effect => {
          if (!record(effect) || !strings(effect, ['kind', 'value', 'name']) || typeof effect.isCommand !== 'boolean')
            return false
          if (effect.kind === 'copy') return true
          if (effect.kind !== 'open') return false
          if (/^\/api\/artifacts\/[a-f0-9]{64}$/.test(String(effect.value))) return true
          try {
            const url = new URL(String(effect.value))
            return url.protocol === 'https:' && !url.username && !url.password
          } catch {
            return false
          }
        })
      )
        throw new Error('The local action could not be read.')
      return {
        ...value,
        effects: value.effects.map(effect => ({
          ...effect,
          value:
            effect.kind === 'open' && effect.value.startsWith('/api/artifacts/')
              ? new URL(effect.value, API).href
              : effect.value,
        })),
        sequence,
      } as Result<'prepareLocal'>
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'This action could not be prepared.',
        id: operation,
        sequence,
        session,
        row,
        version,
        effects: [],
      }
    }
  },
  copyLocal: async ([sequence, index, text]) => {
    try {
      await writeText(text)
      return { sequence, index, error: '' }
    } catch {
      return { sequence, index, error: 'The device did not allow copying.' }
    }
  },
  formatLocal: args => formatLocal(args),
  advanceSelection: args => advanceSelection(args),
  advanceMotion: args => advanceMotion(args),
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
    try {
      const value = await request('/api/press', {
        method: 'POST',
        body: JSON.stringify({
          session,
          recover: true,
          operation: pending.protocol === 2 ? pending.journal : undefined,
          viewer: pending.viewer,
          key: pending.key,
          text: pending.text,
          shownSince: 0,
        }),
      })
      if (!isReceipt(value) || value.id !== pending.id) throw new Error('The saved action could not be recovered.')
    } catch {}
    return publicRecovery(pending)
  },
  forgetPending: async ([id, confirmed], _store, storage) => {
    await settlePending(storage, id, confirmed)
    return { ok: true, id, state: 'stored', error: '' }
  },
  loadHelp: async ([session]) => {
    const value = await request(`/api/help?session=${encodeURIComponent(session)}`).catch(() => helpLegend())
    if (
      !record(value) ||
      !strings(value, ['heading', 'version']) ||
      !Array.isArray(value.rows) ||
      !value.rows.every(
        row => record(row) && strings(row, ['id', 'mark', 'words', 'color']) && typeof row.running === 'boolean',
      )
    )
      throw new Error('The Help page could not be read.')
    const guide = helpLegend()
    return { ...value, keysHeading: guide.keysHeading, keys: guide.keys } as Result<'loadHelp'>
  },
  loadSessions: async ([session], _store, storage) =>
    loadCachedDirectory(storage, API, () => request(`/api/sessions?session=${encodeURIComponent(session)}`)),
  loadNavigation: (_args, _store, storage) => loadSavedNavigation(storage),
  saveNavigation: async ([selected, search, places, tab, listTop], _store, storage) => {
    await storeNavigation(storage, { selected, search, places, tab, listTop })
    return { ok: true, id: '', state: 'stored', error: '' }
  },
  loadDrafts: async (_args, _store, storage) => loadSavedDrafts(storage, () => request('/api/sessions')),
  saveDrafts: async ([drafts], _store, storage) => {
    await storeDrafts(storage, drafts)
    return { ok: true, id: '', state: 'stored', error: '' }
  },
  discardDraft: async ([id, drafts], _store, storage) => {
    await discardSavedDraft(storage, id, drafts)
    return { ok: true, id, state: 'stored', error: '' }
  },
  loadInbox: async ([session, folds, collapsed, collapses], _store, storage) => {
    const shownSince = viewingTimes.get(session) ?? 0
    const value = await loadCachedInbox(storage, API, session, () =>
      request('/api/view', {
        method: 'POST',
        body: JSON.stringify({
          schema: 2,
          session,
          since: shownSince,
          viewer: viewers.get(session)?.id ?? '',
          folds,
          collapsed,
          collapses,
        }),
      }),
    )
    if (value.connected && shownSince === 0) viewingTimes.set(session, value.serverNow)
    return value
  },
  press: async ([session, key, text, row, draft, previousId, undo], _store, storage) => {
    let prepared: Awaited<ReturnType<typeof prepareSubmission>>
    try {
      prepared = await prepareSubmission(storage, {
        session,
        key,
        text,
        row,
        draft,
        previousId,
        undo,
        viewer: viewers.get(session)?.id,
      })
    } catch (error) {
      if (!(error instanceof SubmissionRefusedError)) throw error
      return { ok: false, id: '', state: 'refused', error: error.message }
    }
    const id = prepared.kind === 'receipt' ? prepared.id : prepared.action.id
    try {
      const value =
        prepared.kind === 'receipt'
          ? await request(`/api/receipt?id=${encodeURIComponent(id)}`)
          : await request('/api/press', {
              method: 'POST',
              body: JSON.stringify({
                session: prepared.action.session,
                operation: prepared.action.protocol === 2 ? prepared.action.journal : undefined,
                viewer: prepared.action.viewer,
                key: prepared.action.key,
                text: prepared.action.text,
                shownSince: viewingTimes.get(session) ?? 0,
              }),
            })
      if (!isReceipt(value) || value.id !== id) throw new Error('The local Inbox helper returned an invalid receipt.')
      return value
    } catch {
      return { ok: false, id, state: 'unconfirmed', error: 'Delivery is not confirmed. Your reply is kept.' }
    }
  },
  loadReceipt: async ([id]) => {
    const value = await request(`/api/receipt?id=${encodeURIComponent(id)}`)
    if (!isReceipt(value)) throw new Error('The local Inbox helper returned an invalid receipt.')
    return value
  },
}

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native)
