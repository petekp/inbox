import { statePath, readState, tryWithLock, updateState } from './state'
import type { SessionState } from './state'
import { viewOf } from './core'
import type { Run } from '../../hooks/gh'
import { herdrReporter, herdrReportKey, herdrTokens } from '../../hooks/herdr'
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
 * The session keeps the newest report sent, and a write whose report would match it sends none. The MCP server writes
 * without reporting, so the next hook reports what it changed.
 */
export function herdrOnWrite(env: NodeJS.ProcessEnv, run: Run, dir: string, now: () => number): OnWrite {
  const pane = env.HERDR_PANE_ID
  const report = herdrReporter()

  return async s => {
    if (!pane) return
    const seq = now()
    const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, seq), [])
    const key = herdrReportKey(pane, tokens)
    if (key === s.herdrReport?.key) return
    await report(run, async () => ({ pane, tokens, seq }))
    await updateState(dir, s.sessionId, saved =>
      saved.herdrReport && saved.herdrReport.seq >= seq ? saved : { ...saved, herdrReport: { key, seq } },
    )
  }
}
