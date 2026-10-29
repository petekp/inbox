import { spawn } from 'node:child_process'

/** The update process's mode that runs only the Status call a hook claimed for the running turn. */
export const STATUS_REFRESH = 'status-refresh'

/**
 * Starts the update in a detached process, so a model call longer than the hook's limit still finishes. With `mode`
 * `STATUS_REFRESH`, the process runs only the Status call for the running turn.
 */
export function detachedUpdate(
  dir: string,
  env: NodeJS.ProcessEnv,
  script: string,
): (sessionId: string, mode?: typeof STATUS_REFRESH) => void {
  return (sessionId, mode) => {
    const child = spawn(process.execPath, [script, sessionId, ...(mode ? [mode] : [])], {
      detached: true,
      stdio: 'ignore',
      env: { ...env, INBOX_DATA: dir },
    })
    child.unref()
  }
}
