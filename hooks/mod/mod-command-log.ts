import { commandLogPath, fileCommandStore } from '../../core/runtime/command-store'
import type { CommandFiles } from '../../core/runtime/command-store'
import type { CommandRunner, CommandStore } from '../../core/runtime/remote-command-state'
import { inboxStateFolder } from '../../core/domain/question-history'
import { orderedKeys } from '../../core/runtime/session-host'

/** The engine calls a command log makes. `read` throws when there is no file. */
type CommandLogCalls = {
  stateEnv: () => Promise<{ XDG_STATE_HOME: string | undefined; HOME: string | undefined }>
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  run: (argv: string[]) => Promise<{ code: number; stderr: string }>
  now: () => Promise<number>
  log: (text: string) => void
}

/**
 * This process as the runner of a command. The engine gives no process id, so a command another Claude Code process
 * left `attempting` reads as stranded: only the process that runs a conversation runs its commands.
 */
const RUNNER: CommandRunner = { id: crypto.randomUUID(), startedAt: Date.now() }

/** The mod saves each session in one process, so a change to its log waits only for the changes before it here. */
const changes = orderedKeys()
const madeFolders = new Set<string>()

/** A conversation's command log, which `remove` deletes along with the conversation's saved session. */
export type ModCommandStore = CommandStore & { remove(): Promise<void> }

/**
 * The command log of the mod's session `sessionId`, in `$XDG_STATE_HOME/inbox/claude-code`, else
 * `~/.local/state/inbox/claude-code`. The engine has no call that moves a file or makes a folder, so those run `mv`
 * and `mkdir`. `onChange` runs after each change it keeps.
 */
export function modCommandStore(calls: CommandLogCalls, sessionId: string, onChange?: () => unknown): ModCommandStore {
  const runOrThrow = async (argv: string[]) => {
    const r = await calls.run(argv)
    if (r.code !== 0) throw new Error(`${argv[0]} exited ${r.code}: ${r.stderr.trim()}`)
  }
  const folderOf = async () => {
    const inbox = inboxStateFolder(await calls.stateEnv())
    if (!inbox) throw new Error('The command log has no folder, since neither XDG_STATE_HOME nor HOME is set.')
    return `${inbox}/claude-code`
  }
  const files: CommandFiles = {
    read: async path => ((await calls.exists(path)) ? calls.read(path) : null),
    write: async (path, text) => {
      const folder = path.slice(0, path.lastIndexOf('/'))
      if (!madeFolders.has(folder)) {
        await runOrThrow(['mkdir', '-p', '--', folder])
        madeFolders.add(folder)
      }
      await calls.write(path, text)
    },
    move: (from, to) => runOrThrow(['mv', '-f', '--', from, to]),
    lock: (path, fn) => changes.run(path, fn),
  }
  const isRunning = async (runner: CommandRunner) => runner.id === RUNNER.id
  const pathOf = async () => commandLogPath(await folderOf(), sessionId)
  const storeAt = async () =>
    fileCommandStore(files, await pathOf(), { runner: RUNNER, isRunning }, { now: calls.now, log: calls.log, onChange })

  return {
    runner: RUNNER,
    isRunning,
    read: async () => (await storeAt()).read(),
    update: async change => (await storeAt()).update(change),
    remove: async () => {
      const path = await pathOf()
      await changes.run(path, () => runOrThrow(['rm', '-f', '--', path]))
    },
  }
}
