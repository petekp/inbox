import type { Timer } from 'claude-code'
import type { Dialog, Session, SessionStatus } from '../types'
import type { Run } from './gh'
import {
  CLEARED_TOKENS,
  delegatesInHerdr,
  herdrCheckGate,
  HERDR_CHECK_MS,
  herdrReporter,
  herdrTarget,
  herdrTokens,
} from './herdr'
import type { HerdrAgent } from './herdr'
import {
  followPresses,
  isPublishedHere,
  PRESS_POLL_MS,
  pressDrainer,
  publishedSession,
  unpublishSession,
} from './herdr-app'
import type { ApplyPress, PressFiles, PublishFiles } from './herdr-app'
import { CLAUDE_CODE } from './model-text'
import { sessionView } from './session-view'
import { SETTLED_MS } from './timing'

/** The drawn conversation, as a report reads it when its turn comes. */
type DrawnForHerdr = { id: string; session: Session; dialogs: readonly Dialog[]; isUnread: boolean }

/**
 * The engine calls the mod's Herdr code needs. `env` reads `HERDR_PANE_ID`, `HC_TERMINAL_ID`, `HERDR_APP_HOME` and
 * `HOME`, in that order, because the engine takes only a literal name. `spawn` streams a command's output, and the
 * stream's `return` ends the command.
 */
export type HerdrCalls = {
  run: Run
  env: () => Promise<readonly (string | undefined)[]>
  write: (path: string, text: string) => Promise<void>
  read: (path: string) => Promise<string>
  list: (folder: string) => Promise<readonly { name: string; kind: string }[]>
  spawn: (argv: string[]) => AsyncIterator<{ text: string }, unknown>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => void
  every: (ms: number, fn: () => void) => Timer
  log: (text: string) => void
}

const FILE_TIMEOUT_MS = 5000

let logReport: (text: string) => void = () => undefined
const reportToHerdr = herdrReporter(text => logReport(text))
const isHerdrCheckDue = herdrCheckGate()

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The engine has no call that moves or removes a file, so those run `mv` and `rm`. A `mv` whose file is gone fails. */
function herdrFiles(calls: HerdrCalls): PublishFiles & PressFiles {
  const runOrThrow = async (argv: string[]) => {
    const r = await calls.run(argv, { cwd: '/', timeoutMs: FILE_TIMEOUT_MS })
    if (r.code !== 0) throw new Error(`${argv[0]} exited ${r.code}: ${r.stderr.trim()}`)
  }

  return {
    write: calls.write,
    read: calls.read,
    list: async folder => (await calls.list(folder)).filter(e => e.kind === 'file').map(e => e.name),
    move: (from, to) => runOrThrow(['mv', '-f', '--', from, to]),
    remove: path => runOrThrow(['rm', '-f', '--', path]),
    removeFolder: path => runOrThrow(['rm', '-rf', '--', path]),
  }
}

async function targetOf(calls: HerdrCalls) {
  const [HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME] = await calls.env()

  return herdrTarget({ HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME })
}

/**
 * Reports the drawn conversation to the Herdr pane or app terminal the session runs in. In an app terminal, each
 * report's turn first publishes the session for the Herdr look, so the files land in the order of the changes. The
 * labels name the session only once its file is written. With `endingId`, the report removes that conversation's file
 * and clears every token and label.
 */
export function publishToHerdr(
  calls: HerdrCalls,
  endingId: string | null,
  drawn: () => Promise<DrawnForHerdr>,
): Promise<boolean> {
  const files = herdrFiles(calls)
  const logFailure = (err: unknown) => calls.log(`Herdr publish failed: ${message(err)}`)
  logReport = calls.log

  return reportToHerdr(
    calls.run,
    async () => {
      const target = await targetOf(calls)
      if (!target) return null
      const appHome = target.kind === 'terminal' ? target.appHome : null
      if (endingId !== null) {
        if (appHome) await unpublishSession(files, appHome, endingId).catch(logFailure)

        return { target, tokens: CLEARED_TOKENS, session: null }
      }
      const [{ id, session, dialogs, isUnread }, now] = await Promise.all([drawn(), calls.now()])
      const isPublished =
        target.kind === 'terminal' &&
        (await publishedSession(
          files,
          appHome,
          {
            host: 'claude-code',
            agent: CLAUDE_CODE.agent,
            sessionId: id,
            terminal: target.terminal,
            writtenAt: now,
            projectFolder: session.place?.folder,
          },
          session,
          calls.log,
        ))
      const view = sessionView(session, now, SETTLED_MS)
      const tokens = herdrTokens(session.ledger, session.stop, view, dialogs, isUnread)

      return { target, tokens, session: isPublished ? id : null }
    },
    calls.after,
  )
}

/** The value of `inbox.press` in one line of `hc events` output about `terminal`, or null when the line has none. */
function wakeLabelIn(line: string, terminal: string): string | null {
  try {
    const event = JSON.parse(line) as { params?: { type?: string; terminal?: string; data?: { labels?: unknown } } }
    const params = event.params
    const labels = params?.type === 'labels' && params.terminal === terminal ? params.data?.labels : null
    const value = labels && typeof labels === 'object' ? (labels as Record<string, unknown>)['inbox.press'] : null

    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

/**
 * In a Herdr app terminal, applies the presses the Herdr look writes for the conversation `sessionId` names, while its
 * published file names this terminal. After writing a press file, the look sets the `inbox.press` label on the
 * terminal. The mod follows the terminal's label changes with `hc events`, and reads the press folder at once, when
 * `hc events` first prints, when the label changes, and every `PRESS_POLL_MS`, in case it missed one. Resolves with how
 * to stop. Outside an app terminal it does nothing.
 */
export async function listenForHerdrPresses(
  calls: HerdrCalls,
  sessionId: () => string,
  apply: ApplyPress,
): Promise<() => void> {
  const target = await targetOf(calls)
  const appHome = target?.kind === 'terminal' ? target.appHome : null
  if (target?.kind !== 'terminal' || !appHome) return () => undefined
  const { terminal } = target
  const drain = pressDrainer(
    herdrFiles(calls),
    id => isPublishedHere(calls.read, appHome, id, 'claude-code', terminal),
    apply,
    calls.log,
  )

  return followPresses(
    () => drain(appHome, sessionId()),
    wake => followWakeLabel(calls, target, wake),
    (ms, fn) => {
      const timer = calls.every(ms, fn)
      return () => timer.cancel()
    },
    calls.log,
  )
}

/**
 * Follows the terminal's `inbox.press` label with `hc events`, and calls `wake` each time it changes. An `hc` that does
 * not start, or ends before it prints, as one without `events` does, gives way to the next. When every `hc` has ended,
 * the mod follows again after `PRESS_POLL_MS`.
 */
function followWakeLabel(calls: HerdrCalls, target: { terminal: string; hc: readonly string[] }, wake: () => void) {
  let isStopped = false
  let events: AsyncIterator<{ text: string }, unknown> | null = null
  let lastWake: string | null = null

  const followWith = async (hc: string): Promise<boolean> => {
    let hasPrinted = false
    let pending = ''
    try {
      const stream = calls.spawn([hc, 'events', '--terminal', target.terminal])
      events = stream
      for (let piece = await stream.next(); !piece.done; piece = await stream.next()) {
        if (!hasPrinted) wake()
        hasPrinted = true
        const lines = (pending + piece.value.text).split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          const value = wakeLabelIn(line, target.terminal)
          if (value && value !== lastWake) wake()
          if (value) lastWake = value
        }
      }
    } catch (err) {
      calls.log(`Herdr presses: ${hc} events failed: ${message(err)}`)
    }

    return hasPrinted
  }
  const follow = async () => {
    for (const hc of target.hc) if (isStopped || (await followWith(hc))) break
    if (!isStopped) calls.after(PRESS_POLL_MS, () => void follow())
  }
  void follow()

  return () => {
    isStopped = true
    void events?.return?.()
  }
}

/** What the delegate check reads and changes, for the conversation drawn when it was built. */
type DelegateCalls = {
  run: Run
  now: () => Promise<number>
  ownerId: string
  overview: () => Promise<SessionStatus | null>
  /** Whether the pane still shows the Status, outside the sample. */
  isStatusShown: () => Promise<boolean>
  settle: (agents: ReadonlyMap<string, HerdrAgent>, at: number) => Promise<unknown>
}

async function checkDelegates(calls: DelegateCalls) {
  if (!isHerdrCheckDue(calls.ownerId, await calls.now())) return
  const agents = await delegatesInHerdr(await calls.overview(), calls.run)
  if (agents) await calls.settle(agents, await calls.now())
}

/**
 * Asks Herdr about the running delegates each `HERDR_CHECK_MS` while the Status shows, and once as it starts to
 * show, so a delegate's row follows Herdr while this session waits. The first tick after the Status stops showing
 * stops the timer, which `state` holds between calls.
 */
export function followDelegates(
  isShown: boolean,
  state: { herdrCheckTimer: Timer | null },
  every: HerdrCalls['every'],
  delegateCalls: () => DelegateCalls,
) {
  const stop = () => {
    state.herdrCheckTimer?.cancel()
    state.herdrCheckTimer = null
  }
  if (!isShown) return stop()
  void checkDelegates(delegateCalls()).catch(() => undefined)
  state.herdrCheckTimer ??= every(HERDR_CHECK_MS, () => {
    const calls = delegateCalls()
    void calls
      .isStatusShown()
      .then(isStillShown => (isStillShown ? checkDelegates(calls) : stop()))
      .catch(() => undefined)
  })
}
