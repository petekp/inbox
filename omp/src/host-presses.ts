import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HerdrTarget, PressFile } from '../../hooks/herdr'
import { followPresses, pressDrainer, pressFolder } from '../../hooks/herdr-app'
import type { PressFiles } from '../../hooks/herdr-app'
import { sessionIdOf } from './host-context'
import type { OmpContext } from './host-context'

/** The most `herdr.log` holds before the next line starts it over. */
const HERDR_LOG_BYTES = 64 * 1024

/**
 * Appends a line to `herdr.log` in the state folder, which says why Herdr's labels or published file did not change, as
 * when no `hc` started. Over `HERDR_LOG_BYTES`, the line starts the file over.
 */
export function herdrLog(dir: string): (text: string) => void {
  const path = join(dir, 'herdr.log')

  return text =>
    void (async () => {
      const size = await stat(path).then(
        s => s.size,
        () => 0,
      )
      const line = `${new Date().toISOString()} ${text}\n`
      await mkdir(dir, { recursive: true })
      await (size > HERDR_LOG_BYTES ? writeFile(path, line) : appendFile(path, line))
    })().catch(() => undefined)
}

const pressFiles: PressFiles = {
  list: folder => readdir(folder),
  read: path => readFile(path, 'utf8'),
  remove: path => rm(path, { force: true }),
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** How omp follows the presses the Herdr look writes for the session it shows. */
export type OmpPresses = {
  /** Applies the presses for the session `ctx` shows, from now until the next `follow` or `stop`. */
  follow(ctx: OmpContext): void
  stop(): void
}

/**
 * In a Herdr app terminal, applies the presses the Herdr look writes for the session omp shows, with `apply`. The
 * session's press folder is read at once, again once its watcher starts, on each change, and every `PRESS_POLL_MS` in
 * case the watcher missed a press. Outside an app terminal it does nothing.
 */
export function ompPresses(
  target: HerdrTarget | null,
  apply: (ctx: OmpContext, file: PressFile) => Promise<void>,
  log: (text: string) => void,
): OmpPresses {
  let stopFollowing: (() => void) | null = null

  const stop = () => {
    stopFollowing?.()
    stopFollowing = null
  }

  return {
    follow: ctx => {
      stop()
      if (target?.kind !== 'terminal' || !target.appHome) return
      const { appHome } = target
      const id = sessionIdOf(ctx)
      let folder: string
      try {
        folder = pressFolder(appHome, id)
      } catch (err) {
        return log(`Herdr presses not read: ${message(err)}`)
      }
      const drain = pressDrainer(
        pressFiles,
        async (_id, file) => {
          await apply(ctx, file)
          return true
        },
        log,
      )
      const watchFolder = (wake: () => void) => {
        let isStopped = false
        let watcher: FSWatcher | null = null
        void mkdir(folder, { recursive: true })
          .then(() => {
            if (isStopped) return
            watcher = watch(folder, () => wake())
            watcher.on('error', err => log(`Herdr presses not watched: ${message(err)}`))
            wake()
          })
          .catch((err: unknown) => log(`Herdr presses not watched: ${message(err)}`))

        return () => {
          isStopped = true
          watcher?.close()
        }
      }
      stopFollowing = followPresses(
        () => drain(appHome, id),
        watchFolder,
        (ms, fn) => {
          const timer = setInterval(fn, ms)
          timer.unref()
          return () => clearInterval(timer)
        },
        log,
      )
    },
    stop,
  }
}
