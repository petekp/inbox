import { isShownSince, withListInput } from '../view/timing'
import { closedAt } from '../domain/ledger-close'
import type { RemoteViewerRecord, Session, ViewerLeases } from '../../types'

export type RemoteViewerUpdate = {
  format: 2
  kind: 'viewer'
  id: string
  session: string
  issuedAt: number
  generation: number
  sequence: number
  active: boolean
  replies: string[]
  tab: string
  shownRows: string[]
  listActive: boolean
  seenAt?: number
  visibleForMs?: number
}

/**
 * A session's viewer leases, kept apart from the saved session so a heartbeat never rewrites it. `update` runs `change`
 * on the newest leases and resolves with what it kept. A change that returns the leases it was given writes nothing.
 */
export type ViewerStore = {
  read(): Promise<ViewerLeases>
  update(change: (leases: ViewerLeases) => ViewerLeases): Promise<ViewerLeases>
}

const VIEWER_LEASE_MS = 60_000
const MAX_VIEWERS = 32

/** `leases` with `update` applied, or `leases` itself when the update is too old, too new or changes nothing. */
export function updateRemoteViewer(leases: ViewerLeases, update: RemoteViewerUpdate, now: number): ViewerLeases {
  if (update.issuedAt > now + 30_000 || now - update.issuedAt > 120_000) return leases
  const viewers = Object.fromEntries(Object.entries(leases).filter(([, viewer]) => viewer.expiresAt + 120_000 > now))
  const previous = viewers[update.id]
  const generation = previous?.generation ?? -1
  const sameGeneration = update.generation === generation
  const isOld =
    previous !== undefined &&
    (update.generation < generation || (sameGeneration && update.sequence <= previous.sequence))
  if (isOld) return leases
  const isGenerationEnded = previous !== undefined && sameGeneration && (previous.released || previous.expiresAt <= now)
  if (isGenerationEnded)
    return previous.released ? leases : { ...viewers, [update.id]: { ...previous, released: true } }
  if (!previous && Object.keys(viewers).length >= MAX_VIEWERS) throw new Error('Too many Inbox viewers are registered.')
  const sameView = sameGeneration && previous?.tab === update.tab
  const active = update.active
  const replies = Object.fromEntries(
    active ? update.replies.map(id => [id, sameGeneration ? (previous?.replies[id] ?? now) : now]) : [],
  )
  const seenAt = Math.min(now, update.seenAt ?? 0)
  const seen = active
    ? { ...(sameView ? previous?.shownRows : {}), ...Object.fromEntries(update.shownRows.map(id => [id, seenAt])) }
    : {}
  const shownRows = Object.fromEntries(
    Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 256),
  )
  const listInput =
    active && update.listActive
      ? withListInput(sameGeneration ? (previous?.listInput ?? null) : null, now)
      : sameGeneration
        ? (previous?.listInput ?? null)
        : null
  const viewer: RemoteViewerRecord = {
    generation: update.generation,
    sequence: update.sequence,
    expiresAt: active ? now + VIEWER_LEASE_MS : now,
    released: !active,
    replies,
    shownRows,
    shownSince: active ? (sameView ? (previous?.shownSince ?? now) : now) : null,
    tab: update.tab,
    listActiveAt: active && update.listActive ? now : null,
    listInput,
  }

  return { ...viewers, [update.id]: viewer }
}

/** What a lease needs to hold rows in place. A viewer receipt has it too, so a published envelope can be trimmed. */
type HoldingViewer = Pick<RemoteViewerRecord, 'released' | 'expiresAt' | 'tab' | 'shownSince' | 'replies'>

/** The rows live viewers hold in place: those they reply on, and the closed rows they have shown since their tab opened. */
export function remoteHeldRows(leases: Readonly<Record<string, HoldingViewer>>, s: Session, now: number): string[] {
  return Object.values(leases).flatMap(viewer => {
    if (viewer.released || viewer.expiresAt <= now) return []
    const closed =
      viewer.tab === 'needsYou' ? s.ledger.closed : viewer.tab === 'findings' ? s.ledger.closedFindings : []
    const viewed = closed.filter(row => isShownSince(closedAt(row), viewer.shownSince)).map(row => row.id)
    return [...Object.keys(viewer.replies), ...viewed]
  })
}

/** Whether a live viewer shows the PRs tab, so the host reads the session's PRs when they are due. */
export function isPrsTabViewed(leases: ViewerLeases, now: number): boolean {
  return Object.values(leases).some(viewer => viewer.tab === 'prs' && !viewer.released && viewer.expiresAt > now)
}

export function remoteViewerReceipts(leases: ViewerLeases) {
  return Object.fromEntries(
    Object.entries(leases).map(([id, viewer]) => [
      id,
      {
        replies: viewer.replies,
        listInput: viewer.listInput ?? null,
        shownSince: viewer.shownSince,
        tab: viewer.tab,
        generation: viewer.generation,
        sequence: viewer.sequence,
        expiresAt: viewer.expiresAt,
        released: viewer.released,
      },
    ]),
  )
}

/**
 * Viewer stores kept in process memory, one per session id, for a host where one process applies a session's viewer
 * files, prunes and publishes it. `peek` reads a session's leases without waiting. `of` gives one session's store,
 * whose `onChange` runs after each change it keeps, as a republish.
 */
export function memoryViewerStores() {
  const bySession = new Map<string, ViewerLeases>()
  const peek = (sessionId: string): ViewerLeases => bySession.get(sessionId) ?? {}

  return {
    peek,
    of: (sessionId: string, onChange: () => void): ViewerStore => ({
      read: async () => peek(sessionId),
      update: async change => {
        const before = peek(sessionId)
        const after = change(before)
        if (after === before) return before
        if (Object.keys(after).length === 0) bySession.delete(sessionId)
        else bySession.set(sessionId, after)
        onChange()
        return after
      },
    }),
  }
}
