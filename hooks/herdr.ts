import type { Dialog, Ledger, Session, SessionStatus, StatusHead, Stop, Tab } from '../types'
import { hasRunningDelegate, onceEvery } from './children'
import type { ClientId } from './clients'
import type { PrPress } from './pr-press'
import type { RowPress } from './presses'
import { emptySession } from './session-files'
import type { Holds } from './timing'
import type { Run } from './gh'
import type { SessionView } from './session-view'
import { isWaitingRow } from './rows'
import { ROW_TABS } from './tabs'

/**
 * The pane tokens the inbox reports to Herdr, by name. A null value clears its token. Herdr takes token names of up to
 * 32 ASCII letters, digits, `-` and `_`, and values of up to 80 characters with control characters removed, so a value
 * carries no color. A sidebar row colors each token it shows, and puts " · " between the tokens that have a value.
 */
type HerdrTokens = Record<string, string | null>

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
type StatusInput = { firstAsk: string | null; asks: number; findings: number; focus: string | null }

function statusLine(stop: Stop | null, dialogs: readonly Dialog[], input: StatusInput): string {
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
type HerdrReport = { pane: string; tokens: HerdrTokens; seq?: number } | null

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

/**
 * Where a host reports: a pane of Herdr's terminal multiplexer, which sets `HERDR_PANE_ID`, or a terminal of the Herdr
 * app, which sets `HC_TERMINAL_ID`. Null outside Herdr.
 */
export type HerdrTarget = { kind: 'pane'; pane: string } | { kind: 'terminal'; terminal: string } | null

export function herdrTarget(env: Readonly<Record<string, string | undefined>>): HerdrTarget {
  const pane = env.HERDR_PANE_ID
  if (pane) return { kind: 'pane', pane }
  const terminal = env.HC_TERMINAL_ID

  return terminal ? { kind: 'terminal', terminal } : null
}

/**
 * The tokens as labels on a Herdr app terminal, for `hc label`: `inbox.status`, `inbox.stop`, and a count label per row
 * tab, such as `inbox.needs-you`. An empty value removes its label.
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
const HERDR_FORMAT = 1

/** Who publishes a session for the Herdr look, and when. `agent` is the name the shared texts use, as in "Tell Claude". */
export type EnvelopeSource = { host: ClientId; agent: string; sessionId: string; terminal: string; writtenAt: number }

/** The file a host publishes for the Herdr look. */
export type HerdrEnvelope = EnvelopeSource & { format: typeof HERDR_FORMAT; session: Session }

const SESSION_FIELDS = Object.keys(emptySession())

/** The envelope for `session`, which keeps only the shared `Session` fields, without a host's own. */
export function herdrEnvelope(source: EnvelopeSource, session: Session): HerdrEnvelope {
  const shared = Object.fromEntries(SESSION_FIELDS.map(field => [field, session[field as keyof Session]]))

  return { format: HERDR_FORMAT, ...source, session: shared as Session }
}

/** A press the Herdr look made, with the look's holds, which `press()` needs to tell a stale press. */
export type PressFile = {
  format: typeof HERDR_FORMAT
  id: string
  pressedAt: number
  press: RowPress | PrPress
  holds: Holds
}

/** The field that names what each press acts on: a row's `id`, a PR's `ref`, or none for the PRs tab's own buttons. */
const PRESS_TARGETS: Record<RowPress['action'] | PrPress['action'], 'id' | 'ref' | null> = {
  answer: 'id',
  type: 'id',
  explain: 'id',
  compare: 'id',
  done: 'id',
  dismiss: 'id',
  address: 'id',
  issue: 'id',
  discuss: 'id',
  undo: 'id',
  discard: 'id',
  step: 'id',
  'thread-address': 'ref',
  'thread-draft': 'ref',
  'thread-discuss': 'ref',
  'thread-open': 'ref',
  'pr-conflicts': 'ref',
  'pr-address-all': 'ref',
  'pr-merge': 'ref',
  'pr-open': 'ref',
  'pr-refresh': 'ref',
  'pr-dismiss': 'ref',
  'pr-undo': 'ref',
  'check-fix': 'ref',
  log: 'ref',
  'pr-dismiss-merged': null,
  'pr-rank-again': null,
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

const isTimes = (x: unknown): x is Record<string, number> =>
  isRecord(x) && Object.values(x).every(at => typeof at === 'number')

/** Why `press` is not a press the hosts know, or null when it is one. */
function pressProblem(press: unknown): string | null {
  if (!isRecord(press) || typeof press.action !== 'string') return 'press has no action'
  if (!Object.hasOwn(PRESS_TARGETS, press.action)) return `unknown action ${press.action}`
  const target = PRESS_TARGETS[press.action as keyof typeof PRESS_TARGETS]

  return target === null || typeof press[target] === 'string' ? null : `${press.action} has no ${target}`
}

/** Why `holds` are not a look's holds, or null when they are. */
function holdsProblem(holds: unknown): string | null {
  if (!isRecord(holds)) return 'no holds'
  if (!isTimes(holds.replies) || !isTimes(holds.discarded)) return 'holds without replies or discarded times'

  return holds.shownSince === null || typeof holds.shownSince === 'number' ? null : 'holds without shownSince'
}

/** A press file's text, read and checked. `reason` says why a file was refused. */
export function pressFile(text: string): { ok: true; file: PressFile } | { ok: false; reason: string } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
  if (!isRecord(file)) return { ok: false, reason: 'not an object' }
  if (file.format !== HERDR_FORMAT) return { ok: false, reason: `unknown format ${String(file.format)}` }
  if (typeof file.id !== 'string' || file.id === '') return { ok: false, reason: 'no id' }
  if (typeof file.pressedAt !== 'number' || !Number.isFinite(file.pressedAt))
    return { ok: false, reason: 'no pressedAt' }
  const reason = pressProblem(file.press) ?? holdsProblem(file.holds)

  return reason ? { ok: false, reason } : { ok: true, file: file as PressFile }
}
