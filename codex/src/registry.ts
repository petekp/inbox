import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { herdrTarget } from '../../core/remote/herdr'
import { registryFolder, registryHerdr, writeRegistryEntry } from '../../core/runtime/session-registry'
import type { RegistryFiles } from '../../core/runtime/session-registry'
import { missingAsNull } from '../../core/view/session-files'
import { viewOf } from './core'
import { herdrLog } from './herdr-log'
import type { OnWrite } from './host'
import { readState } from './state'
import { isPidRunning } from './pid'
import { CODEX } from './texts'

const registryFiles = (log: (text: string) => void): RegistryFiles => ({
  list: folder => readdir(folder).catch(() => []),
  read: path => readFile(path, 'utf8').catch(missingAsNull),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, text, { mode: 0o600 })
  },
  move: (from, to) => rename(from, to),
  remove: path => rm(path, { force: true }),
  livePids: async pids => new Set(pids.filter(isPidRunning)),
  log,
})

/**
 * Writes the session registry entry of each state written, from its newest saved state, inside Herdr or not. `pid`
 * is the Codex process the session runs in, when this process knows it. Undefined when `env` names no state folder.
 */
export function registryOnWrite(
  env: NodeJS.ProcessEnv,
  dir: string,
  now: () => number,
  pid: number | null,
  log = herdrLog(dir),
): OnWrite | undefined {
  const folder = registryFolder(env)
  if (!folder) return undefined
  const files = registryFiles(log)
  const herdr = registryHerdr(herdrTarget(env))

  return async written => {
    const s = await readState(dir, written.sessionId)
    const at = now()
    await writeRegistryEntry(
      files,
      folder,
      { host: 'codex', sessionId: s.sessionId, agent: CODEX.agent, projectFolder: s.root, version: VERSION, herdr },
      s,
      viewOf(s, at),
      at,
      pid,
    )
  }
}

/** Runs each of `writes` on every state written, or is undefined when none is given. */
export function eachOnWrite(...writes: (OnWrite | undefined)[]): OnWrite | undefined {
  const given = writes.filter((w): w is OnWrite => w !== undefined)
  if (given.length === 0) return undefined

  return async s => {
    await Promise.all(given.map(w => w(s)))
  }
}
