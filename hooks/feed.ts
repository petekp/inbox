import type { Finding, Ledger } from '../types'
import { closeFinding } from './ledger-close'

export type FeedEntry = {
  key: string
  state: 'working' | 'blocked' | 'done'
  title: string
  detail: string
  at: number
  kind?: 'work' | 'task'
  owner?: { machine: string; agent: string }
  signalKey?: string
}
type FeedWarning = { key: string; title: string; detail: string; at: number }
export type Feed = { version: 1; source: string; writtenAt: number; entries: FeedEntry[]; warnings?: FeedWarning[] }
export type FeedFile = { path: string; feed: Feed | null | undefined }

export const FEED_TTL_MS = 6 * 60 * 60 * 1000
export const FEED_POLL_MS = 30_000
export const MAX_FEED_FILE_BYTES = 256 * 1024

export function parseFeed(text: string): Feed | null {
  try {
    const feed: unknown = JSON.parse(text)
    if (!feed || typeof feed !== 'object') return null
    const f = feed as Record<string, unknown>
    if (
      f.version !== 1 ||
      !validSource(f.source) ||
      !validTime(f.writtenAt) ||
      !Array.isArray(f.entries) ||
      (f.warnings !== undefined && !Array.isArray(f.warnings))
    )
      return null
    if (f.entries.length > 40) return null
    const keys = new Set<string>()
    const entries: FeedEntry[] = []
    for (const value of f.entries) {
      if (!value || typeof value !== 'object') return null
      const e = value as Record<string, unknown>
      if (
        typeof e.key !== 'string' ||
        e.key.length === 0 ||
        e.key.length > 100 ||
        keys.has(e.key) ||
        !['working', 'blocked', 'done'].includes(e.state as string) ||
        typeof e.title !== 'string' ||
        e.title.length === 0 ||
        typeof e.detail !== 'string' ||
        !validTime(e.at) ||
        (e.kind !== undefined && !['work', 'task'].includes(e.kind as string)) ||
        (e.owner !== undefined && !validOwner(e.owner)) ||
        (e.signalKey !== undefined &&
          (typeof e.signalKey !== 'string' || e.signalKey.length === 0 || e.signalKey.length > 100))
      )
        return null
      if (f.source === 'meta-open-items' && (e.kind === undefined || e.owner === undefined)) return null
      keys.add(e.key)
      entries.push({ ...e, title: e.title.slice(0, 120), detail: e.detail.slice(0, 600) } as FeedEntry)
    }

    const warningKeys = new Set<string>()
    const warnings: FeedWarning[] = []
    for (const value of (f.warnings as unknown[] | undefined) ?? []) {
      if (!value || typeof value !== 'object') return null
      const w = value as Record<string, unknown>
      if (
        typeof w.key !== 'string' ||
        w.key.length === 0 ||
        w.key.length > 100 ||
        warningKeys.has(w.key) ||
        typeof w.title !== 'string' ||
        w.title.length === 0 ||
        typeof w.detail !== 'string' ||
        !validTime(w.at)
      )
        return null
      warningKeys.add(w.key)
      warnings.push({ key: w.key, title: w.title.slice(0, 120), detail: w.detail.slice(0, 600), at: w.at })
    }
    if (warnings.length > 40) return null

    return { version: 1, source: f.source, writtenAt: f.writtenAt, entries, warnings }
  } catch {
    return null
  }
}

const validTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
const validSource = (s: unknown): s is string => typeof s === 'string' && s.length > 0
const validOwner = (value: unknown): value is { machine: string; agent: string } => {
  if (!value || typeof value !== 'object') return false
  const owner = value as Record<string, unknown>
  return (
    validSource(owner.machine) && validSource(owner.agent) && owner.machine.length <= 80 && owner.agent.length <= 80
  )
}

export function applyFeed(ledger: Ledger, feed: Feed, now: number, source = ''): Ledger {
  if (feed.source === 'meta-open-items') return applyMetaOpenItems(ledger, feed, now, source)
  const keys = new Set(feed.entries.map(e => e.key))
  // Older versions could overwrite a hand finding's feedKey/feedSource while
  // matching by title. Treat those unmarked saved rows as hand findings.
  const owns = (f: Finding) => f.feedOwned === true && f.feedKey !== undefined && f.feedSource === source
  const staleClosed = ledger.closedFindings.some(f => owns(f) && !keys.has(f.feedKey!))
  let next = staleClosed
    ? {
        ...ledger,
        closedFindings: ledger.closedFindings.map(f =>
          owns(f) && !keys.has(f.feedKey!) ? { ...f, feedKey: undefined, feedSource: undefined } : f,
        ),
      }
    : ledger

  for (const entry of feed.entries) {
    let finding = next.findings.find(f => owns(f) && f.feedKey === entry.key)
    const isClosed = next.closedFindings.some(f => owns(f) && f.feedKey === entry.key)
    if (!finding && (entry.state === 'done' || isClosed || now - entry.at >= FEED_TTL_MS)) continue
    const updated: Finding = {
      ...finding,
      id: finding?.id ?? `f${next.nextId}`,
      kind: 'progress',
      title: entry.title,
      detail: detailOf(entry),
      path: null,
      at: entry.at,
      feedKey: entry.key,
      feedSource: source,
      feedOwned: true,
    }
    if (!finding) next = { ...next, findings: [...next.findings, updated], nextId: next.nextId + 1 }
    else if (
      finding.kind !== updated.kind ||
      finding.title !== updated.title ||
      finding.detail !== updated.detail ||
      finding.path !== updated.path ||
      finding.at !== updated.at ||
      finding.feedKey !== updated.feedKey ||
      finding.feedSource !== updated.feedSource
    )
      next = { ...next, findings: next.findings.map(f => (f.id === finding!.id ? updated : f)) }
    if (entry.state === 'done')
      next = closeFinding(next, updated.id, { how: 'update', outcome: `done: ${entry.detail}` }, now)
  }

  for (const finding of next.findings)
    if (owns(finding) && !keys.has(finding.feedKey!))
      next = closeFinding(next, finding.id, { how: 'update', outcome: 'done: no longer reported' }, now)

  return next
}

export function applyFeedFiles(ledger: Ledger, root: string, files: FeedFile[], now: number): Ledger {
  const present = new Set(files.map(f => f.path))
  const sources = new Set(
    [...ledger.findings, ...ledger.closedFindings, ...ledger.items].map(f => f.feedSource).filter(Boolean),
  )
  let next = ledger
  for (const source of sources)
    if (
      sourceUnder(source!, root) &&
      !present.has(source!) &&
      !next.findings.some(f => f.feedSource === source && f.sourceManaged) &&
      !next.items.some(i => i.feedSource === source && i.sourceManaged)
    )
      next = applyFeed(next, emptyFeed, now, source)
  for (const file of files) if (file.feed) next = applyFeed(next, file.feed, now, file.path)
  const validPaths = new Set(files.filter(file => file.feed).map(file => file.path))
  const carriedWarnings = (next.untrackedWork ?? []).filter(
    w => !sourceUnder(w.feedSource, root) || (present.has(w.feedSource) && !validPaths.has(w.feedSource)),
  )
  const currentWarnings = files.flatMap(file =>
    file.feed ? (file.feed.warnings ?? []).map(w => ({ ...w, feedSource: file.path })) : [],
  )
  const untrackedWork = [...carriedWarnings, ...currentWarnings]
  if (JSON.stringify(untrackedWork) !== JSON.stringify(next.untrackedWork ?? [])) next = { ...next, untrackedWork }
  for (const finding of next.findings)
    if (
      finding.feedOwned === true &&
      !finding.sourceManaged &&
      finding.feedKey &&
      finding.feedSource &&
      now - finding.at >= FEED_TTL_MS
    )
      next = closeFinding(next, finding.id, { how: 'update', outcome: 'done: feed entry expired' }, now)
  return next
}

function applyMetaOpenItems(ledger: Ledger, feed: Feed, now: number, source: string): Ledger {
  const tasks = new Map(
    feed.entries.filter(entry => entry.kind === 'task' && entry.state !== 'done').map(entry => [entry.key, entry]),
  )
  const work = new Map(
    feed.entries.filter(entry => entry.kind !== 'task' && entry.state !== 'done').map(entry => [entry.key, entry]),
  )
  let next = ledger
  for (const item of next.items)
    if (item.sourceManaged && item.feedSource === source && !tasks.has(item.feedKey ?? ''))
      next = { ...next, items: next.items.filter(i => i.id !== item.id) }

  for (const entry of tasks.values()) {
    const existing = next.items.find(i => i.sourceManaged && i.feedSource === source && i.feedKey === entry.key)
    const updated = {
      ...existing,
      id: existing?.id ?? `i${next.nextId}`,
      kind: 'task' as const,
      label: null,
      ask: entry.title,
      detail: entry.detail,
      options: [],
      rec: null,
      helps: [],
      turn: 0,
      at: entry.at,
      from: 'record' as const,
      sourceManaged: true as const,
      feedKey: entry.key,
      feedSource: source,
    }
    if (!existing) next = { ...next, items: [...next.items, updated], nextId: next.nextId + 1 }
    else if (existing.ask !== updated.ask || existing.detail !== updated.detail || existing.at !== updated.at)
      next = { ...next, items: next.items.map(i => (i.id === existing.id ? updated : i)) }
  }
  for (const entry of work.values()) {
    const current = next.findings.find(f => f.sourceManaged && f.feedSource === source && f.feedKey === entry.key)
    const updated = {
      ...current,
      id: current?.id ?? `f${next.nextId}`,
      kind: 'progress' as const,
      title: entry.title,
      detail: detailOf(entry),
      path: null,
      at: entry.at,
      feedKey: entry.key,
      feedSource: source,
      feedOwned: true as const,
      sourceManaged: true as const,
    }
    if (!current) next = { ...next, findings: [...next.findings, updated], nextId: next.nextId + 1 }
    else if (current.title !== updated.title || current.detail !== updated.detail || current.at !== updated.at)
      next = { ...next, findings: next.findings.map(f => (f.id === current.id ? updated : f)) }
  }
  for (const finding of next.findings)
    if (finding.sourceManaged && finding.feedSource === source && !work.has(finding.feedKey ?? ''))
      next = closeFinding(next, finding.id, { how: 'update', outcome: 'done: no longer reported' }, now)
  return next
}

const emptyFeed: Feed = { version: 1, source: '', writtenAt: 0, entries: [] }
const sourceUnder = (source: string, root: string) => {
  const base = root.replace(/[\\/]+$/, '')
  return source === base || source.startsWith(`${base}/`) || source.startsWith(`${base}\\`)
}

const detailOf = (entry: FeedEntry) => (entry.state === 'blocked' ? `Blocked: ${entry.detail}` : entry.detail)
