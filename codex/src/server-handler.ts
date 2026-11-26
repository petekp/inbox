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
import { codexPreviewPages } from './preview-pages'
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
/**
 * Where the running handler keeps how to stop its press watcher and its watch on the saved sessions, so a reloaded
 * handler stops the ones before it. A handler from before keeps the watch's stop as `{ stop }`.
 */
const HERDR_PRESSES = Symbol.for('inbox.herdrPresses')
const CODEX_SAVES = Symbol.for('inbox.codexSaves')
const STOPS_ON_INPUT_END = Symbol.for('inbox.stopsOnInputEnd')

type Stop = (() => void) | { stop: (() => void) | null } | null | undefined
type Shared = { [HERDR_PRESSES]?: Stop; [CODEX_SAVES]?: Stop; [STOPS_ON_INPUT_END]?: true }

const stopIn = (stop: Stop) => (typeof stop === 'function' ? stop() : stop?.stop?.())

/**
 * Codex closes this process's input when it quits, and sends no signal. In a Herdr app terminal the watchers would then
 * keep the process running, applying presses and reading PRs for the next Codex there. So once the input ends, they
 * stop, and none starts again. The process ends once the work in flight finishes.
 */
function following<T>(key: typeof HERDR_PRESSES | typeof CODEX_SAVES, start: (given: T) => (() => void) | null) {
  return (given: T) => {
    const shared = globalThis as Shared
    stopIn(shared[key])
    shared[key] = process.stdin.readableEnded ? null : start(given)
    if (shared[STOPS_ON_INPUT_END]) return
    shared[STOPS_ON_INPUT_END] = true
    process.stdin.once('end', () => {
      for (const each of [HERDR_PRESSES, CODEX_SAVES] as const) {
        stopIn(shared[each])
        shared[each] = null
      }
    })
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
    previewPages: codexPreviewPages(process.env, join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE), log),
    onWrite: eachOnWrite(
      herdrOnWrite(process.env, run, dir, Date.now, log),
      registryOnWrite(process.env, dir, Date.now, process.ppid, log),
    ),
    followHerdrPresses: following(HERDR_PRESSES, apply => followCodexPresses(process.env, dir, apply, log)),
    followSaves: following(CODEX_SAVES, heard => followCodexSaves(process.env, dir, heard, log)),
    herdrAsk: codexHerdrAsk(process.env, join(here, 'herdr-mod')),
    delegate: delegateReader(herdrTarget(process.env), run),
    openCatchUp: startUpdate && {
      codexHome,
      startUpdate,
    },
  })
}
