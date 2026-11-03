import { statePath, readState, tryWithLock, updateState } from './state'
import type { SessionState } from './state'
import { viewOf } from './core'
import type { Run } from '../../hooks/gh'
import { herdrReporter, herdrReportKey, herdrTokens } from '../../hooks/herdr'
import type { SessionHost } from '../../hooks/session-host'

/** Reports each state written to the session's Herdr pane, from `herdrOnWrite`. */
export type OnWrite = (s: SessionState) => Promise<void>

/**
 * The members that read and change one session's file. The update lock is a `.updating` file beside it. With `onWrite`,
 * each change sets the state's `writtenAt` for the report, even a change that changes nothing else. Without it, a
 * change that changes nothing writes nothing.
 */
export function codexStore(
  dir: string,
  sessionId: string,
  now: () => number,
  onWrite?: OnWrite,
): Pick<SessionHost<SessionState>, 'now' | 'read' | 'update' | 'exclusive'> {
  return {
    now,
    read: () => readState(dir, sessionId),
    update: async change => {
      const s = await updateState(
        dir,
        sessionId,
        onWrite
          ? async current => ({ ...(await change(current)), writtenAt: Math.max(now(), (current.writtenAt ?? 0) + 1) })
          : change,
      )
      await onWrite?.(s)

      return s
    },
    exclusive: fn => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn),
  }
}

/**
 * Reports each written state to the Herdr pane in `env`, or is undefined when `env` names none. Codex runs a hook with
 * its own environment, so the hooks of a Codex CLI in a Herdr pane, and the update a hook starts, know the pane. Hooks
 * and updates run in separate processes, so each report carries the state's `writtenAt` as `seq`, and Herdr drops one
 * whose `seq` is not above the last it took. The session keeps the newest report Herdr took, and a write whose report
 * would match it sends none. A report that fails to send is not kept, so the next write sends it again. The MCP server
 * writes without reporting, so the next hook reports what it changed.
 */
export function herdrOnWrite(env: NodeJS.ProcessEnv, run: Run, dir: string, now: () => number): OnWrite | undefined {
  const pane = env.HERDR_PANE_ID
  if (!pane) return undefined
  const report = herdrReporter()

  return async s => {
    const at = now()
    const seq = s.writtenAt ?? at
    const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, at), [])
    const key = herdrReportKey(pane, tokens)
    if (key === s.herdrReport?.key) return
    if (!(await report(run, async () => ({ pane, tokens, seq })))) return
    await updateState(dir, s.sessionId, saved =>
      saved.herdrReport && saved.herdrReport.seq >= seq ? saved : { ...saved, herdrReport: { key, seq } },
    )
  }
}
