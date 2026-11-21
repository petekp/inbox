import { herdrTarget } from '../../core/remote/herdr'
import {
  registryFolder,
  registryHerdr,
  removeRegistryEntry,
  writeRegistryEntry,
} from '../../core/runtime/session-registry'
import type { RegistryFiles } from '../../core/runtime/session-registry'
import type { Session } from '../../types'
import { CLAUDE_CODE } from '../../core/domain/model-text'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import { configFolder } from './mod-engine-calls'
import type { Mod } from './mod-ports'
import { mod, sessionState } from './mod-state'
import { livePids, sessionPid } from './running-sessions'

type RegistryCalls = Pick<Mod, 'commands' | 'history' | 'herdr'>

const madeFolders = new Set<string>()
let tmpCount = 0

/**
 * The engine's calls for the session registry. It has no call that moves or removes a file, makes a folder or sets a
 * mode. `ps` is trusted only when it lists `ownPid`.
 */
function registryFiles(m: RegistryCalls, ownPid: number | null): RegistryFiles {
  const run = async (argv: string[]) => {
    const r = await m.commands.run(argv, { cwd: '/', timeoutMs: 5000 })
    if (r.exitCode !== 0) throw new Error(`${argv[0]} exited ${r.exitCode}: ${r.stderr.trim()}`)
  }

  return {
    list: async folder => (await m.history.fs.list(folder).catch(() => [])).map(entry => entry.name),
    read: async path => ((await m.commands.exists(path)) ? m.history.fs.read(path) : null),
    write: async (path, text) => {
      const folder = path.slice(0, path.lastIndexOf('/'))
      if (!madeFolders.has(folder)) {
        await run(['mkdir', '-p', '-m', '700', '--', folder])
        madeFolders.add(folder)
      }
      const tmp = `${path}.${(await m.commands.now()).toString(36)}-${++tmpCount}.tmp`
      await m.commands.write(tmp, text)
      await run(['chmod', '600', '--', tmp])
      await run(['mv', '-f', '--', tmp, path])
    },
    remove: path => run(['rm', '-f', '--', path]),
    livePids: async pids => {
      if (ownPid === null) return null
      const live = await livePids({ run: (argv, init) => m.commands.run(argv, init) }, [...pids, ownPid])

      return live?.has(ownPid) ? live : null
    },
    log: m.herdr.log,
  }
}

/**
 * The registry writes and removals, one after another, so a removal is never overtaken by a write before it. A failure
 * is logged, and the ones after it still run.
 */
let registryWork: Promise<void> = Promise.resolve()
const inRegistryOrder = (m: RegistryCalls, work: () => Promise<void>) =>
  (registryWork = registryWork
    .then(work)
    .catch((error: unknown) =>
      m.herdr.log(
        `inbox: the session registry could not be updated: ${error instanceof Error ? error.message : error}`,
      ),
    ))

/** This process's pid, once exactly one running Claude Code process had a session file that named the conversation. */
let ownPid: number | null = null

/**
 * The conversation whose entry was removed as it ended, and the load it ended in. A publish after the end and before
 * the next conversation loads still names it, and must not write it again.
 */
let ended: { id: string; loadRevision: number } | null = null
const hasEnded = (id: string) => ended?.id === id && ended.loadRevision === sessionState.loadRevision

/**
 * Writes the registry entry of conversation `id` as `drawn` reads it, inside Herdr or not. Its `pid` is this Claude
 * Code process, which the session file that names the conversation gives.
 */
export function writeModRegistry(
  m: RegistryCalls,
  id: string,
  drawn: () => Promise<{ root: string; session: Session }>,
): Promise<void> {
  if (hasEnded(id)) return Promise.resolve()

  return inRegistryOrder(m, async () => {
    const folder = registryFolder(await m.history.stateEnv())
    if (!folder || hasEnded(id)) return
    const [{ root, session }, [HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME]] = await Promise.all([
      drawn(),
      m.herdr.env(),
    ])
    ownPid ??= await sessionPid(
      {
        configFolder: () => configFolder(m.commands),
        list: async path => [...(await m.history.fs.list(path))],
        read: path => m.history.fs.read(path),
        run: (argv, init) => m.commands.run(argv, init),
      },
      id,
    ).catch(() => null)
    const now = await m.commands.now()
    const source = {
      host: 'claude-code' as const,
      sessionId: id,
      agent: CLAUDE_CODE.agent,
      projectFolder: root || null,
      version: mod.version,
      herdr: registryHerdr(herdrTarget({ HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME })),
    }
    const view = sessionView(session, now, SETTLED_MS)
    await writeRegistryEntry(registryFiles(m, ownPid), folder, source, session, view, now, ownPid)
  })
}

/** Removes the registry entry of conversation `id`, as the conversation ends. */
export function removeModRegistry(m: RegistryCalls, id: string): Promise<void> {
  ended = { id, loadRevision: sessionState.loadRevision }

  return inRegistryOrder(m, async () => {
    const folder = registryFolder(await m.history.stateEnv())
    if (folder) await removeRegistryEntry(registryFiles(m, ownPid), folder, 'claude-code', id)
  })
}
