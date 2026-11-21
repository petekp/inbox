import type { Session } from '../../types'
import { answerIndex, bestEarlier, earlierOf, rankedEarlier } from '../domain/earlier-answers'
import type { AnswerDoc, AnswerIndex } from '../domain/earlier-answers'
import {
  answerKey,
  historyDocs,
  historyFileName,
  historyStart,
  isEarlierShown,
  isHistoryChanged,
  questionHistory,
  ROW_MEASUREMENT_MS,
  upgradeHistoryFile,
} from '../domain/question-history'
import type { HistoryFile, HistoryHost } from '../domain/question-history'

/**
 * The file calls the question history makes, which each host supplies: the mod through `$.fs`, Codex and omp through
 * `node:fs`. `list` answers [] for a missing folder, `read` rejects for a missing file, and `write` makes the folders
 * it needs and replaces the whole file.
 */
export type HistoryFs = {
  list: (folder: string) => Promise<{ name: string; mtimeMs: number }[]>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

/** A host's way into the history. `keptSessions` gives the sessions the host keeps, which seed its first files. */
export type HistoryPlace = {
  fs: HistoryFs
  folder: string
  host: HistoryHost
  keptSessions: () => Promise<{ id: string; session: Session }[]>
}

type Cache = {
  files: Map<string, { mtimeMs: number; file: HistoryFile | null }>
  index: { said: string; index: AnswerIndex } | null
  isSeeded: boolean
}

const caches = new Map<string, Cache>()
const repos = new Map<string, Promise<string | null>>()

function cacheOf(folder: string): Cache {
  const known = caches.get(folder)
  if (known) return known
  const made: Cache = { files: new Map(), index: null, isSeeded: false }
  caches.set(folder, made)
  return made
}

const parsed = (text: string): HistoryFile | null => {
  try {
    return upgradeHistoryFile(JSON.parse(text))
  } catch {
    return null
  }
}

/** Every history file, reading again only the files whose time changed since this process last read them. */
async function readHistory(place: Pick<HistoryPlace, 'fs' | 'folder'>): Promise<HistoryFile[]> {
  const cache = cacheOf(place.folder)
  const listed = (await place.fs.list(place.folder)).filter(e => e.name.endsWith('.json'))
  const names = new Set(listed.map(e => e.name))
  for (const name of cache.files.keys()) if (!names.has(name)) cache.files.delete(name)
  await Promise.all(
    listed.map(async e => {
      if (cache.files.get(e.name)?.mtimeMs === e.mtimeMs) return
      const text = await place.fs.read(`${place.folder}/${e.name}`).catch(() => null)
      cache.files.set(e.name, { mtimeMs: e.mtimeMs, file: text === null ? null : parsed(text) })
    }),
  )

  return [...cache.files.values()].flatMap(x => (x.file ? [x.file] : []))
}

const DAY_MS = 24 * 60 * 60_000

function indexOf(place: Pick<HistoryPlace, 'folder'>, files: HistoryFile[], now: number): AnswerIndex {
  const cache = cacheOf(place.folder)
  const fileTimes = [...cache.files.entries()].map(([name, x]) => `${name}@${x.mtimeMs}`)
  const said = [Math.floor(now / DAY_MS), ...fileTimes].join('|')
  if (cache.index?.said === said) return cache.index.index
  const index = answerIndex(historyDocs(files, now))
  cache.index = { said, index }
  return index
}

const parentOf = (path: string) => path.replace(/\/+[^/]*\/*$/, '') || '/'
const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''

/** `to` resolved against the folder `from`, for the relative paths Git writes in `.git` and `commondir`. */
function resolved(from: string, to: string): string {
  if (to.startsWith('/')) return to
  const parts = from.split('/')
  for (const part of to.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/') || '/'
}

/**
 * The name of the repository holding `folder`, from its Git common directory, so a worktree reads as its repository.
 * Null outside a repository.
 */
function repoName(fs: Pick<HistoryFs, 'read'>, folder: string): Promise<string | null> {
  const known = repos.get(folder)
  if (known) return known
  const found = findRepo(fs, folder).catch(() => null)
  repos.set(folder, found)
  return found
}

async function findRepo(fs: Pick<HistoryFs, 'read'>, folder: string): Promise<string | null> {
  let dir = folder.replace(/\/+$/, '')
  for (let depth = 0; depth < 40 && dir; depth++) {
    const link = await fs.read(`${dir}/.git`).catch(() => null)
    const gitdir = link?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim()
    if (gitdir) {
      const linked = resolved(dir, gitdir)
      const common = await fs.read(`${linked}/commondir`).catch(() => null)
      const root = common ? resolved(linked, common.trim()) : linked

      return baseName(root) === '.git' ? baseName(parentOf(root)) : baseName(root).replace(/\.git$/, '')
    }
    if ((await fs.read(`${dir}/.git/HEAD`).catch(() => null)) !== null) return baseName(dir)
    const up = parentOf(dir)
    if (up === dir) break
    dir = up
  }

  return null
}

async function writeHistory(place: HistoryPlace, id: string, s: Session, now: number): Promise<void> {
  const path = `${place.folder}/${historyFileName(place.host, id)}`
  const previous = parsed(await place.fs.read(path).catch(() => ''))
  const isNothingToWrite = !previous && !s.ledger.closed.some(c => c.item?.kind === 'question')
  if (isNothingToWrite) return
  const repo = s.place?.folder ? await repoName(place.fs, s.place.folder) : null
  const next = questionHistory(previous, s, { host: place.host, session: id, repo }, now)
  if (isHistoryChanged(previous, next)) await place.fs.write(path, JSON.stringify(next))
}

/** On the host's first history step in this process, writes the files of its kept sessions if it has none yet. */
async function seeded(place: HistoryPlace, now: number): Promise<void> {
  const cache = cacheOf(place.folder)
  if (cache.isSeeded) return
  const listed = await place.fs.list(place.folder)
  if (!listed.some(e => e.name.startsWith(`${place.host}-`)))
    for (const { id, session } of await place.keptSessions()) await writeHistory(place, id, session, now)
  cache.isSeeded = true
}

function addedQuestions(before: Session, after: Session): Session['ledger']['items'] {
  const known = new Set([...before.ledger.items, ...before.ledger.closed].map(x => x.id))

  return after.ledger.items.filter(i => i.kind === 'question' && !i.earlier && !known.has(i.id))
}

/** Whether a change gives `historyStep` anything to do: it added a question or changed the closed list. */
export function isHistoryStepNeeded(before: Session, after: Session): boolean {
  return before.ledger.closed !== after.ledger.closed || addedQuestions(before, after).length > 0
}

/**
 * The step each host runs on a session it is about to save, from `before`, the session as it was saved. It searches
 * the history once for each question the change added and stores the top match on the item as `earlier`. When the
 * change closed or reopened a question, it writes the session's history file. A failed search leaves the session as it
 * was changed, and a failed write keeps the matches: the history never stops a save.
 */
export async function historyStep<S extends Session>(
  place: HistoryPlace | null,
  id: string,
  before: Session,
  after: S,
  now: number,
): Promise<S> {
  if (!place || !isHistoryStepNeeded(before, after)) return after
  const added = addedQuestions(before, after)
  const isClosedChanged = before.ledger.closed !== after.ledger.closed
  await seeded(place, now).catch(() => undefined)
  const tagged = added.length > 0 ? await withEarlier(place, id, after, added, now).catch(() => after) : after
  if (isClosedChanged) await writeHistory(place, id, tagged, now).catch(() => undefined)

  return tagged
}

async function withEarlier<S extends Session>(
  place: HistoryPlace,
  id: string,
  s: S,
  added: Session['ledger']['items'],
  now: number,
): Promise<S> {
  const files = await readHistory(place)
  const index = indexOf(place, files, now)
  const isShown = isEarlierShown(historyStart(files, now), now)
  const matches = new Map(
    added.flatMap(item => {
      const match = bestEarlier(index, item, answerKey(place.host, id, item.id))
      return match ? [[item.id, earlierOf(match, isShown)] as const] : []
    }),
  )
  if (matches.size === 0) return s
  const items = s.ledger.items.map(i => (matches.has(i.id) ? { ...i, earlier: matches.get(i.id)! } : i))

  return { ...s, ledger: { ...s.ledger, items } }
}

/** The most earlier answers the `record` answer lists. */
export const RECORD_MATCHES = 3

/**
 * The earlier answers most like the question a `record` call asks, best first, for the `record` answer to list. None
 * for a call that records no question, and none until `ROW_MEASUREMENT_MS` after the history began. A history that
 * cannot be read gives none.
 */
export async function recordMatches(
  place: HistoryPlace | null,
  input: Record<string, unknown>,
  now: number,
): Promise<AnswerDoc[]> {
  const ask = typeof input.ask === 'string' ? input.ask.trim() : ''
  if (!place || input.kind !== 'question' || ask === '') return []
  const options = Array.isArray(input.options) ? input.options.filter(o => typeof o === 'string') : []
  try {
    const files = await readHistory(place)
    if (now - historyStart(files, now) < ROW_MEASUREMENT_MS) return []

    return rankedEarlier(indexOf(place, files, now), { ask, options }, '', RECORD_MATCHES).map(m => m.doc)
  } catch {
    return []
  }
}
