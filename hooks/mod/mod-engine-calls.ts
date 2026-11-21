import type { CommandCalls } from './mod-commands'
import type { Owner } from './mod-sessions'
import type { RecordFiles, StatusRecords } from '../../core/runtime/status-records'

/** The engine calls the mod's commands and its Status call records need, which `register.tsx` binds from `$`. */
export type EngineCalls = CommandCalls & {
  write: (path: string, text: string) => Promise<void>
  list: (folder: string) => Promise<{ name: string }[]>
  home: () => Promise<string | null | undefined>
  configDir: () => Promise<string | null | undefined>
}

/** The engine has no call that removes a file, so removing runs `rm` and `rmdir`. */
function recordFiles(calls: EngineCalls): RecordFiles {
  return {
    write: calls.write,
    list: async folder => (await calls.list(folder).catch(() => [])).map(entry => entry.name),
    removeFiles: async paths => void (await calls.run(['rm', '-f', '--', ...paths], { cwd: '/' })),
    removeFolder: async path => void (await calls.run(['rmdir', '--', path], { cwd: '/' })),
  }
}

/** Claude Code's configuration folder: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export async function configFolder(calls: EngineCalls): Promise<string | null> {
  const home = await calls.home()

  return (await calls.configDir()) || (home ? `${home}/.claude` : null)
}

/** The folder a next build keeps its Status call records in, under Claude Code's configuration folder. */
export async function recordsFolder(calls: EngineCalls): Promise<string | null> {
  const config = await configFolder(calls)

  return config ? `${config}/plugins/data/inbox/overview-calls` : null
}

export function statusRecords(calls: EngineCalls, folder: string, owner: Owner): StatusRecords {
  return { host: 'claude-code', folder, session: owner.id, files: recordFiles(calls) }
}
