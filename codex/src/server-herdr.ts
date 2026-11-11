import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Run } from '../../hooks/gh'
import { herdrAppHome, herdrTarget } from '../../hooks/herdr'
import { answerHerdrAsk, herdrAskInApp } from '../../hooks/herdr-ask'
import type { ModFiles } from '../../hooks/herdr-install'
import { startInHerdrApp } from '../../hooks/herdr-start'
import type { SweepFiles } from '../../hooks/herdr-sweep'
import type { PressFile } from '../../hooks/herdr-press-file'
import { followPresses, isPublishedHere, pressDrainer, pressFileProblem } from '../../hooks/herdr-app'
import type { PressFiles } from '../../hooks/herdr-app'
import { isSessionFile } from '../../hooks/session-files'

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
 * In a Herdr app terminal, keeps the inbox's mod in the app current with the copy in `bundledFolder`, and removes the
 * published sessions no live terminal can show, as `startInHerdrApp` says. Does nothing outside an app terminal.
 */
export async function startCodexInHerdrApp(
  env: NodeJS.ProcessEnv,
  run: Run,
  bundledFolder: string,
  log: (text: string) => void,
): Promise<void> {
  const target = herdrTarget(env)
  if (target?.kind === 'terminal') await startInHerdrApp(run, startFiles, target, bundledFolder, Date.now(), log)
}

/**
 * The question the Codex app's tab asks before it installs the inbox's Herdr mod, and its answer. It asks when the
 * Herdr app's settings folder exists, the mod is missing and no host has saved an answer.
 */
export function codexHerdrAsk(env: NodeJS.ProcessEnv, bundledFolder: string) {
  const appHome = herdrAppHome(env)
  const asked = () => (appHome ? herdrAskInApp(startFiles, appHome, env.HOME) : Promise.resolve(null))

  return {
    view: asked,
    answer: async (isYes: boolean) => {
      const ask = await asked()
      if (!ask) return { ask: null, failure: null }

      return answerHerdrAsk(startFiles, ask, bundledFolder, isYes, Date.now(), 'Run /inbox herdr in Claude Code or omp')
    },
  }
}

export type CodexHerdrAsk = ReturnType<typeof codexHerdrAsk>

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

  const drain = pressDrainer(
    pressFiles,
    id => isPublishedHere(path => readFile(path, 'utf8'), appHome, id, 'codex', terminal),
    async (id, file) => {
      await apply(id, file)
      return true
    },
    log,
  )
  const drainAll = async () => {
    const folders = await readdir(root, { withFileTypes: true }).catch(() => [])
    const ids = folders.filter(entry => entry.isDirectory() && isSessionFile(`${entry.name}.json`)).map(e => e.name)
    const drains = await Promise.allSettled(ids.map(id => drain(appHome, id)))
    for (const d of drains) if (d.status === 'rejected') log(`Herdr presses not read: ${message(d.reason)}`)
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
