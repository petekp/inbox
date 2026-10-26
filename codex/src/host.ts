import { statePath, readState, tryWithLock, updateState } from './state'
import type { SessionState } from './state'
import { viewOf } from './core'
import type { Run } from '../../hooks/gh'
import { HERDR_TIMEOUT_MS, herdrReporter, herdrTokens } from '../../hooks/herdr'
import type { SessionHost } from '../../hooks/session-host'

/** Runs after each write to the session's file, with the state written. */
export type OnWrite = (s: SessionState) => Promise<void>

/** The members that read and change one session's file. The update lock is a `.updating` file beside it. */
export function codexStore(
  dir: string,
  sessionId: string,
  now: () => number,
  onWrite: OnWrite = async () => {},
): Pick<SessionHost<SessionState>, 'now' | 'read' | 'update' | 'exclusive'> {
  return {
    now,
    read: () => readState(dir, sessionId),
    update: async change => {
      const s = await updateState(dir, sessionId, change)
      await onWrite(s)

      return s
    },
    exclusive: fn => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn),
  }
}

/**
 * Reports each written state to the Herdr pane in `env`. Codex runs a hook with its own environment, so the hooks of a
 * Codex CLI in a Herdr pane, and the update a hook starts, know the pane. Hooks and updates run in separate processes,
 * so each report carries the time of its write as `seq`, and Herdr drops one whose `seq` is not above the last it took.
 */
export function herdrOnWrite(env: NodeJS.ProcessEnv, run: Run, dir: string, now: () => number): OnWrite {
  const pane = env.HERDR_PANE_ID
  const report = herdrReporter()

  return async s => {
    if (!pane) return
    const at = now()
    await report(
      args => run(args, { cwd: dir, timeoutMs: HERDR_TIMEOUT_MS }),
      async () => ({ pane, tokens: herdrTokens(s.ledger, s.stop, viewOf(s, at), []), seq: at }),
    )
  }
}
