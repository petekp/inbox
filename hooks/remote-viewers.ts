import { isShownSince, withListInput } from './timing'
import { closedAt } from './ledger-close'
import type { Session } from '../types'

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

const VIEWER_LEASE_MS = 60_000
const MAX_VIEWERS = 32

export function updateRemoteViewer<S extends Session>(s: S, update: RemoteViewerUpdate, now: number): S {
  if (update.issuedAt > now + 30_000 || now - update.issuedAt > 120_000) return s
  const viewers = Object.fromEntries(
    Object.entries(s.remoteViewers).filter(([, viewer]) => viewer.expiresAt + 120_000 > now),
  )
  const previous = viewers[update.id]
  const generation = previous?.generation ?? -1
  const sameGeneration = update.generation === generation
  const isOld = update.generation < generation || (sameGeneration && update.sequence <= previous!.sequence)
  const expiredGeneration = sameGeneration && (previous!.released || previous!.expiresAt <= now)
  if (isOld) return s
  if (expiredGeneration)
    return previous!.released
      ? s
      : {
          ...s,
          remoteViewers: { ...viewers, [update.id]: { ...previous!, released: true } },
        }
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
  return {
    ...s,
    remoteViewers: {
      ...viewers,
      [update.id]: {
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
      },
    },
  }
}

export function remoteHeldRows(s: Session, now: number): string[] {
  return Object.values(s.remoteViewers).flatMap(viewer => {
    if (viewer.released || viewer.expiresAt <= now) return []
    const closed =
      viewer.tab === 'needsYou' ? s.ledger.closed : viewer.tab === 'findings' ? s.ledger.closedFindings : []
    const viewed = closed.filter(row => isShownSince(closedAt(row), viewer.shownSince)).map(row => row.id)
    return [...Object.keys(viewer.replies), ...viewed]
  })
}

export function remoteViewerReceipts(s: Session) {
  return Object.fromEntries(
    Object.entries(s.remoteViewers).map(([id, viewer]) => [
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
