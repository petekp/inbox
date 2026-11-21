import { startCompanion } from './companion-listener'
import { herdrTarget } from '../../core/remote/herdr'
// Codex starts this process once per app launch and keeps it. So it only reads lines and passes each to the
// handler module, which it imports again whenever that module's file changes: a reinstalled plugin, an update, or
// the build `npm --prefix codex run dev` keeps while it runs. A change to this file itself still needs Codex restarted.

import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { createHandler } from './server-handler'
import { dataDir, devBuild } from './data-dir'
import { detachedUpdate } from './detached-update'
import { herdrLog } from './host'
import { run } from './run'
import { withoutSharedTerminal } from './shared-daemon'

type Handler = ReturnType<typeof createHandler>

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = dirname(here)
const dir = dataDir(process.env, pluginRoot)
const BUNDLE = join('dist', 'server-handler.mjs')

await withoutSharedTerminal(process.env, run, process.ppid, herdrLog(dir))

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

const versionParts = (version: string) => version.split('.').map(n => Number.parseInt(n, 10) || 0)

function compareVersions(a: string, b: string): number {
  const [pa, pb] = [versionParts(a), versionParts(b)]
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

/**
 * Codex installs each version of a plugin in its own folder, named for the version, and an update deletes the
 * folder of the version before. Once this process's own folder is gone, the newest version beside it is the one
 * installed.
 */
async function installedBundle(): Promise<string | null> {
  const own = join(pluginRoot, BUNDLE)
  if (await exists(own)) return own
  const versions = (await readdir(dirname(pluginRoot)).catch(() => [])).filter(name => /^\d/.test(name))
  for (const version of versions.sort(compareVersions).reverse()) {
    const bundle = join(dirname(pluginRoot), version, BUNDLE)
    if (await exists(bundle)) return bundle
  }

  return null
}

async function handlerPath(): Promise<string | null> {
  const server = (await devBuild(dir))?.server
  if (server && (await exists(server))) return server

  return installedBundle()
}

let current: { key: string; handle: Promise<Handler> } | null = null
let lastLoaded: Handler | null = null
let loadError: string | null = null
let isPluginFolderGone = false

function load(url: string, path: string): Promise<Handler> {
  const handle = import(url).then((m: { createHandler: typeof createHandler }) =>
    m.createHandler(
      dir,
      () => loadError,
      () => isPluginFolderGone,
      detachedUpdate(dir, process.env, join(here, 'update.mjs')),
    ),
  )
  handle.then(
    h => {
      lastLoaded = h
      loadError = null
    },
    err => {
      loadError = `${path}: ${err instanceof Error ? err.message : String(err)}`
      process.stderr.write(`inbox: could not load ${loadError}\n`)
    },
  )

  return handle
}

/**
 * A file that changed is imported again under a new URL, since Node
 * keeps a module by its URL. Each import stays in memory until the process ends, which a reload per save allows.
 * A file that fails to import, as one caught mid-write, leaves the last handler in place. Node keeps the failure
 * under its URL too, so the import is tried again only once the file changes.
 */
async function currentHandler(): Promise<Handler> {
  const path = await handlerPath()
  isPluginFolderGone = path === null
  if (path === null) {
    if (lastLoaded) return lastLoaded
    throw new Error(`no ${BUNDLE} in ${dirname(pluginRoot)}`)
  }
  const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: -1 }))
  const key = `${pathToFileURL(path).href}?v=${mtimeMs}`
  if (current?.key !== key) current = { key, handle: load(key, path) }
  const { handle } = current
  try {
    return await handle
  } catch (err) {
    if (lastLoaded) return lastLoaded
    throw err
  }
}

const reply = (r: unknown) => process.stdout.write(`${JSON.stringify(r)}\n`)
// Each message waits for the handler of the one before it, so handlers start in arrival order. Their replies still finish in any order.
let ready: Promise<unknown> = Promise.resolve()

const companion = herdrTarget(process.env)
  ? Promise.resolve(async () => {})
  : startCompanion(dir, async () => (await currentHandler()).companion, herdrLog(dir)).catch(error => {
      herdrLog(dir)(error instanceof Error ? error.message : 'Companion could not start.')
      return async () => {}
    })
process.stdin.once('end', () => {
  void companion.then(stop => stop())
})

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  let message: { id?: unknown }
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  const handler = ready.then(currentHandler)
  ready = handler.catch(() => undefined)
  void handler.then(
    handle =>
      handle(message as Parameters<Handler>[0]).then(r => {
        if (r) reply(r)
      }),
    err => {
      if (message.id === undefined) return
      const why = err instanceof Error ? err.message : String(err)
      reply({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: `The inbox server could not load: ${why}` },
      })
    },
  )
})
