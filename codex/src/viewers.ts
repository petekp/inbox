import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ViewerStore } from '../../core/runtime/remote-viewers'
import { sessionFile } from '../../core/view/session-files'
import type { ViewerLeases } from '../../types'
import { withLock } from './lock'

/**
 * A session's viewer leases as Codex saves them beside its state. `writtenAt` is when they last changed, which a
 * publish gives as its own when it is newer than the state's, so the Herdr look takes a publish of a heartbeat.
 */
type SavedLeases = { writtenAt: number; leases: ViewerLeases }

const NO_LEASES: SavedLeases = { writtenAt: 0, leases: {} }

function leasesPath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', sessionFile(sessionId).replace(/\.json$/, '.viewers.json'))
}

/** A session's saved viewer leases. A missing or unreadable file holds none. */
export async function readViewers(dir: string, sessionId: string): Promise<SavedLeases> {
  const saved = await readFile(leasesPath(dir, sessionId), 'utf8').then(
    text => JSON.parse(text) as Partial<SavedLeases>,
    () => null,
  )
  const isSaved = typeof saved?.writtenAt === 'number' && typeof saved.leases === 'object' && saved.leases !== null

  return isSaved ? (saved as SavedLeases) : NO_LEASES
}

/**
 * A session's viewer store, in a file beside its state, so a heartbeat leaves the state alone. Several MCP servers
 * can apply one session's viewer files, so each change runs under the file's lock and replaces the file in one step.
 * `onChange` runs after each change it keeps.
 */
export function codexViewerStore(
  dir: string,
  sessionId: string,
  now: () => number,
  onChange: () => Promise<void>,
): ViewerStore {
  const path = leasesPath(dir, sessionId)

  return {
    read: async () => (await readViewers(dir, sessionId)).leases,
    update: async change => {
      const { leases, isChanged } = await withLock(`${path}.lock`, async () => {
        const saved = await readViewers(dir, sessionId)
        const leases = change(saved.leases)
        if (leases === saved.leases) return { leases, isChanged: false }
        const tmp = `${path}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify({ writtenAt: Math.max(now(), saved.writtenAt + 1), leases }))
        await rename(tmp, path)
        return { leases, isChanged: true }
      })
      if (isChanged) await onChange()
      return leases
    },
  }
}

/** Deletes a session's viewer leases, when its state is deleted. */
export function removeViewers(dir: string, sessionId: string): Promise<void> {
  return rm(leasesPath(dir, sessionId), { force: true })
}
