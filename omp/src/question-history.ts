import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { HistoryFs, HistoryPlace } from '../../hooks/history-store'
import { historyFolder } from '../../hooks/question-history'
import { isSessionFile } from '../../hooks/session-files'
import { readState } from './state'

/** The question history's files through `node:fs`. A write goes to a temporary file first, so no read sees half of it. */
const nodeFs: HistoryFs = {
  list: async folder => {
    const names = await readdir(folder).catch(() => [])
    const listed = await Promise.all(
      names.map(async name => {
        const info = await stat(join(folder, name)).catch(() => null)
        return info?.isFile() ? { name, mtimeMs: info.mtimeMs } : null
      }),
    )
    return listed.filter(x => x !== null)
  },
  read: path => readFile(path, 'utf8'),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, text)
    await rename(tmp, path)
  },
}

/** The question history for the sessions saved under `dir`, or null when the environment names no home. */
export function questionHistoryPlace(
  env: Readonly<Record<string, string | undefined>>,
  dir: string,
): HistoryPlace | null {
  const folder = historyFolder(env)
  if (!folder) return null

  return {
    fs: nodeFs,
    folder,
    host: 'omp',
    keptSessions: async () => {
      const names = (await readdir(join(dir, 'sessions')).catch(() => [])).filter(isSessionFile)
      const read = await Promise.all(
        names.map(async name => {
          const id = name.slice(0, -'.json'.length)
          const session = await readState(dir, id).catch(() => null)
          return session ? { id, session } : null
        }),
      )
      return read.filter(x => x !== null)
    },
  }
}
