import { REMOTE_ACTIONS } from '../../core/remote/remote-commands'
import { remoteViewerReceipts } from '../../core/runtime/remote-viewers'
import { readViewers } from './viewers'
import { commandsOf, remoteReceipts } from '../../core/runtime/remote-command-state'
import { codexCommandStore } from './command-log'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isPrFetchRunning, statePath, readState, updateState } from './state'
import { tryWithLock, withLock } from './lock'
import { herdrLog } from './herdr-log'
import type { SessionState } from './state'
import { viewOf } from './core'
import { CODEX } from './texts'
import type { Run } from '../../core/domain/gh'
import { NEXT_BUILD_MARK } from '../../core/view/banners'
import { herdrReporter, herdrReportKey, herdrTarget, herdrTokens } from '../../core/remote/herdr'
import { publishedSession } from '../../core/remote/herdr-app'
import type { PublishFiles } from '../../core/remote/herdr-app'
import type { SessionHost } from '../../core/runtime/session-host'

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
): Pick<SessionHost<SessionState>, 'now' | 'read' | 'readDurable' | 'update' | 'exclusive'> {
  return {
    now,
    read: () => readState(dir, sessionId),
    readDurable: () => readState(dir, sessionId),
    update: async change => {
      const s = await updateState(
        dir,
        sessionId,
        onWrite
          ? async current => ({ ...(await change(current)), writtenAt: Math.max(now(), (current.writtenAt ?? 0) + 1) })
          : change,
        now,
      )
      await onWrite?.(s)

      return s
    },
    exclusive: fn => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn),
  }
}

/** Node's file calls for publishing a session. The move is a rename, which replaces the file in one step. */
const publishFiles: PublishFiles = {
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  move: (from, to) => rename(from, to),
  remove: path => rm(path, { force: true }),
  removeFolder: path => rm(path, { recursive: true, force: true }),
}

/**
 * Reports each written state to the Herdr pane or app terminal in `env`, or is undefined when `env` names neither.
 * Codex runs a hook with its own environment, so the hooks of a Codex CLI in Herdr, and the update a hook starts, know
 * where they run. The MCP server gets the app terminal's variables from `.mcp.json`, so it reports there too, but never
 * to a pane. Problems go to `log`.
 *
 * Hooks and updates run in separate processes, so each report runs under the session's Herdr lock and reads the newest
 * saved state, never the state its own write left. Reports then go out in the order they run, which `hc label` needs
 * since it takes no `seq`. A pane report also carries the state's `writtenAt` as `seq`. In an app terminal, the report
 * first publishes the session for the Herdr look. The session keeps the newest report Herdr took, and a report that
 * would match it sends none. A report that fails to send is not kept, so the next write sends it again.
 */
export function herdrOnWrite(
  env: NodeJS.ProcessEnv,
  run: Run,
  dir: string,
  now: () => number,
  log = herdrLog(dir),
): OnWrite | undefined {
  const target = herdrTarget(env)
  if (!target) return undefined
  const report = herdrReporter(log)

  return async written => {
    const id = written.sessionId
    await withLock(`${statePath(dir, id)}.herdr`, async () => {
      const [s, viewers] = await Promise.all([readState(dir, id), readViewers(dir, id)])
      const commands = await commandsOf(codexCommandStore(dir, id, now), s)
      const at = now()
      const seq = s.writtenAt ?? at
      const isPublished =
        target.kind === 'terminal' &&
        (await publishedSession(
          publishFiles,
          target.appHome,
          {
            receipts: remoteReceipts(commands),
            viewers: remoteViewerReceipts(viewers.leases),
            remoteProtocol: 2,
            remoteActions: REMOTE_ACTIONS,
            remoteHistoryAfter: commands.floor,
            host: 'codex',
            agent: CODEX.agent,
            sessionId: id,
            terminal: target.terminal,
            writtenAt: Math.max(seq, viewers.writtenAt, commands.writtenAt),
            projectFolder: s.root,
            isFetchingPrs: isPrFetchRunning(s),
            version: VERSION,
            isNextBuild: existsSync(join(dirname(dirname(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK)),
          },
          s,
          log,
        ))
      const tokens = herdrTokens(s.ledger, s.stop, viewOf(s, at), [])
      const r = { target, tokens, session: isPublished ? id : null, seq }
      const key = herdrReportKey(r)
      if (key === s.herdrReport?.key) return
      if (!(await report(run, async () => r))) return
      await updateState(dir, id, saved => ({ ...saved, herdrReport: { key, seq } }), now)
    }).catch(() => undefined)
  }
}
