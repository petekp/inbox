import type { Closed, ClosedFinding, Finding, Item, Ledger } from '../types'
import { keyWords, restates } from './ask-match'
import type { Host } from './model-text'

const MAX_CLOSED = 12

export function closedRecord(item: Item, closing: Closing, now: number): Closed {
  const { id, kind, ask, label } = item

  return { id, kind, ask, ...(label ? { label } : {}), ...closing, at: now, item }
}

function closedFindingRecord(finding: Finding, closing: Closing, now: number, askedAs?: string): ClosedFinding {
  return { ...finding, ...(askedAs ? { askedAs } : {}), ...closing, closedAt: now }
}

/**
 * Closes an open item or finding for the agent: one the user answered in their
 * own message, with that answer as its outcome, or one that is done or no
 * longer applies, with the agent's reason. A finding moves to
 * `closedFindings` the same way. `closed` is null when no open one has the id.
 * Its `how` is the stored value 'claude' for either agent.
 */
export function closeByAgent(
  host: Host,
  ledger: Ledger,
  id: string,
  how: { answer: string } | { reason: string },
  now: number,
): { ledger: Ledger; closed: { item: Item } | { finding: Finding } | null } {
  const closing: Closing =
    'answer' in how
      ? { how: 'answered', outcome: how.answer }
      : { how: 'claude', outcome: `closed by ${host.agent}: ${how.reason}` }
  const item = ledger.items.find(i => i.id === id)
  if (item) return { ledger: closeItem(ledger, id, closing, now), closed: { item } }
  const finding = ledger.findings.find(f => f.id === id)
  if (finding) return { ledger: closeFinding(ledger, id, closing, now), closed: { finding } }

  return { ledger, closed: null }
}

type Closing = Pick<Closed, 'how' | 'outcome'>

export function closeItem(ledger: Ledger, id: string, closing: Closing, now: number): Ledger {
  const records = ledger.items.filter(i => i.id === id).map(i => closedRecord(i, closing, now))

  return reopenAskedFindings(
    { ...ledger, items: ledger.items.filter(i => i.id !== id), closed: [...ledger.closed, ...records] },
    records,
  )
}

/** `askedAs` is the id of the item that replaces the finding, kept on its close record. */
export function closeFinding(ledger: Ledger, id: string, closing: Closing, now: number, askedAs?: string): Ledger {
  const finding = ledger.findings.find(f => f.id === id)
  if (!finding) return ledger

  return {
    ...ledger,
    findings: ledger.findings.filter(f => f.id !== id),
    closedFindings: [...ledger.closedFindings, closedFindingRecord(finding, closing, now, askedAs)],
  }
}

const SHARED_TITLE_WORDS = 2
const PUT_OFF = /\b(?:not (?:now|yet)|put off|for later|postpone|defer)/i

/** A close that leaves the work undone: the person dismissed it, it expired or no longer applies, or they put it off. */
function leavesWorkOpen(c: Pick<Closed, 'how' | 'outcome'>): boolean {
  return c.how !== 'done' && (isLapsed(c) || PUT_OFF.test(c.outcome))
}

/** Reopens each finding that a question now closed without the work done had replaced. */
export function reopenAskedFindings(ledger: Ledger, closes: Closed[]): Ledger {
  return closes.filter(leavesWorkOpen).reduce((l, c) => {
    const record = l.closedFindings.findLast(f => f.askedAs === c.id)
    if (!record) return l
    const reopened = reopenFinding(l, record.id)

    return {
      ...reopened,
      findings: reopened.findings.map(f => {
        const { askedAs: _askedAs, ...rest } = f

        return f.id === record.id ? rest : f
      }),
    }
  }, ledger)
}

function prNumbers(text: string): Set<string> {
  return new Set([...text.matchAll(/(?:#|\bPR\s*#?|\/pull\/)(\d+)/gi)].map(m => m[1]!))
}

/**
 * Whether an item asks about a finding: its label is the finding's id, or its ask restates the finding's title or
 * detail or both name a pull request number. A claimed link (the inbox model's ASKED line) also passes when the ask shares
 * two key words with the title.
 */
export function asksAbout(item: Pick<Item, 'ask' | 'label'>, finding: Finding, isClaimed = false): boolean {
  if (item.label === finding.id) return true
  if (restates(finding.title, item.ask) || restates(finding.detail, item.ask)) return true
  if (isClaimed) {
    const known = keyWords(finding.title)
    if ([...keyWords(item.ask)].filter(w => known.has(w)).length >= SHARED_TITLE_WORDS) return true
  }
  const itemPrs = prNumbers(`${item.label ?? ''} ${item.ask}`)

  return [...prNumbers(`${finding.title} ${finding.detail}`)].some(n => itemPrs.has(n))
}

/**
 * Cuts each closed list to its newest MAX_CLOSED records, and keeps every older record whose id is in `keep`.
 * closeItem, closeFinding and applyUpdate do not cut, so each host runs this on every ledger it commits.
 */
export function pruneClosed(ledger: Ledger, keep: ReadonlySet<string>): Ledger {
  const pruned = <T extends { id: string }>(records: T[]) =>
    records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id))

  return { ...ledger, closed: pruned(ledger.closed), closedFindings: pruned(ledger.closedFindings) }
}

function idNumber(id: string): number {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN)
}

/**
 * Order matters: answerNote reads the batch by position, and expiry
 * keeps the last MAX_OPEN items.
 */
function inIdOrder<T extends { id: string }>(open: T[], entry: T): T[] {
  const at = open.findIndex(x => idNumber(x.id) > idNumber(entry.id))

  return at < 0 ? [...open, entry] : [...open.slice(0, at), entry, ...open.slice(at)]
}

/**
 * Reopens a closed item from the item its close record kept, and removes the
 * record. Unchanged when the item is open, or no record of it kept the item.
 */
export function reopenItem(ledger: Ledger, id: string): Ledger {
  const item = ledger.closed.findLast(c => c.id === id)?.item
  if (!item || ledger.items.some(i => i.id === id)) return ledger

  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter(c => c.id !== id) }
}

/** Reopens a closed finding and removes its close record. Unchanged when it is open or has no record. */
export function reopenFinding(ledger: Ledger, id: string): Ledger {
  const record = ledger.closedFindings.findLast(f => f.id === id)
  if (!record || ledger.findings.some(f => f.id === id)) return ledger
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record

  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter(f => f.id !== id),
  }
}

export const OVERTAKEN_OUTCOMES = 'no longer applies|replaced|superseded|moot'
const OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, 'i')

export type ClosedState = 'handled' | 'dismissed' | 'lapsed'

export function closedState(d: Pick<Closed, 'how' | 'outcome'>): ClosedState {
  if (d.how === 'dismissed') return 'dismissed'
  if (d.how === 'expired') return 'lapsed'
  // The agent's close and the per-reply update write their own outcome, so only its wording says the work
  // overtook the item. An agent's close reads "closed by <agent>: <reason>".
  const isOvertaken = OVERTAKEN.test(d.outcome)

  return (d.how === 'claude' || d.how === 'update') && isOvertaken ? 'lapsed' : 'handled'
}

/** When a closed item or finding closed. */
export function closedAt(c: Closed | ClosedFinding): number {
  return 'closedAt' in c ? c.closedAt : c.at
}

function isLapsed(d: Pick<Closed, 'how' | 'outcome'>): boolean {
  return closedState(d) !== 'handled'
}
