import type { Dialog, Ledger, Stop, Tab } from '../types'
import type { SessionView } from './session'
import { isWaitingRow, ROW_TABS } from './view'

/**
 * The pane tokens the inbox reports to Herdr, by name. A null value clears its token. Herdr takes token names of up to
 * 32 ASCII letters, digits, `-` and `_`, and values of up to 80 characters with control characters removed, so a value
 * carries no color. A sidebar row colors each token it shows, and puts " · " between the tokens that have a value.
 */
export type HerdrTokens = Record<string, string | null>

/** What waits on the person, in one line: a stop, a dialog, the first item's ask, or the Overview's headline. */
const STATUS_TOKEN = 'inbox'

const STOP_TOKEN = 'inbox-stop'

/** Each row tab's token, which holds the tab's symbol and its count, as "🙋 2". */
const COUNT_TOKENS: Record<Tab, string> = {
  needsYou: 'inbox-needs-you',
  findings: 'inbox-findings',
  prs: 'inbox-prs',
}

/** Every token cleared, for a session that ends. */
export const CLEARED_TOKENS: HerdrTokens = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, ...Object.values(COUNT_TOKENS)].map(name => [name, null]),
)

export const HERDR_TIMEOUT_MS = 5000

function stopShort(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return 'Signed out: /login'
    case 'billing':
      return 'Billing problem'
    case 'usage-limit':
      return stop.resets ? `Limit: resets ${stop.resets}` : 'Usage limit reached'
    default:
      return 'API error: resume'
  }
}

function stopLine(stop: Stop): string {
  return `! ${stopShort(stop)}`
}

function dialogText(dialog: Dialog): string {
  return dialog.kind === 'permission' ? `Allow ${dialog.text}?` : dialog.text
}

export function statusLine(ledger: Ledger, stop: Stop | null, dialogs: readonly Dialog[]): string {
  if (stop) return stopLine(stop)
  const dialog = dialogs[0]
  if (dialog) return dialogText(dialog)
  const first = ledger.items[0]
  if (first) return ledger.items.length > 1 ? `${ledger.items.length} · ${first.ask}` : first.ask
  const count = ledger.findings.length
  const findings = count === 0 ? null : `${count} finding${count === 1 ? '' : 's'}`

  return [ledger.overview?.headline, findings].filter(Boolean).join(' · ')
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
  const items = [...view.needsYou.questions, ...view.needsYou.tasks]
    .filter(isWaitingRow)
    .flatMap(r => (r.item ? [r.item] : []))
  const findings = view.findings.rows.filter(isWaitingRow).flatMap(r => (r.finding ? [r.finding] : []))
  const counts = ROW_TABS.map(t => {
    const count = view[t.id].count

    return [COUNT_TOKENS[t.id], stop || count === 0 ? null : `${t.symbol} ${count}`]
  })

  return {
    [STATUS_TOKEN]: statusLine({ ...ledger, items, findings }, stop, dialogs) || null,
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

/** A report for a pane, or null when the session runs in no Herdr pane. */
export type HerdrReport = { pane: string; tokens: HerdrTokens; seq?: number } | null

/**
 * Sends reports one at a time, in the order they were asked for. Each reads its pane and tokens when its turn comes, so
 * a later report never carries older tokens, and a report that would change nothing is skipped.
 */
export function herdrReporter(): (
  send: (args: string[]) => Promise<unknown>,
  report: () => Promise<HerdrReport>,
) => Promise<void> {
  let sent: string | null = null
  let sending: Promise<void> = Promise.resolve()

  return (send, report) => {
    sending = sending
      .then(async () => {
        const r = await report()
        if (!r) return
        const key = herdrReport(r.pane, r.tokens).join('\n')
        if (key === sent) return
        sent = key
        await send(herdrReport(r.pane, r.tokens, r.seq))
      })
      .catch(() => undefined)

    return sending
  }
}
