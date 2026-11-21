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
import { mod } from './mod-state'
import { livePids, sessionPid } from './running-sessions'

type RegistryCalls = Pick<Mod, 'commands' | 'history' | 'herdr'>

const madeFolders = new Set<string>()
let tmpCount = 0

/** The engine's calls for the session registry. It has no call that moves or removes a file, or makes a folder. */
function registryFiles(m: RegistryCalls): RegistryFiles {
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
      await run(['mv', '-f', '--', tmp, path])
    },
    remove: path => run(['rm', '-f', '--', path]),
    livePids: pids => livePids({ run: (argv, init) => m.commands.run(argv, init) }, pids),
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

/** This process's pid, once a session file named the conversation it runs. */
let ownPid: number | null = null

/**
 * Writes the registry entry of conversation `id` as `drawn` reads it, inside Herdr or not. Its `pid` is this Claude
 * Code process, which the session file that names the conversation gives.
 */
export function writeModRegistry(
  m: RegistryCalls,
  id: string,
  drawn: () => Promise<{ root: string; session: Session }>,
): Promise<void> {
  return inRegistryOrder(m, async () => {
    const folder = registryFolder(await m.history.stateEnv())
    if (!folder) return
    const [{ root, session }, [HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME]] = await Promise.all([
      drawn(),
      m.herdr.env(),
    ])
    ownPid ??= await sessionPid(
      {
        configFolder: () => configFolder(m.commands),
        list: async path => [...(await m.history.fs.list(path))],
        read: path => m.history.fs.read(path),
      },
      id,
    ).catch(() => null)
    const pid = ownPid
    const now = await m.commands.now()
    const source = {
      host: 'claude-code' as const,
      sessionId: id,
      agent: CLAUDE_CODE.agent,
      projectFolder: root || null,
      version: mod.version,
      herdr: registryHerdr(herdrTarget({ HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME })),
    }
    await writeRegistryEntry(registryFiles(m), folder, source, session, sessionView(session, now, SETTLED_MS), now, pid)
  })
}

/** Removes the registry entry of conversation `id`, as the conversation ends. */
export function removeModRegistry(m: RegistryCalls, id: string): Promise<void> {
  return inRegistryOrder(m, async () => {
    const folder = registryFolder(await m.history.stateEnv())
    if (folder) await removeRegistryEntry(registryFiles(m), folder, 'claude-code', id)
  })
}
