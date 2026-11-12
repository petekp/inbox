import type { Dialog, HerdrPressOutcome, Ledger, Session, SessionStatus, StatusHead, Stop, Tab } from '../types'
import { bandCounts, isMaybeStale } from './band'
import { MAYBE_STALE_TEXT } from './banners'
import { hasRunningDelegate, onceEvery } from './children'
import type { ClientId } from './clients'
import { emptySession, sessionFile } from './session-files'
import { UNSTARTABLE_CODE } from './gh'
import type { Run } from './gh'
import type { SessionView } from './session-view'
import { isWaitingRow } from './rows'
import { ROW_TABS } from './tabs'
import { clipLabel } from './text'

/**
 * The pane tokens the inbox reports to Herdr, by name. A null value clears its token. Herdr takes token names of up to
 * 32 ASCII letters, digits, `-` and `_`, and values of up to 80 characters with control characters removed, so a value
 * carries no color. A sidebar row colors each token it shows, and puts " · " between the tokens that have a value.
 */
type HerdrTokens = Record<string, string | null>

/** What waits on the person, in one line: a stop, a dialog, the first item's ask, or the session's focus from the Status head. */
const STATUS_TOKEN = 'inbox'

const STOP_TOKEN = 'inbox-stop'

/**
 * What the session is focused on, from the Status head, whatever waits on the person. No sidebar row needs it: a
 * session that runs this one as a Herdr delegate reads it to name the delegate's row.
 */
const FOCUS_TOKEN = 'inbox-focus'

/** The longest token value Herdr takes. */
const HERDR_VALUE_CHARS = 80

/** Each row tab's token, which holds the tab's count alone, as "2". The README's Herdr config colors each count by its tab. */
const COUNT_TOKENS: Record<Tab, string> = {
  needsYou: 'inbox-needs-you',
  findings: 'inbox-findings',
  prs: 'inbox-prs',
}

/** Every token cleared, for a session that ends. */
export const CLEARED_TOKENS: HerdrTokens = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map(name => [name, null]),
)

const HERDR_TIMEOUT_MS = 5000

/** Lists the agents of the Herdr session the host runs in, as JSON. */
const HERDR_AGENT_LIST = ['herdr', 'agent', 'list']

/**
 * What Herdr says an agent does. `blocked` is a question or an approval it shows. `idle` and `done` are both ready for
 * input, and differ only in whether someone focused the agent since it finished. `unknown` does not show that its turn ended.
 */
export type HerdrStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

const HERDR_STATUSES: readonly HerdrStatus[] = ['idle', 'working', 'blocked', 'done', 'unknown']

/** What Herdr shows about an agent: what it does, and the focus its session publishes, if it runs the inbox. */
export type HerdrAgent = { status: HerdrStatus; focus: string | null }

/** How often a host asks Herdr about running delegates while its Status shows. */
export const HERDR_CHECK_MS = 30_000

/**
 * What Herdr shows about each named agent, asked only while `o` holds a running delegate. Null when none runs, or
 * Herdr gave no answer. Herdr finds its session from the pane's environment, not the folder, so the command runs in
 * `/`, which always exists.
 */
export async function delegatesInHerdr(o: SessionStatus | null, run: Run): Promise<Map<string, HerdrAgent> | null> {
  if (!hasRunningDelegate(o)) return null
  const r = await run(HERDR_AGENT_LIST, { cwd: '/', timeoutMs: HERDR_TIMEOUT_MS })

  return r.code === 0 ? herdrAgents(r.stdout) : null
}

/** Each named agent in what `herdr agent list` printed. Null when its output cannot be read. */
function herdrAgents(stdout: string): Map<string, HerdrAgent> | null {
  try {
    const agents: unknown = JSON.parse(stdout)?.result?.agents
    if (!Array.isArray(agents)) return null
    const agentOf = (a: { agent_status?: unknown; tokens?: Record<string, unknown> }): HerdrAgent => {
      const focus = a?.tokens?.[FOCUS_TOKEN]

      return {
        status: HERDR_STATUSES.find(s => s === a?.agent_status) ?? 'unknown',
        focus: typeof focus === 'string' && focus.trim() ? focus.trim() : null,
      }
    }

    return new Map(agents.filter(a => typeof a?.name === 'string').map(a => [a.name as string, agentOf(a)]))
  } catch {
    return null
  }
}

/**
 * Lets a host ask Herdr at most once each `HERDR_CHECK_MS` for each session. Answers true when a check is due at
 * `now`, and counts it as made.
 */
export function herdrCheckGate(): (session: string, now: number) => boolean {
  return onceEvery(HERDR_CHECK_MS)
}

function stopLine(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return '! Signed out: /login'
    case 'billing':
      return '! Billing problem'
    case 'usage-limit':
      return stop.resets ? `! Limit: resets ${stop.resets}` : '! Usage limit reached'
    default:
      return '! API error: resume'
  }
}

function dialogText(dialog: Dialog): string {
  return dialog.kind === 'permission' ? `Allow ${dialog.text}?` : dialog.text
}

/**
 * What the status line reads when no stop or dialog leads it: the first ask that waits, how many asks and findings
 * wait, what the session is focused on, and `MAYBE_STALE_TEXT` when the band shows it.
 */
type StatusInput = {
  firstAsk: string | null
  asks: number
  findings: number
  focus: string | null
  stale: string | null
}

function statusLine(stop: Stop | null, dialogs: readonly Dialog[], input: StatusInput): string {
  if (stop) return stopLine(stop)
  const dialog = dialogs[0]
  if (dialog) return dialogText(dialog)
  const { firstAsk, asks, findings, focus, stale } = input
  if (firstAsk !== null) return asks > 1 ? `${asks} · ${firstAsk}` : firstAsk
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? '' : 's'}`

  return [stale, focus, findingsText].filter(Boolean).join(' · ')
}

/** The head's description, which says what the session does, or its title when it has none. */
function focusOf(head: StatusHead | null): string | null {
  return head ? head.description || head.title : null
}

/**
 * The tokens for a session, with each tab's count as its tab shows it. A tab with nothing waiting clears its token. A
 * stop clears every count: Herdr shortens a token to fit its row, and a 25-column sidebar cuts the stop to "! Signe…"
 * beside two counts.
 */
export function herdrTokens(
  ledger: Ledger,
  stop: Stop | null,
  view: SessionView,
  dialogs: readonly Dialog[],
  isReadFailed = false,
): HerdrTokens {
  const input: StatusInput = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    focus: focusOf(ledger.overview?.head ?? null),
    stale: bandCounts(view).length === 0 && isMaybeStale(view, isReadFailed) ? MAYBE_STALE_TEXT : null,
  }
  const focus = input.focus ? clipLabel(input.focus, HERDR_VALUE_CHARS) : null
  const counts = ROW_TABS.map(t => {
    const count = view[t.id].count

    return [COUNT_TOKENS[t.id], stop || count === 0 ? null : String(count)]
  })

  return {
    [STATUS_TOKEN]: statusLine(stop, dialogs, input) || null,
    [STOP_TOKEN]: stop ? stopLine(stop) : null,
    [FOCUS_TOKEN]: focus,
    ...Object.fromEntries(counts),
  }
}

/**
 * The command that sets and clears every token in one report, so the sidebar never shows some tokens updated and others
 * not. Herdr drops a report whose `seq` is not above the last one it took from this source, which orders reports that
 * separate processes send.
 */
function paneReport(pane: string, tokens: HerdrTokens, seq?: number): string[] {
  return [
    'herdr',
    'pane',
    'report-metadata',
    pane,
    '--source',
    'inbox',
    ...Object.entries(tokens).flatMap(([name, value]) =>
      value === null ? ['--clear-token', name] : ['--token', `${name}=${value}`],
    ),
    ...(seq === undefined ? [] : ['--seq', String(seq)]),
  ]
}

/** The label that names the session a terminal runs, so the Herdr look can find its published file. */
const SESSION_LABEL = 'inbox.session'

/**
 * What a host reports: where, its tokens, and the session whose published file the labels name, which is null when no
 * file holds it, as once it ends. A pane report carries `seq`. An app terminal gets every label in one `hc label` call,
 * which takes no `seq`, with control characters in a value turned to spaces.
 */
type HerdrReport = { target: HerdrTarget; tokens: HerdrTokens; session: string | null; seq?: number }

function reportCommand(r: HerdrReport, hc = 'hc'): string[] {
  if (r.target.kind === 'pane') return paneReport(r.target.pane, r.tokens, r.seq)
  const labels = { [SESSION_LABEL]: r.session ?? '', ...herdrLabels(r.tokens) }

  return [
    hc,
    'label',
    r.target.terminal,
    ...Object.entries(labels).map(([name, value]) => `${name}=${value.replace(/\p{Cc}/gu, ' ')}`),
  ]
}

/** What a report sets, whatever its `seq`. Two reports with the same key show the same sidebar. */
export function herdrReportKey(r: HerdrReport): string {
  return reportCommand({ ...r, seq: undefined }).join('\n')
}

/**
 * The waits before each retry of a failed send, in order. A retry sends the newest report, and a send Herdr takes starts
 * the waits over. After the last wait, only the next report asked for sends again.
 */
export const HERDR_RETRY_MS = [5_000, 30_000, 120_000]

/** Runs `fn` once, `ms` from now. `fn` returns the retry it starts. */
type After = (ms: number, fn: () => Promise<unknown>) => void

/**
 * Sends reports one at a time, in the order they were asked for, with `run`. Each reads its pane and tokens when its
 * turn comes, so a later report never carries older tokens, and a report that would change nothing is skipped. Herdr
 * finds the pane from its id, so the command runs in `/`, as `delegatesInHerdr` does.
 *
 * A report counts as sent only when `run` exits 0. After a failed send, the next report is sent even when it matches
 * the last one. With `after`, a failed send also schedules a retry after the next wait in `HERDR_RETRY_MS`, with one
 * retry waiting at a time. Each call resolves true when Herdr took its report, or the last report Herdr took matches it.
 * With `log`, a failed send logs why, once until a send succeeds or fails another way.
 */
export function herdrReporter(
  log?: (text: string) => void,
): (run: Run, report: () => Promise<HerdrReport | null>, after?: After) => Promise<boolean> {
  let sent: string | null = null
  let retries = 0
  let isRetryWaiting = false
  let sending: Promise<unknown> = Promise.resolve()
  let newest: { run: Run; report: () => Promise<HerdrReport | null>; after?: After } | null = null
  let hcFound: string | null = null
  let logged: string | null = null

  /** Runs the report's command. For an app terminal, it tries each `hc` until one starts, and keeps that one. */
  const runReport = async (run: Run, r: HerdrReport) => {
    const options = { cwd: '/', timeoutMs: HERDR_TIMEOUT_MS }
    if (r.target.kind === 'pane') return run(reportCommand(r), options)
    for (const hc of hcFound ? [hcFound] : r.target.hc) {
      const result = await run(reportCommand(r, hc), options)
      if (result.code === UNSTARTABLE_CODE) continue
      hcFound = hc

      return result
    }

    return null
  }

  const retryLater = (after: After | undefined) => {
    const wait = HERDR_RETRY_MS[retries]
    if (!after || isRetryWaiting || wait === undefined) return
    isRetryWaiting = true
    retries++
    after(wait, () => {
      isRetryWaiting = false

      return newest ? reportToHerdr(newest.run, newest.report, newest.after) : Promise.resolve(false)
    })
  }

  const send = async (run: Run, report: () => Promise<HerdrReport | null>, after: After | undefined) => {
    const r = await report()
    if (!r) return false
    const key = herdrReportKey(r)
    if (key === sent) return true
    sent = null
    const result = await runReport(run, r).catch(() => null)
    const isTaken = result?.code === 0
    const problem = isTaken ? null : reportProblem(r, result)
    if (problem && problem !== logged) log?.(problem)
    logged = problem
    if (isTaken) {
      sent = key
      retries = 0
    } else retryLater(after)

    return isTaken
  }

  const reportToHerdr = (run: Run, report: () => Promise<HerdrReport | null>, after?: After) => {
    newest = { run, report, after }
    const result = sending.then(() => send(run, report, after)).catch(() => false)
    sending = result

    return result
  }

  return reportToHerdr
}

/** Why a report Herdr did not take failed, for a host's log. */
function reportProblem(r: HerdrReport, result: Awaited<ReturnType<Run>> | null): string {
  if (!result && r.target.kind === 'terminal')
    return `Herdr labels not set: no hc started. Tried ${r.target.hc.join(', then ')}.`
  if (!result) return 'Herdr report did not run.'
  const why = result.stderr.trim()

  return `Herdr report failed with exit ${result.code}${why ? `: ${why}` : '.'}`
}

/**
 * Where a host reports: a pane of Herdr's terminal multiplexer, which sets `HERDR_PANE_ID`, or a terminal of the Herdr
 * app, which sets `HC_TERMINAL_ID`. Null outside Herdr. An app terminal also names the app's settings folder, where
 * the host publishes its session, and the `hc` and `herdr-app` commands to try in order: the one on `PATH`, then the
 * one in `~/.local/bin`, where Herdr's installer puts it. The settings folder is null when `HERDR_APP_HOME` or `HOME` is not an
 * absolute path, since a host's file calls and its `mv` can resolve a relative one against different folders.
 */
export type HerdrTarget =
  | { kind: 'pane'; pane: string }
  | { kind: 'terminal'; terminal: string; appHome: string | null; hc: readonly string[]; herdrApp: readonly string[] }

export function herdrTarget(env: Readonly<Record<string, string | undefined>>): HerdrTarget | null {
  const pane = env.HERDR_PANE_ID
  if (pane) return { kind: 'pane', pane }
  const terminal = env.HC_TERMINAL_ID
  if (!terminal) return null
  const home = env.HOME?.startsWith('/') ? env.HOME : null
  const named = env.HERDR_APP_HOME
  const appHome = named ? (named.startsWith('/') ? named : null) : home && `${home}/.config/herdr-app`

  const installed = (name: string) => (home ? [name, `${home}/.local/bin/${name}`] : [name])

  return { kind: 'terminal', terminal, appHome, hc: installed('hc'), herdrApp: installed('herdr-app') }
}

/**
 * The tokens as labels on a Herdr app terminal, for `hc label`. `inbox` becomes `inbox.status`, and each other token's
 * `inbox-` becomes `inbox.`, as in `inbox.needs-you`. An empty value removes its label.
 */
export function herdrLabels(tokens: HerdrTokens): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => [
      name === STATUS_TOKEN ? 'inbox.status' : name.replace(/^inbox-/, 'inbox.'),
      value ?? '',
    ]),
  )
}

/** The format of the session file a host publishes and of the press file the Herdr look writes. */
export const HERDR_FORMAT = 1

/**
 * Who publishes a session for the Herdr look, and when. `agent` is the name the shared texts use, as in "Tell Claude".
 * `projectFolder` is the folder the host opens a relative path against, so the look can open one itself.
 */
export type EnvelopeSource = {
  host: ClientId
  agent: string
  sessionId: string
  terminal: string
  writtenAt: number
  projectFolder?: string
}

/**
 * The file a host publishes for the Herdr look. It has `projectFolder` only when that is an absolute path. `trimmed` is set when the host left out closed items the view does not
 * draw in place, to keep the file under `PUBLISH_LIMIT_BYTES`. `lastPress` is the session's `lastHerdrPress`.
 */
export type HerdrEnvelope = EnvelopeSource & {
  format: typeof HERDR_FORMAT
  trimmed?: true
  lastPress?: HerdrPressOutcome
  session: Session
}

const SESSION_FIELDS = Object.keys(emptySession())

/** The envelope for `session`, which keeps only the shared `Session` fields, without a host's own. */
export function herdrEnvelope(source: EnvelopeSource, session: Session, isTrimmed = false): HerdrEnvelope {
  const shared = Object.fromEntries(SESSION_FIELDS.map(field => [field, session[field as keyof Session]]))

  const { lastHerdrPress } = session
  const { projectFolder, ...rest } = source

  return {
    format: HERDR_FORMAT,
    ...rest,
    ...(projectFolder?.startsWith('/') && { projectFolder }),
    ...(isTrimmed && { trimmed: true }),
    ...(lastHerdrPress && { lastPress: lastHerdrPress }),
    session: shared as Session,
  }
}

/** The folder hosts publish their sessions to for the Herdr look, under the app's settings folder. */
export function publishedSessionsFolder(appHome: string): string {
  return `${appHome}/inbox/sessions`
}

/** Where a host publishes a session for the Herdr look. Throws for an unsafe id. */
export function publishedSessionPath(appHome: string, sessionId: string): string {
  return `${publishedSessionsFolder(appHome)}/${sessionFile(sessionId)}`
}

/** The folder the Herdr look writes a session's presses to. Throws for an unsafe id. */
export function pressFolder(appHome: string, sessionId: string): string {
  sessionFile(sessionId)

  return `${appHome}/inbox/presses/${sessionId}`
}
