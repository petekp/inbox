// The inbox as every host draws it: the Needs you order and count, question
// handles, which rows are handed off, and the item status. The band, the pane,
// the sidebar line, row navigation and the Codex tab all read this, so they agree.
// Pure: it reads only its arguments, and imports nothing from the engine.

import type { Finding, Item, LastAction, Ledger } from '../types'
import { latestBatch, questionNumbers } from './ledger'
import { isHandedOff } from './presses'

/** The turn counts a handed-off row folds by. */
export type Turns = { turnsStarted: number; turnsApplied: number }

/** When the item list last changed, whether its source is working, and its error, if any. */
export type ItemStatus = { changedAt: number | null; isUpdating: boolean; error: string | null }

export type ViewInput = {
  ledger: Ledger
  /** Each row's last press. Only the hand-off fields are read, so Codex's own last actions fit too. */
  lastActions: Record<string, Pick<LastAction, 'isHandoff' | 'turnsStarted'>>
  turns: Turns
  status: ItemStatus
}

/** A handed-off row stays in its place, folded, and leaves the count. */
export type RowState = { is: 'open' } | { is: 'handedOff' }

export type RowView = {
  id: string
  type: 'question' | 'task' | 'finding'
  /** "1)" for a question a typed number answers now, "?" for any other question, "•" for a task or finding. */
  handle: string
  title: string
  at: number | null
  item: Item | null
  finding: Finding | null
  state: RowState
}

export type InboxView = {
  needsYou: {
    /** Open questions, and open tasks that are not handed off. */
    count: number
    /** The first row that counts. */
    topId: string | null
    questions: RowView[]
    tasks: RowView[]
  }
  /** Newest first. The count leaves out handed-off findings. */
  findings: { count: number; rows: RowView[] }
  status: ItemStatus
}

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing. It retries after your next message.'

/**
 * The open items in the order Needs you lists them. Questions: the latest
 * batch's in the order Claude asked them, then the rest newest first. Tasks:
 * oldest first.
 */
export function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const latest = new Set(latestBatch(ledger).map(i => i.id))
  const questions = ledger.items.filter(i => i.kind === 'question')

  return {
    questions: [
      ...questions.filter(i => latest.has(i.id)),
      ...questions.filter(i => !latest.has(i.id)).sort((a, b) => b.turn - a.turn),
    ],
    tasks: ledger.items.filter(i => i.kind === 'task').sort((a, b) => a.turn - b.turn),
  }
}

export function inboxView({ ledger, lastActions, turns, status }: ViewInput): InboxView {
  const { questions, tasks } = needsYouOrder(ledger)
  // The number the person's next prompt answers each question by.
  const numbers = questionNumbers(ledger, ledger.turn + 1)
  const stateOf = (id: string): RowState => (isHandedOff(lastActions[id], turns) ? { is: 'handedOff' } : { is: 'open' })
  const itemRow = (item: Item): RowView => {
    const n = numbers.get(item.id)

    return {
      id: item.id,
      type: item.kind,
      handle: item.kind === 'task' ? '•' : n === undefined ? '?' : `${n})`,
      title: item.ask,
      at: item.at,
      item,
      finding: null,
      // Questions never fold.
      state: item.kind === 'task' ? stateOf(item.id) : { is: 'open' },
    }
  }
  const questionRows = questions.map(itemRow)
  const taskRows = tasks.map(itemRow)
  const counted = [...questionRows, ...taskRows].filter(r => r.state.is === 'open')
  const findingRows = [...ledger.findings].reverse().map((finding): RowView => ({
    id: finding.id,
    type: 'finding',
    handle: '•',
    title: finding.title,
    at: finding.at,
    item: null,
    finding,
    state: stateOf(finding.id),
  }))

  return {
    needsYou: { count: counted.length, topId: counted[0]?.id ?? null, questions: questionRows, tasks: taskRows },
    findings: { count: findingRows.filter(r => r.state.is === 'open').length, rows: findingRows },
    status,
  }
}

/**
 * The per-turn update's status. The list changed last when the card or any
 * item or finding did, so tool calls that write the list count too. A failure
 * shows only once no update runs, since a running one may repair it.
 */
export function perTurnStatus(ledger: Ledger, update: { isUpdating: boolean; isFailed: boolean }): ItemStatus {
  const times = [
    ledger.card?.updatedAt,
    ...ledger.items.map(i => i.at),
    ...ledger.closed.map(d => d.at),
    ...ledger.findings.map(f => f.at),
    ...ledger.closedFindings.map(f => f.closedAt),
  ].filter((t): t is number => typeof t === 'number')

  return {
    changedAt: times.length === 0 ? null : Math.max(...times),
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED : null,
  }
}
