import type { Dialog, Ledger, SessionStatus, StatusHead, Stop, Tab } from '../types'
import { bandCounts, isMaybeStale } from './band'
import { MAYBE_STALE_TEXT } from './banners'
import { hasRunningDelegate, onceEvery } from './children'
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
function herdrReport(pane: string, tokens: HerdrTokens, seq?: number): string[] {
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

/** What a report sets, whatever its `seq`. Two reports with the same key show the same sidebar. */
export function herdrReportKey(pane: string, tokens: HerdrTokens): string {
  return herdrReport(pane, tokens).join('\n')
}

/** A report for a pane, or null when the session runs in no Herdr pane. */
type HerdrReport = { pane: string; tokens: HerdrTokens; seq?: number } | null

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
 */
export function herdrReporter(): (run: Run, report: () => Promise<HerdrReport>, after?: After) => Promise<boolean> {
  let sent: string | null = null
  let retries = 0
  let isRetryWaiting = false
  let sending: Promise<unknown> = Promise.resolve()
  let newest: { run: Run; report: () => Promise<HerdrReport>; after?: After } | null = null

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

  const send = async (run: Run, report: () => Promise<HerdrReport>, after: After | undefined) => {
    const r = await report()
    if (!r) return false
    const key = herdrReportKey(r.pane, r.tokens)
    if (key === sent) return true
    sent = null
    const result = await run(herdrReport(r.pane, r.tokens, r.seq), { cwd: '/', timeoutMs: HERDR_TIMEOUT_MS }).catch(
      () => null,
    )
    const isTaken = result?.code === 0
    if (isTaken) {
      sent = key
      retries = 0
    } else retryLater(after)

    return isTaken
  }

  const reportToHerdr = (run: Run, report: () => Promise<HerdrReport>, after?: After) => {
    newest = { run, report, after }
    const result = sending.then(() => send(run, report, after)).catch(() => false)
    sending = result

    return result
  }

  return reportToHerdr
}
