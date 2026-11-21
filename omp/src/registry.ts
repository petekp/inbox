import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { RegistryFiles } from '../../core/runtime/session-registry'
import { missingAsNull } from '../../core/view/session-files'
import { isPidRunning } from './pid'

/** Node's file calls for the session registry. A write replaces its file through a rename. */
export const registryFiles = (log: (text: string) => void): RegistryFiles => ({
  list: folder => readdir(folder).catch(() => []),
  read: path => readFile(path, 'utf8').catch(missingAsNull),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const tmp = `${path}.${process.pid}-${randomUUID()}.tmp`
    await writeFile(tmp, text, { mode: 0o600 })
    await rename(tmp, path)
  },
  remove: path => rm(path, { force: true }),
  livePids: async pids => new Set(pids.filter(isPidRunning)),
  log,
})
