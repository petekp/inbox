import { applyFeedFiles, FEED_POLL_MS, MAX_FEED_FILE_BYTES, parseFeed, type FeedFile } from './feed'
import { resolveInboxFeedPath } from './feed-path'
import type { Run } from './gh'
import type { Ledger } from '../types'
import type { FsStat } from 'claude-code'

export { FEED_POLL_MS }

type FeedFs = [
  (path: string) => Promise<FsStat>,
  (path: string) => Promise<{ name: string; isLink?: boolean }[]>,
  (path: string) => Promise<boolean>,
  (path: string) => Promise<string>,
]

export async function startModFeed(
  env: [
    Promise<string | null | undefined>,
    Promise<string | null | undefined>,
    Promise<string | null | undefined>,
    Promise<string | null | undefined>,
  ],
  run: Run,
  fs: FeedFs,
  now: () => Promise<number>,
  commit: (change: (ledger: Ledger) => Ledger) => Promise<unknown>,
  sessionId: () => Promise<string>,
) {
  const [explicit, home, paneId, binPath] = await Promise.all(env)
  const path = await resolveInboxFeedPath(
    explicit ?? undefined,
    home ?? undefined,
    { paneId: paneId ?? undefined, binPath: binPath ?? undefined },
    run,
  )
  if (!path) return null
  const poll = feedPoll(path, fs, now, commit)

  return () => sessionId().then(poll)
}

export function feedPoll(
  path: string,
  [stat, list, exists, readFile]: FeedFs,
  now: () => Promise<number>,
  commit: (change: (ledger: Ledger) => Ledger) => Promise<unknown>,
): (sessionId: string) => Promise<void> {
  let mtimes = new Map<string, number>()
  let session: string | undefined
  let isRunning = false
  const save = async (files: FeedFile[]) => now().then(at => commit(ledger => applyFeedFiles(ledger, path, files, at)))
  const read = async (file: string, stat: FsStat) =>
    stat.size > MAX_FEED_FILE_BYTES
      ? null
      : stat.mtimeMs === mtimes.get(file)
        ? undefined
        : parseFeed(await readFile(file))

  return async sessionId => {
    if (isRunning) return
    if (session !== sessionId) mtimes = new Map()
    session = sessionId
    isRunning = true
    try {
      const root: FsStat = await stat(path)
      if (root.kind === 'file') {
        try {
          const feed = await read(path, root)
          mtimes.set(path, root.mtimeMs)
          await save([{ path, feed }])
        } catch {
          return
        }
        return
      }
      if (root.kind !== 'dir') return

      const nextMtimes = new Map<string, number>()
      const files: FeedFile[] = []
      for (const entry of await list(path)) {
        if (!entry.name.endsWith('.json') || entry.isLink) continue
        const file = `${path.replace(/[\\/]+$/, '')}/${entry.name}`
        try {
          const current: FsStat = await stat(file)
          if (current.isLink || current.kind !== 'file') continue
          files.push({ path: file, feed: await read(file, current) })
          nextMtimes.set(file, current.mtimeMs)
        } catch {
          files.push({ path: file, feed: undefined })
        }
      }
      mtimes = nextMtimes
      await save(files)
    } catch {
      if (!(await exists(path).catch(() => true))) {
        mtimes.clear()
        await save([])
      }
    } finally {
      isRunning = false
    }
  }
}
