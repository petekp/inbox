import { EMPTY_LOG } from '../core/runtime/remote-command-state'
import type { CommandLog, CommandRunner, CommandStore } from '../core/runtime/remote-command-state'

export function memoryCommandStore(isRunning: (runner: CommandRunner) => boolean = () => true): CommandStore {
  let log: CommandLog = EMPTY_LOG
  let writing: Promise<unknown> = Promise.resolve()

  return {
    runner: { id: 'this-process', startedAt: 0 },
    isRunning: async runner => isRunning(runner),
    read: async () => log,
    update: change => {
      const result = writing.then(async () => {
        log = await change(log)
        return log
      })
      writing = result.catch(() => undefined)
      return result
    },
  }
}
