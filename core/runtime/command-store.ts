import { sessionFile } from '../view/session-files'
import type { Session } from '../../types'
import { EMPTY_LOG, hasCommandRows, remoteCommandState, withLegacy } from './remote-command-state'
import type { CommandLog, CommandRunner, CommandStore } from './remote-command-state'

/** The file calls a command log needs. `read` gives null when there is no file. `lock` runs `fn` alone for `path`. */
export type CommandFiles = {
  read(path: string): Promise<string | null>
  write(path: string, text: string): Promise<void>
  move(from: string, to: string): Promise<void>
  lock<T>(path: string, fn: () => Promise<T>): Promise<T>
}

/** Where a session's command log is kept in `folder`: beside its state in Codex and omp. */
export function commandLogPath(folder: string, sessionId: string): string {
  return `${folder}/${sessionFile(sessionId).replace(/\.json$/, '.commands.json')}`
}

function isLog(value: unknown): value is CommandLog {
  const log = value as Partial<CommandLog> | null
  return (
    log?.version === 1 &&
    typeof log.writtenAt === 'number' &&
    typeof log.floor === 'number' &&
    Number.isSafeInteger(log.floor) &&
    log.floor >= 0 &&
    typeof log.commands === 'object' &&
    log.commands !== null
  )
}

/**
 * The log a file holds. A file that cannot be read as a log is unreadable: it may have held any command, so the
 * log that replaces it starts its history at `now`, and every command sent before then is refused.
 */
function parsedLog(text: string | null, now: number): { log: CommandLog; isUnreadable: boolean } {
  if (text === null) return { log: EMPTY_LOG, isUnreadable: false }
  const value = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  })()

  return isLog(value) ? { log: value, isUnreadable: false } : { log: { ...EMPTY_LOG, floor: now }, isUnreadable: true }
}

let tmpCount = 0

/**
 * A command log kept in the file at `path`. Each change runs under `files.lock`, replaces the file through a temporary
 * file and a move, and reads it back. A change first moves an unreadable file aside and logs where. `onChange` runs
 * after each change it keeps.
 */
export function fileCommandStore(
  files: CommandFiles,
  path: string,
  process: { runner: CommandRunner; isRunning(runner: CommandRunner): Promise<boolean> },
  opts: { now(): number | Promise<number>; log(text: string): void; onChange?: () => unknown },
): CommandStore {
  return {
    runner: process.runner,
    isRunning: runner => process.isRunning(runner),
    read: async () => parsedLog(await files.read(path), await opts.now()).log,
    update: async change => {
      const result = await files.lock(path, async () => {
        const now = await opts.now()
        const { log, isUnreadable } = parsedLog(await files.read(path), now)
        if (isUnreadable) {
          const aside = `${path}.unreadable-${now}`
          await files.move(path, aside)
          opts.log(`inbox: moved an unreadable command log aside to ${aside}`)
        }
        const next = await change(log)
        if (next === log && !isUnreadable) return { log, isChanged: false }
        const saved = { ...next, writtenAt: Math.max(now, log.writtenAt + 1) }
        const text = JSON.stringify(saved)
        const tmp = `${path}.${now.toString(36)}-${++tmpCount}.tmp`
        await files.write(tmp, text)
        await files.move(tmp, path)
        if ((await files.read(path)) !== text) throw new Error('The command log could not be confirmed saved.')
        return { log: saved, isChanged: true }
      })
      if (result.isChanged) await Promise.resolve(opts.onChange?.()).catch(() => undefined)
      return result.log
    },
  }
}

/**
 * `s` without the command records an earlier build saved in it, once they are in its command log. A host's write
 * runs this before it saves `s`, so the records are never in neither. They stay when the log cannot be written.
 */
export async function movedLegacyCommands<S extends Session>(
  store: CommandStore,
  s: S,
  log: (text: string) => void,
): Promise<S> {
  if (!s.remoteCommands) return s
  try {
    await store.update(current => withLegacy(current, s))
  } catch (err) {
    log(`inbox: the command log could not take the session's commands: ${err instanceof Error ? err.message : err}`)
    return s
  }
  const { remoteCommands: _moved, ...rest } = s

  return rest as S
}

/** What a saved session says about its commands, by command log path, as this process last wrote it to the log. */
const followed = new Map<string, string>()

/**
 * Brings the command log at `key` up to date with `s`, which was just saved, when `s` says something new about its
 * commands. A failure leaves the log behind the session, which every read of the log makes up for.
 */
export async function followCommandRows(
  store: CommandStore,
  key: string,
  s: Session,
  log: (text: string) => void,
): Promise<void> {
  if (!hasCommandRows(s)) return
  const facts = JSON.stringify([
    Object.entries(s.lastActions).flatMap(([row, a]) =>
      a.commandId ? [[row, a.commandId, a.action, a.delivery]] : [],
    ),
    s.ledger.closed.flatMap(c => (c.commandId ? [[c.id, c.commandId, c.doneNotification]] : [])),
  ])
  if (followed.get(key) === facts) return
  try {
    await store.update(current => remoteCommandState(current, s))
    followed.set(key, facts)
  } catch (err) {
    log(`inbox: the command log could not follow the session: ${err instanceof Error ? err.message : err}`)
  }
}
