import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findCli, queueResumeCheck } from './cli'
import { makeServer } from './server'
import { devBuild } from './data-dir'
import TAB_HTML from './tab.html'
import { run } from './run'
import { listHooksTrust } from './hook-trust'
import { COMPARE_PAGE_FILE } from '../../hooks/press-messages'
import { NEXT_BUILD_MARK } from '../../hooks/view'

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
export function createHandler(
  dir: string,
  loadError: () => string | null = () => null,
  isPluginFolderGone: () => boolean = () => false,
  startUpdate?: (sessionId: string) => void,
): ReturnType<typeof makeServer> {
  return makeServer({
    dir,
    now: Date.now,
    exec: run,
    tabHtml: TAB_HTML,
    fallbackCli: () => findCli(process.env, run, process.ppid),
    hooksTrust: listHooksTrust,
    queueResumes: queueResumeCheck(run),
    devPage: devPageIn(dir),
    build: SERVER_BUILD,
    loadError,
    isPluginFolderGone,
    isNextBuild: existsSync(join(dirname(dirname(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK)),
    comparePage: join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE),
    openCatchUp: startUpdate && {
      codexHome: process.env.CODEX_HOME || join(homedir(), '.codex'),
      startUpdate,
    },
  })
}
