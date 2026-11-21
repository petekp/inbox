import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { commandLogPath, fileCommandStore } from '../../core/runtime/command-store'
import type { CommandFiles } from '../../core/runtime/command-store'
import type { CommandRunner, CommandStore } from '../../core/runtime/remote-command-state'
import { missingAsNull } from '../../core/view/session-files'
import { herdrLog } from './herdr-log'
import { withLock } from './lock'

/** This process, as the runner of a command. */
const RUNNER: CommandRunner = { id: String(process.pid), startedAt: Date.now() }

/** Whether the process a runner names still runs. A process this one may not signal still runs. */
async function isRunning(runner: CommandRunner): Promise<boolean> {
  const pid = Number(runner.id)
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/** Where a session's command log is kept: beside its state. */
export function commandsPath(dir: string, sessionId: string): string {
  return commandLogPath(join(dir, 'sessions'), sessionId)
}

const files: CommandFiles = {
  read: path => readFile(path, 'utf8').catch(missingAsNull),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  move: (from, to) => rename(from, to),
  lock: (path, fn) => withLock(`${path}.lock`, fn),
}

/**
 * A session's command log, in a file beside its state. Codex's hook, update and server processes can all save one
 * session, so each change runs under the file's lock. Its problems go to `herdr.log`. `onChange` runs after each
 * change it keeps.
 */
export function codexCommandStore(
  dir: string,
  sessionId: string,
  now: () => number,
  onChange?: () => unknown,
): CommandStore {
  return fileCommandStore(
    files,
    commandsPath(dir, sessionId),
    { runner: RUNNER, isRunning },
    {
      now,
      log: herdrLog(dir),
      onChange,
    },
  )
}

/** Deletes a session's command log, when its state is deleted. */
export function removeCommands(dir: string, sessionId: string): Promise<void> {
  return rm(commandsPath(dir, sessionId), { force: true })
}
