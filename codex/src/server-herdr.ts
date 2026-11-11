import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { herdrTarget } from '../../hooks/herdr'
import type { PressFile } from '../../hooks/herdr'
import { followPresses, pressDrainer, publishedSessionPath } from '../../hooks/herdr-app'
import type { PressFiles } from '../../hooks/herdr-app'

const pressFiles: PressFiles = {
  list: folder => readdir(folder),
  read: path => readFile(path, 'utf8'),
  remove: path => rm(path, { force: true }),
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * In a Herdr app terminal, applies the presses the Herdr look writes for the Codex sessions this terminal publishes,
 * with `apply`. The server cannot tell which session it serves until a tool call names one, so a session is this
 * terminal's when its published file names Codex and this terminal. The presses folder is read at once, again once
 * its watcher starts, on each change, and every `PRESS_POLL_MS` in case the watcher missed a press. Returns how to stop,
 * or null outside an app terminal.
 */
export function followCodexPresses(
  env: NodeJS.ProcessEnv,
  apply: (sessionId: string, file: PressFile) => Promise<void>,
  log: (text: string) => void,
): (() => void) | null {
  const target = herdrTarget(env)
  if (target?.kind !== 'terminal' || !target.appHome) return null
  const { appHome, terminal } = target
  const root = join(appHome, 'inbox', 'presses')

  const isThisTerminals = async (id: string) => {
    const text = await readFile(publishedSessionPath(appHome, id), 'utf8').catch(() => null)
    try {
      const envelope = text === null ? null : (JSON.parse(text) as { host?: unknown; terminal?: unknown })
      return envelope?.host === 'codex' && envelope.terminal === terminal
    } catch {
      return false
    }
  }
  const drain = pressDrainer(
    pressFiles,
    async (id, file) => {
      await apply(id, file)
      return true
    },
    log,
  )
  const drainAll = async () => {
    const folders = await readdir(root, { withFileTypes: true }).catch(() => [])
    const ids = folders.filter(entry => entry.isDirectory()).map(entry => entry.name)
    const owned = await Promise.all(ids.map(async id => ((await isThisTerminals(id)) ? [id] : [])))
    await Promise.all(owned.flat().map(id => drain(appHome, id)))
  }
  const watchFolder = (wake: () => void) => {
    let isStopped = false
    let watcher: FSWatcher | null = null
    void mkdir(root, { recursive: true })
      .then(() => {
        if (isStopped) return
        watcher = watch(root, { recursive: true }, () => wake())
        watcher.on('error', err => log(`Herdr presses not watched: ${message(err)}`))
        wake()
      })
      .catch((err: unknown) => log(`Herdr presses not watched: ${message(err)}`))

    return () => {
      isStopped = true
      watcher?.close()
    }
  }

  return followPresses(
    drainAll,
    watchFolder,
    (ms, fn) => {
      const timer = setInterval(fn, ms)
      timer.unref()
      return () => clearInterval(timer)
    },
    log,
  )
}
