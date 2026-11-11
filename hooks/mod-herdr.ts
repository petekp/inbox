import type { Dialog, Session } from '../types'
import type { Run } from './gh'
import { CLEARED_TOKENS, herdrTarget, herdrTokens } from './herdr'
import type { EnvelopeSource } from './herdr'
import { publishSession, unpublishSession } from './herdr-app'
import type { PublishFiles } from './herdr-app'
import { reportToHerdr } from './mod-records'
import { CLAUDE_CODE } from './model-text'
import { sessionView } from './session-view'
import { SETTLED_MS } from './timing'

/** The drawn conversation, as a report reads it when its turn comes. */
export type DrawnForHerdr = { id: string; session: Session; dialogs: readonly Dialog[]; isUnread: boolean }

/**
 * The engine calls a Herdr report needs. `env` reads `HERDR_PANE_ID`, `HC_TERMINAL_ID`, `HERDR_APP_HOME` and `HOME`, in
 * that order, because the engine takes only a literal name.
 */
export type HerdrCalls = {
  run: Run
  env: () => Promise<readonly (string | undefined)[]>
  write: (path: string, text: string) => Promise<void>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => void
  log: (text: string) => void
}

const FILE_TIMEOUT_MS = 5000

/** The engine has no call that moves or removes a file, so those run `mv` and `rm`. */
function publishFiles(calls: HerdrCalls): PublishFiles {
  const runOrThrow = async (argv: string[]) => {
    const r = await calls.run(argv, { cwd: '/', timeoutMs: FILE_TIMEOUT_MS })
    if (r.code !== 0) throw new Error(`${argv[0]} exited ${r.code}: ${r.stderr.trim()}`)
  }

  return {
    write: calls.write,
    move: (from, to) => runOrThrow(['mv', '-f', '--', from, to]),
    remove: path => runOrThrow(['rm', '-f', '--', path]),
  }
}

/**
 * Reports the drawn conversation to the Herdr pane or app terminal the session runs in. In an app terminal, each
 * report's turn first publishes the session for the Herdr look, so the files land in the order of the changes and the
 * labels never name a file not yet written. With `endingId`, the report removes that conversation's file and clears
 * every token and label.
 */
export function publishToHerdr(
  calls: HerdrCalls,
  endingId: string | null,
  drawn: () => Promise<DrawnForHerdr>,
): Promise<boolean> {
  const files = publishFiles(calls)
  const logFailure = (err: unknown) =>
    calls.log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`)

  return reportToHerdr(
    calls.run,
    async () => {
      const [HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME] = await calls.env()
      const target = herdrTarget({ HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME })
      if (!target) return null
      const appHome = target.kind === 'terminal' ? target.appHome : null
      if (endingId !== null) {
        if (appHome) await unpublishSession(files, appHome, endingId).catch(logFailure)

        return { target, tokens: CLEARED_TOKENS, session: null }
      }
      const [{ id, session, dialogs, isUnread }, now] = await Promise.all([drawn(), calls.now()])
      if (target.kind === 'terminal' && appHome) {
        const source: EnvelopeSource = {
          host: 'claude-code',
          agent: CLAUDE_CODE.agent,
          sessionId: id,
          terminal: target.terminal,
          writtenAt: now,
        }
        await publishSession(files, appHome, source, session).catch(logFailure)
      }
      const view = sessionView(session, now, SETTLED_MS)

      return { target, tokens: herdrTokens(session.ledger, session.stop, view, dialogs, isUnread), session: id }
    },
    calls.after,
  )
}
