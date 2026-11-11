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
import type { HerdrAgent, HerdrTarget } from './herdr'
import {
  followPresses,
  isPublishedHere,
  PRESS_POLL_MS,
  pressDrainer,
  publishedSession,
  unpublishSession,
} from './herdr-app'
import type { ApplyPress, PressFiles, PublishFiles } from './herdr-app'
import { hasHerdrMod, herdrPanelOpener, noHerdrModText } from './herdr-open'
import type { HerdrOpened } from './herdr-open'
import type { ModFiles } from './herdr-install'
import { startInHerdrApp } from './herdr-start'
import type { SweepFiles } from './herdr-sweep'
import { CLAUDE_CODE } from './model-text'
import { mod } from './mod-state'
import { sessionView } from './session-view'
import { SETTLED_MS } from './timing'

/** The drawn conversation, as a report reads it when its turn comes. `root` is the folder its opens resolve against. */
type DrawnForHerdr = { id: string; root: string; session: Session; dialogs: readonly Dialog[]; isUnread: boolean }

/**
 * The engine calls the mod's Herdr code needs. `env` reads `HERDR_PANE_ID`, `HC_TERMINAL_ID`, `HERDR_APP_HOME` and
 * `HOME`, in that order, because the engine takes only a literal name. `stat` follows a link and says whether the
 * path is one. `spawn` streams a command's output, and the stream's `return` ends the command. `pluginRoot` is the
 * mod's install folder, which holds the Herdr mod at `herdr/mod/inbox`.
 */
export type HerdrCalls = {
  run: Run
  env: () => Promise<readonly (string | undefined)[]>
  write: (path: string, text: string) => Promise<void>
  read: (path: string) => Promise<string>
  list: (folder: string) => Promise<readonly { name: string; kind: string }[]>
  stat: (path: string) => Promise<{ kind: 'file' | 'dir' | 'other'; isLink: boolean }>
  spawn: (argv: string[]) => AsyncIterator<{ text: string }, unknown>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => void
  every: (ms: number, fn: () => void) => Timer
  log: (text: string) => void
  pluginRoot: string
}

const FILE_TIMEOUT_MS = 5000

let logReport: (text: string) => void = () => undefined
const reportToHerdr = herdrReporter(text => logReport(text))
const isHerdrCheckDue = herdrCheckGate()

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The engine has no call that moves or removes a file, so those run `mv` and `rm`. A `mv` whose file is gone fails. */
function herdrFiles(calls: HerdrCalls): PublishFiles & PressFiles & ModFiles & SweepFiles {
  const runOrThrow = async (argv: string[]) => {
    const r = await calls.run(argv, { cwd: '/', timeoutMs: FILE_TIMEOUT_MS })
    if (r.code !== 0) throw new Error(`${argv[0]} exited ${r.code}: ${r.stderr.trim()}`)
  }

  return {
    write: calls.write,
    read: calls.read,
    list: async folder =>
      (await calls.list(folder)).filter(e => e.kind === 'file' || e.kind === 'dir').map(e => e.name),
    move: (from, to) => runOrThrow(['mv', '-f', '--', from, to]),
    remove: path => runOrThrow(['rm', '-f', '--', path]),
    removeFolder: path => runOrThrow(['rm', '-rf', '--', path]),
    makeFolder: path => runOrThrow(['mkdir', '-p', '--', path]),
    kind: path =>
      calls.stat(path).then(
        s => (s.isLink ? 'link' : s.kind === 'dir' ? 'folder' : s.kind),
        () => null,
      ),
  }
}

const openCalls = (calls: HerdrCalls) => ({
  run: calls.run,
  isFile: (path: string) => calls.stat(path).then(s => s.kind === 'file'),
})

/**
 * The Herdr app terminal the mod runs in, once `targetOf` has read the environment, with whether its app home holds the
 * inbox mod. Null outside an app terminal. `targetOf` runs at turn-on and on every publish, so a press can tell at once
 * whether the Herdr look can open.
 */
let appTerminal: { target: Extract<HerdrTarget, { kind: 'terminal' }>; hasMod: boolean } | null | undefined
const openHerdrPanel = herdrPanelOpener()

async function targetOf(calls: HerdrCalls) {
  const [HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME] = await calls.env()
  const target = herdrTarget({ HERDR_PANE_ID, HC_TERMINAL_ID, HERDR_APP_HOME, HOME })
  appTerminal =
    target?.kind === 'terminal' ? { target, hasMod: await hasHerdrMod(openCalls(calls).isFile, target) } : null

  return target
}

/**
 * In a Herdr app terminal, opens the Herdr look as `herdrPanelOpener` says, and logs why when it does not show. It
 * returns null outside an app terminal, or before the mod has read its environment, and the result itself when the app
 * home has no inbox mod, so in both cases the mod's own open keeps its first await.
 */
export function openInHerdr(calls: HerdrCalls): Promise<HerdrOpened> | HerdrOpened | null {
  if (!appTerminal) return null
  const logged = (opened: HerdrOpened) => {
    if (!opened.isShown) calls.log(opened.text)
    return opened
  }
  if (!appTerminal.hasMod) return logged({ isShown: false, text: noHerdrModText(appTerminal.target) })

  return openHerdrPanel(openCalls(calls), appTerminal.target).then(logged)
}

/**
 * In a Herdr app terminal, keeps the inbox's mod in the app current with the one this install holds, and removes the
 * published sessions no live terminal can show, as `startInHerdrApp` says. The mod runs it as it turns on. A failed
 * install or update shows as a banner until the next turn-on, and `redraw` runs when that banner changes.
 */
export async function startInHerdr(calls: HerdrCalls, redraw: () => unknown): Promise<void> {
  const target = await targetOf(calls)
  if (target?.kind !== 'terminal') return
  const files = herdrFiles(calls)
  const bundled = `${calls.pluginRoot}/herdr/mod/inbox`
  const result = await startInHerdrApp(calls.run, files, target, bundled, await calls.now(), calls.log)
  const failure = result?.is === 'failed' ? result.text : null
  if (failure !== mod.herdrModFailure) {
    mod.herdrModFailure = failure
    redraw()
  }
  if (appTerminal) appTerminal.hasMod = await hasHerdrMod(openCalls(calls).isFile, target)
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
      const [{ id, root, session, dialogs, isUnread }, now] = await Promise.all([drawn(), calls.now()])
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
            projectFolder: root,
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
