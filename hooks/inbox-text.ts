import type { Closed, Finding, Item, Ledger, Told } from '../types'
import { NL, outcomeText } from './ledger-prompt'
import type { Host } from './model-text'
import { isOpen } from './status-limits'

export const START_TITLE =
  'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.'

function surfaceAtStart(host: Host): string {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1)
}

/** The tab the inbox shows: its label, and whether it shows a page instead of rows. */
export type ScreenTab = { label: string; isPage: boolean }

export function screenText(host: Host, isOpen: boolean, tab: ScreenTab | null): string {
  if (!isOpen) return `${surfaceAtStart(host)} is closed.`
  if (tab?.isPage)
    return `${surfaceAtStart(host)} is open beside the conversation, on its ${tab.label} tab, which shows a guide to the session's work, not rows.`

  return `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab.label} tab, ` : ''}listing every open item.`
}

export function latestBatch(ledger: Ledger): Item[] {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter(i => i.turn === ledger.batchTurn)
}

function describe(item: Item): string {
  const parts = [`"${item.ask}"`]
  if (item.options.length > 0) parts.push(`options: ${item.options.join(' / ')}`)
  if (item.rec) parts.push(`recommended: ${item.rec}`)
  if (item.kind === 'task') parts.push('an action for the user')

  return parts.join('; ')
}

function numberOf(label: string | null): number | null {
  const m = label?.match(/(?:^|[^A-Za-z\d])(?:[QqDd#]\s?)?(\d{1,2})(?!\d)/)

  return m ? Number(m[1]) : null
}

function answerableBatch(ledger: Ledger, promptTurn: number): Item[] {
  return ledger.batchTurn === promptTurn - 1 ? latestBatch(ledger) : []
}

function batchNumbers(batch: Item[]): Map<number, Item> {
  const hasLabels = batch.some(i => numberOf(i.label) !== null)
  const byNumber = new Map<number, Item>()
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1
    if (n !== null && !byNumber.has(n)) byNumber.set(n, item)
  })

  return byNumber
}

export function questionNumbers(ledger: Ledger, promptTurn: number): Map<string, number> {
  const numbers = new Map<string, number>()
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === 'question') numbers.set(item.id, n)

  return numbers
}

const LINE_ANSWER = /(?:^|\n)\s*(?:[QqDd#]\s?)?(\d{1,2})\s*[.):\-–]\s*\S/g

const INLINE_ANSWER = /\s(?:[QqDd#]\s?)?(\d{1,2})\s*[.)]\s+\S/g

const ACCEPT_ALL =
  /^\s*(go|go ahead|yes|yep|yeah|sure|ok|okay|sgtm|lgtm|sounds good|do it|proceed|all good|ship it)\s*[.!]*\s*$/i

const ACCEPT_RECS = /\b(all|both|everything|your)\b[^.\n]{0,40}\b(recommend\w*|recs?|suggest\w*|picks?|calls?)\b/i

export function answerNote(ledger: Ledger, text: string): string | null {
  const lines: string[] = []
  const batch = answerableBatch(ledger, ledger.turn)

  if (batch.length > 0) {
    const numbers = new Set<number>()
    for (const m of text.matchAll(LINE_ANSWER)) numbers.add(Number(m[1]))
    if (/^\s*(?:[QqDd#]\s?)?\d{1,2}\s*[.):\-–]\s/.test(text)) {
      for (const m of text.matchAll(INLINE_ANSWER)) numbers.add(Number(m[1]))
    }
    const byNumber = batchNumbers(batch)
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const item = byNumber.get(n)
      if (item) lines.push(`- ${n} → ${describe(item)}`)
    }
    if (lines.length === 0 && (ACCEPT_ALL.test(text) || ACCEPT_RECS.test(text))) {
      const withRecs = batch.filter(i => i.rec)
      if (withRecs.length > 0) {
        return [
          'inbox: if the user is accepting your recommendations, these are the open ones:',
          ...withRecs.map(i => `- ${i.label ?? '•'} → ${describe(i)}`),
        ].join(NL)
      }
    }
  }

  return lines.length === 0
    ? null
    : ["inbox: the user's message answers these open items from your earlier replies:", ...lines].join(NL)
}

function itemLine(item: Item): string {
  return `- ${item.label ? `(${item.label}) ` : ''}${describe(item)} (close id: ${item.id})`
}

function findingLine(finding: Finding): string {
  return `- ${finding.kind}: ${finding.title} (close id: ${finding.id})`
}

/** What the Status says the session is doing and how it is going. */
function statusSummaryLines(ledger: Ledger): string[] {
  const head = ledger.overview?.head ?? null
  const focus = head ? [head.title, head.description].filter(Boolean).join(': ') : ''
  const open = (ledger.overview?.subjects ?? []).filter(isOpen)

  return [
    ...(focus ? [`Working on: ${focus}`] : []),
    ...(open.length > 0 ? ['Where it stands:', ...open.map(s => `- ${s.name}: ${s.text || '-'} (${s.status})`)] : []),
  ]
}

export const CARRY_TITLE =
  'inbox: where the work stood at the last reply. The "inbox:" text beside this prompt lists what waits on the user and what was closed.'

/** The mod's carry at a conversation's first prompt. The `inbox:` text beside that prompt already lists the open items and the closed ones. */
export function statusCarryText(ledger: Ledger): string | null {
  const lines = statusSummaryLines(ledger)

  return lines.length === 0 ? null : [CARRY_TITLE, ...lines].join(NL)
}

export function carryText(ledger: Ledger, title: string): string | null {
  const findings = ledger.findings
  const lines = statusSummaryLines(ledger)
  if (lines.length === 0 && ledger.items.length === 0 && findings.length === 0) return null
  const out = [title, ...lines]
  if (ledger.items.length > 0) {
    out.push('Waiting on the user:')
    for (const item of ledger.items) out.push(itemLine(item))
  }
  if (findings.length > 0) {
    out.push('Findings you recorded, still open:')
    for (const f of findings) out.push(findingLine(f))
  }
  if (ledger.closed.length > 0) {
    out.push('Recently closed:')
    for (const d of ledger.closed) out.push(`- "${d.ask}" → ${outcomeText(d)}`)
  }

  return out.join(NL)
}

export const CLOSE_ID_RULE = 'A close id is only for the close tool. Never write one in a reply.'

export function inboxText(host: Host, ledger: Ledger, isOpen: boolean): string {
  const out = [
    `inbox: what waits on the user, as of your last reply. Anything not listed here is closed. ${CLOSE_ID_RULE}`,
  ]
  if (ledger.items.length > 0) {
    out.push('Waiting on the user:')
    for (const item of ledger.items) out.push(itemLine(item))
  } else {
    out.push('Nothing is waiting on the user.')
  }
  if (ledger.findings.length > 0) {
    out.push('Findings you recorded, still open:')
    for (const f of ledger.findings) out.push(findingLine(f))
  }
  out.push(isOpen ? `The user has ${host.surface} open beside the conversation.` : `${surfaceAtStart(host)} is closed.`)

  return out.join(NL)
}

export function closedText(closed: Closed[]): string | null {
  if (closed.length === 0) return null
  const advice = (d: Closed) =>
    d.how === 'dismissed'
      ? '. Ask it again only if the user brings it up.'
      : d.how === 'expired'
        ? '. Ask it again if it still matters.'
        : ''

  return [
    'Closed since you last read the inbox:',
    ...closed.map(d => `- "${d.ask}" → ${outcomeText(d)}${advice(d)}`),
  ].join(NL)
}

export const TOLD_NOTHING: Told = { inbox: null, closed: [] }

export function promptNotes(
  host: Host,
  ledger: Ledger,
  prompt: { text: string; isPress: boolean; isOpen: boolean },
  told: Told,
): { notes: string[]; told: Told } {
  const notes: string[] = []
  const answer = prompt.isPress ? null : answerNote(ledger, prompt.text)
  if (answer) notes.push(answer)
  const inbox = inboxText(host, ledger, prompt.isOpen)
  const toldClosed = new Set(told.closed)
  const closed = closedText(ledger.closed.filter(d => !toldClosed.has(d.id)))
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0
  if (!closed && (inbox === told.inbox || (isEmpty && told.inbox === null))) return { notes, told }
  notes.push(closed ? `${inbox}${NL}${closed}` : inbox)

  return { notes, told: { inbox, closed: ledger.closed.map(d => d.id) } }
}
