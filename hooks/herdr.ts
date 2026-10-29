import type { Dialog, Ledger, SessionStatus, StatusHead, Stop, Tab } from '../types'
import { hasRunningDelegate, onceEvery } from './children'
import type { Run } from './gh'
import type { SessionView } from './session'
import { isWaitingRow, ROW_TABS } from './view'

/**
 * The pane tokens the inbox reports to Herdr, by name. A null value clears its token. Herdr takes token names of up to
 * 32 ASCII letters, digits, `-` and `_`, and values of up to 80 characters with control characters removed, so a value
 * carries no color. A sidebar row colors each token it shows, and puts " · " between the tokens that have a value.
 */
export type HerdrTokens = Record<string, string | null>

/** What waits on the person, in one line: a stop, a dialog, the first item's ask, or the session's focus from the Status head. */
const STATUS_TOKEN = 'inbox'

const STOP_TOKEN = 'inbox-stop'

/** Each row tab's token, which holds the tab's count alone, as "2". The README's Herdr config colors each count by its tab. */
const COUNT_TOKENS: Record<Tab, string> = {
  needsYou: 'inbox-needs-you',
  findings: 'inbox-findings',
  prs: 'inbox-prs',
}

/** Every token cleared, for a session that ends. */
export const CLEARED_TOKENS: HerdrTokens = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, ...Object.values(COUNT_TOKENS)].map(name => [name, null]),
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

/** How often a host asks Herdr about running delegates while its Status shows. */
export const HERDR_CHECK_MS = 30_000

/**
 * What Herdr shows each named agent doing, asked only while `o` holds a running delegate. Null when none runs, or
 * Herdr gave no answer. Herdr finds its session from the pane's environment, not the folder, so the command runs in
 * `/`, which always exists.
 */
export async function delegatesInHerdr(o: SessionStatus | null, run: Run): Promise<Map<string, HerdrStatus> | null> {
  if (!hasRunningDelegate(o)) return null
  const r = await run(HERDR_AGENT_LIST, { cwd: '/', timeoutMs: HERDR_TIMEOUT_MS })

  return r.code === 0 ? herdrStatuses(r.stdout) : null
}

/** Each named agent's status in what `herdr agent list` printed. Null when its output cannot be read. */
function herdrStatuses(stdout: string): Map<string, HerdrStatus> | null {
  try {
    const agents: unknown = JSON.parse(stdout)?.result?.agents
    if (!Array.isArray(agents)) return null
    const statusOf = (a: { agent_status?: unknown }) => HERDR_STATUSES.find(s => s === a?.agent_status) ?? 'unknown'

    return new Map(agents.filter(a => typeof a?.name === 'string').map(a => [a.name as string, statusOf(a)]))
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
 * wait, and what the session is focused on.
 */
export type StatusInput = { firstAsk: string | null; asks: number; findings: number; focus: string | null }

export function statusLine(stop: Stop | null, dialogs: readonly Dialog[], input: StatusInput): string {
  if (stop) return stopLine(stop)
  const dialog = dialogs[0]
  if (dialog) return dialogText(dialog)
  const { firstAsk, asks, findings, focus } = input
  if (firstAsk !== null) return asks > 1 ? `${asks} · ${firstAsk}` : firstAsk
  const findingsText = findings === 0 ? null : `${findings} finding${findings === 1 ? '' : 's'}`

  return [focus, findingsText].filter(Boolean).join(' · ')
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
): HerdrTokens {
  const input: StatusInput = {
    firstAsk: [...view.needsYou.questions, ...view.needsYou.tasks].find(isWaitingRow)?.title ?? null,
    asks: view.needsYou.count,
    findings: view.findings.count,
    focus: focusOf(ledger.overview?.head ?? null),
  }
  const counts = ROW_TABS.map(t => {
    const count = view[t.id].count

    return [COUNT_TOKENS[t.id], stop || count === 0 ? null : String(count)]
  })

  return {
    [STATUS_TOKEN]: statusLine(stop, dialogs, input) || null,
    [STOP_TOKEN]: stop ? stopLine(stop) : null,
    ...Object.fromEntries(counts),
  }
}

/**
 * The command that sets and clears every token in one report, so the sidebar never shows some tokens updated and others
 * not. Herdr drops a report whose `seq` is not above the last one it took from this source, which orders reports that
 * separate processes send.
 */
export function herdrReport(pane: string, tokens: HerdrTokens, seq?: number): string[] {
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
export type HerdrReport = { pane: string; tokens: HerdrTokens; seq?: number } | null

/**
 * Sends reports one at a time, in the order they were asked for, with `run`. Each reads its pane and tokens when its
 * turn comes, so a later report never carries older tokens, and a report that would change nothing is skipped. Herdr
 * finds the pane from its id, so the command runs in `/`, as `delegatesInHerdr` does.
 */
export function herdrReporter(): (run: Run, report: () => Promise<HerdrReport>) => Promise<void> {
  let sent: string | null = null
  let sending: Promise<void> = Promise.resolve()

  return (run, report) => {
    sending = sending
      .then(async () => {
        const r = await report()
        if (!r) return
        const key = herdrReportKey(r.pane, r.tokens)
        if (key === sent) return
        sent = key
        await run(herdrReport(r.pane, r.tokens, r.seq), { cwd: '/', timeoutMs: HERDR_TIMEOUT_MS })
      })
      .catch(() => undefined)

    return sending
  }
}
