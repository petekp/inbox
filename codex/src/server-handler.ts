import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { steerTurn } from './app-steer'
import { findCli, queueResumeCheck } from './cli'
import { makeServer } from './server'
import { devBuild } from './data-dir'
import TAB_HTML from './tab.html'
import { run } from './run'
import { useQuestionHistory } from './state'
import { questionHistoryPlace } from './question-history'
import { listHooksTrust } from './hook-trust'
import { herdrOnWrite } from './host'
import { eachOnWrite, registryOnWrite } from './registry'
import { herdrLog } from './herdr-log'
import { codexHerdrAsk, followCodexPresses, followCodexSaves, startCodexInHerdrApp } from './server-herdr'
import { COMPARE_PAGE_FILE } from '../../core/domain/press-messages'
import { NEXT_BUILD_MARK } from '../../core/view/banners'
import { delegateReader } from '../../core/remote/hc-terminals'
import { herdrTarget } from '../../core/remote/herdr'

function devPageIn(dir: string): () => Promise<string | null> {
  let cached: { path: string; mtimeMs: number; html: string } | null = null
  return async () => {
    try {
      const dev = await devBuild(dir)
      if (!dev) return null
      const { tab } = dev
      const { mtimeMs } = await stat(tab)
      if (cached?.path !== tab || cached.mtimeMs !== mtimeMs)
        cached = { path: tab, mtimeMs, html: await readFile(tab, 'utf8') }
      return cached.html
    } catch {
      return null
    }
  }
}

/**
 * `loadError` says why the loader could not
 * load a newer build of this module, while this one keeps running. `isPluginFolderGone` says the loader found no
 * installed copy of this module at all. A loader that is already running calls this signature, so a change to it
 * needs Codex restarted, and a loader from before `isPluginFolderGone` passes only the first two. `startUpdate` starts
 * an update outside this process; a loader from before it passes none, and a tab then opens without catching its chat up.
 */
/** Where the running handler keeps how to stop its press watcher, so a reloaded handler stops the one before it. */
const HERDR_PRESSES = Symbol.for('inbox.herdrPresses')

function followHerdrPresses(log: (text: string) => void) {
  return (apply: Parameters<typeof followCodexPresses>[1]) => {
    const shared = globalThis as { [HERDR_PRESSES]?: (() => void) | null }
    shared[HERDR_PRESSES]?.()
    shared[HERDR_PRESSES] = followCodexPresses(process.env, apply, log)
  }
}

/** Where the running handler keeps how to stop its watch on the saved sessions, so a reloaded handler stops the one before it. */
const CODEX_SAVES = Symbol.for('inbox.codexSaves')

function followSaves(dir: string, log: (text: string) => void) {
  return (heard: (sessionId: string) => void) => {
    const shared = globalThis as { [CODEX_SAVES]?: (() => void) | null }
    shared[CODEX_SAVES]?.()
    const stop = followCodexSaves(process.env, dir, heard, log)
    shared[CODEX_SAVES] = stop
    // Codex closes this process's input when it quits but can leave the process running, and a server left running
    // would go on reading PRs for the next Codex in the same terminal.
    process.stdin.once('end', () => stop?.())
  }
}

export function createHandler(
  dir: string,
  loadError: () => string | null = () => null,
  isPluginFolderGone: () => boolean = () => false,
  startUpdate?: (sessionId: string) => void,
): ReturnType<typeof makeServer> {
  const log = herdrLog(dir)
  useQuestionHistory(questionHistoryPlace(process.env, dir))
  const here = dirname(fileURLToPath(import.meta.url))
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  void startCodexInHerdrApp(process.env, run, join(here, 'herdr-mod'), log).catch(() => undefined)

  return makeServer({
    dir,
    now: Date.now,
    exec: run,
    tabHtml: TAB_HTML,
    fallbackCli: () => findCli(process.env, run, process.ppid),
    hooksTrust: listHooksTrust,
    queueResumes: queueResumeCheck(run),
    steer: to => steerTurn(codexHome, to),
    devPage: devPageIn(dir),
    build: SERVER_BUILD,
    loadError,
    isPluginFolderGone,
    isNextBuild: existsSync(join(dirname(dirname(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK)),
    comparePage: join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE),
    onWrite: eachOnWrite(
      herdrOnWrite(process.env, run, dir, Date.now, log),
      registryOnWrite(process.env, dir, Date.now, process.ppid, log),
    ),
    followHerdrPresses: followHerdrPresses(log),
    followSaves: followSaves(dir, log),
    herdrAsk: codexHerdrAsk(process.env, join(here, 'herdr-mod')),
    delegate: delegateReader(herdrTarget(process.env), run),
    openCatchUp: startUpdate && {
      codexHome,
      startUpdate,
    },
  })
}
