import { spawn } from 'node:child_process'

/** The update process's mode that runs only the Overview call a hook claimed for the running turn. */
export const OVERVIEW_REFRESH = 'overview-refresh'

/**
 * Starts the update in a detached process, so a model call longer than the hook's limit still finishes. With `mode`
 * `OVERVIEW_REFRESH`, the process runs only the Overview call for the running turn.
 */
export function detachedUpdate(
  dir: string,
  env: NodeJS.ProcessEnv,
  script: string,
): (sessionId: string, mode?: typeof OVERVIEW_REFRESH) => void {
  return (sessionId, mode) => {
    const child = spawn(process.execPath, [script, sessionId, ...(mode ? [mode] : [])], {
      detached: true,
      stdio: 'ignore',
      env: { ...env, INBOX_DATA: dir },
    })
    child.unref()
  }
}
