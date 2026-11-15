import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { appendFile, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Run } from '../../hooks/gh'
import { pressFolder } from '../../hooks/herdr'
import type { HerdrTarget } from '../../hooks/herdr'
import type { HerdrFile } from '../../hooks/herdr-press-file'
import { followPresses, isPublishedHere, pressDrainer, pressFileProblem } from '../../hooks/herdr-app'
import type { PressFiles } from '../../hooks/herdr-app'
import type { HerdrModResult, ModFiles } from '../../hooks/herdr-install'
import { startInHerdrApp } from '../../hooks/herdr-start'
import type { SweepFiles } from '../../hooks/herdr-sweep'
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
  read: async path => {
    const problem = pressFileProblem(await stat(path))
    if (problem) throw new Error(problem)

    return readFile(path, 'utf8')
  },
  move: (from, to) => rename(from, to),
  remove: path => rm(path, { force: true }),
}

export const startFiles: ModFiles & SweepFiles = {
  kind: path =>
    lstat(path).then(
      s => (s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'folder' : s.isFile() ? 'file' : 'other'),
      () => null,
    ),
  read: path => readFile(path, 'utf8'),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  makeFolder: async path => void (await mkdir(path, { recursive: true })),
  move: (from, to) => rename(from, to),
  remove: path => rm(path, { force: true }),
  removeFolder: path => rm(path, { recursive: true, force: true }),
  list: async folder =>
    (await readdir(folder, { withFileTypes: true })).filter(e => e.isFile() || e.isDirectory()).map(e => e.name),
}

/**
 * In a Herdr app terminal, keeps the inbox's mod in the app current with the copy beside the bundle, in
 * `dist/herdr-mod`, and removes the published sessions no live terminal can show, as `startInHerdrApp` says. Does
 * nothing outside an app terminal.
 */
export async function startOmpInHerdrApp(
  target: HerdrTarget | null,
  run: Run,
  log: (text: string) => void,
): Promise<HerdrModResult | null> {
  if (target?.kind !== 'terminal') return null
  return startInHerdrApp(run, startFiles, target, bundledHerdrMod(), Date.now(), log)
}

/** The copy of the inbox's Herdr mod beside the bundle. */
export const bundledHerdrMod = () => join(dirname(fileURLToPath(import.meta.url)), 'herdr-mod')

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
  apply: (ctx: OmpContext, file: HerdrFile) => Promise<void>,
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
      const { appHome, terminal } = target
      const id = sessionIdOf(ctx)
      let folder: string
      try {
        folder = pressFolder(appHome, id)
      } catch (err) {
        return log(`Herdr presses not read: ${message(err)}`)
      }
      const drain = pressDrainer(
        pressFiles,
        sessionId => isPublishedHere(path => readFile(path, 'utf8'), appHome, sessionId, 'omp', terminal),
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
