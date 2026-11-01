import type {
  Ledger,
  LastAction,
  RowNote,
  Turns,
  Closed,
  ClosedFinding,
  Item,
  SessionStatus,
  Subject,
  Finding,
} from '../types'
import { closedAt, reopenFinding, reopenItem, closedState } from './ledger-close'
import { isOpen } from './status-limits'
import { questionNumbers } from './inbox-text'
import { capitalized } from './press-labels'
import { baseName } from './open-targets'
import { stepsOf } from './help-steps'
import type { HelpStep } from './help-steps'
import { isFixSent, isHandedOff } from './last-actions'
import { isUndoable } from './pressed'
import { FINDING_GROUPS } from './help'
import { isSettledInPlace, canUndoClose, isUndoLeft, pendingDeliveryAt } from './timing'
import { closedRowState, optionDescriptionsOf, isWaitingRow, outcomeLabel, closedMark } from './rows'
import type { RowView, ClosedDelivery, ResultMark, RowState } from './rows'
import { DONE_LABELS, fixLabel, feedbackIn, pressFeedbackIn } from './feedback'
import type { ShownTab } from './tabs'
import { actionsOf } from './action-plan'

type ItemStatus = { isUpdating: boolean; error: string | null }

export type ViewInput = {
  ledger: Ledger
  lastActions: Record<string, LastAction>
  notes: Record<string, RowNote>
  turns: Turns
  extraSteps: Record<string, HelpStep[]>
  /** How long a settled row offers Undo. */
  settleWindowMs: number
  status: ItemStatus
  now: number
  /** The rows a reply in progress holds, from `heldReplies`: each row's id, and when its reply began. */
  replies: Record<string, number>
  /** The held rows whose reply the person discarded: each row's id, and when. */
  discarded: Record<string, number>
  /**
   * When the look began showing the tab it shows, by opening the inbox on it or switching to it. Null while no look
   * shows the inbox.
   */
  shownSince: number | null
  /** When the person last sent a message they typed, from `Session.presence`. */
  lastTypedMessageAt: number | null
}

export type InboxView = {
  needsYou: {
    count: number
    questions: RowView[]
    tasks: RowView[]
    closed: { questions: ClosedView<Closed>[]; tasks: ClosedView<Closed>[] }
  }
  findings: { count: number; rows: RowView[]; closed: ClosedView<ClosedFinding>[] }
  status: ItemStatus
}

/** A closed entry as a look draws it. `mark` is `closedMark` of the entry and its delivery. */
type ClosedView<T> = T & { delivery: ClosedDelivery; outcomeLabel: string; mark: ResultMark }

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing.'
const HOLDS_UP_TEXT = 'Holds up'
const UPDATE_RETRIES = ' It retries after your next message.'

function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const newestReplyFirst = (kind: Item['kind']) =>
    ledger.items.filter(i => i.kind === kind).sort((a, b) => b.turn - a.turn)

  return { questions: newestReplyFirst('question'), tasks: newestReplyFirst('task') }
}

/** The open subject, or the open milestone of a set goal, the Status call linked an ask to, by the ask's id. */
function heldSubjectOf(o: SessionStatus | null, askId: string): Pick<Subject, 'name'> | null {
  const linkedId = o?.askSubjects[askId]
  const milestones = o?.goal ? o.milestones : []

  return [...(o?.subjects ?? []), ...milestones].find(s => s.id === linkedId && isOpen(s)) ?? null
}

export function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  extraSteps,
  settleWindowMs,
  status,
  now,
  replies,
  discarded,
  shownSince,
  lastTypedMessageAt,
}: ViewInput): InboxView {
  const isInPlace = (at: number, canUndo: boolean) =>
    isSettledInPlace({ at, canUndo }, { shownSince, lastTypedMessageAt })
  const isOpen = (id: string) => ledger.items.some(i => i.id === id) || ledger.findings.some(f => f.id === id)
  const replyAfter = (c: Closed | ClosedFinding) => {
    const last = lastActions[c.id]

    return last?.action === 'type' &&
      last.at >= closedAt(c) &&
      last.delivery?.state !== 'failed' &&
      isInPlace(last.at, false)
      ? last
      : null
  }
  const isOwnClose = (c: Closed | ClosedFinding) =>
    c.how === 'done' ||
    c.how === 'dismissed' ||
    (c.how === 'answered' && lastActions[c.id]?.kind === 'mark' && lastActions[c.id]?.at === closedAt(c))
  const isHeld = (c: Closed | ClosedFinding) => {
    const since = replies[c.id]

    return since !== undefined && since <= closedAt(c) && !isOwnClose(c)
  }
  const isDiscarded = (c: Closed | ClosedFinding) => (discarded[c.id] ?? -Infinity) >= closedAt(c)
  const isPlaced = (c: Closed | ClosedFinding) => {
    const at = closedAt(c)

    return (
      replyAfter(c) !== null ||
      (!isDiscarded(c) && (isHeld(c) || isInPlace(at, canUndoClose(c, at, now, settleWindowMs))))
    )
  }
  const placedItems = new Map(
    ledger.closed.filter(d => d.item && !isOpen(d.id) && isPlaced(d)).map(d => [d.id, d] as const),
  )
  const isFixSettled = (id: string) => {
    const last = lastActions[id]

    return isFixSent(last) && !isInPlace(last.at, isUndoLeft(last.at, now, settleWindowMs))
  }
  const placedFindings = new Map(
    ledger.closedFindings.filter(f => !isOpen(f.id) && !isFixSettled(f.id) && isPlaced(f)).map(f => [f.id, f] as const),
  )
  const placed = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger))
  const { questions, tasks } = needsYouOrder(placed)
  const numbers = questionNumbers(ledger, ledger.turn + 1)
  const stateOf = (id: string): RowState => {
    const closed = placedItems.get(id) ?? placedFindings.get(id)
    if (closed) {
      const at = closedAt(closed)
      const last = lastActions[id]
      const reply = replyAfter(closed)
      if (reply)
        return {
          is: 'settled',
          label: DONE_LABELS[reply.action]?.(reply.text) ?? reply.text,
          at: reply.at,
          canUndo: false,
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed),
        }
      if (isHeld(closed)) return { is: 'held', label: heldLabel(closed), at }

      return closedRowState(
        closed,
        at,
        now,
        settleWindowMs,
        'doneNotification' in closed && closed.doneNotification?.error !== undefined
          ? { error: closed.doneNotification.error, canUndo: isUndoable(closed) }
          : (closed.how === 'answered' || closed.how === 'done') && last?.kind === 'mark' && last.at === at
            ? pendingDeliveryAt(last, now)
            : null,
      )
    }

    const last = lastActions[id]
    const sent = ledger.findings.find(f => f.id === id)
    if (sent && isFixSent(last))
      return {
        is: 'settled',
        label: fixLabel(sent),
        at: last.at,
        canUndo: isUndoLeft(last.at, now, settleWindowMs),
        offersUndo: true,
        delivery: pendingDeliveryAt(last, now),
        closedAs: 'handled',
      }

    return isHandedOff(last, turns) ? { is: 'handedOff' } : { is: 'open' }
  }
  const rowOf = (
    row: Omit<RowView, 'state' | 'feedback' | 'actions' | 'optionDescriptions' | 'holdsUpLine'>,
  ): RowView => {
    const state = stateOf(row.id)
    const last = lastActions[row.id]
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt)
    // A button must keep its width while its press is out, or the buttons after it can move to another line.
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt))

    const heldSubject = state.is === 'open' ? heldSubjectOf(ledger.overview, row.id) : null

    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: heldSubject ? `${HOLDS_UP_TEXT} ${heldSubject.name}` : null,
    }
  }
  const itemRow = (item: Item): RowView => {
    const n = numbers.get(item.id)

    return rowOf({
      id: item.id,
      type: item.kind,
      number: n ?? null,
      title: item.ask,
      at: item.at,
      detail: null,
      fileName: null,
      replyKind: item.kind === 'question' ? 'answer' : 'reply',
      item,
      finding: null,
      steps: stepsOf(item, extraSteps[item.id] ?? []),
    })
  }
  const questionRows = questions.map(itemRow)
  const taskRows = tasks.map(itemRow)
  const counted = [...questionRows, ...taskRows].filter(isWaitingRow)
  const kinds = Object.keys(FINDING_GROUPS) as Finding['kind'][]
  const byGroup = (a: Finding, b: Finding) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind)
  const findingRows = [...placed.findings]
    .filter(f => !isFixSettled(f.id))
    .reverse()
    .sort(byGroup)
    .map(finding =>
      rowOf({
        id: finding.id,
        type: 'finding',
        number: null,
        title: finding.title,
        at: finding.at,
        detail: finding.detail,
        fileName: finding.path ? baseName(finding.path) : null,
        replyKind: 'reply',
        item: null,
        finding,
        steps: [],
      }),
    )
  const held = new Set([...questionRows, ...taskRows, ...findingRows].filter(r => r.state.is === 'held').map(r => r.id))
  const closed: ClosedView<Closed>[] = [...ledger.closed]
    .filter(d => !held.has(d.id))
    .reverse()
    .map(d => {
      const delivery: ClosedDelivery =
        d.doneNotification?.error !== undefined
          ? { error: d.doneNotification.error, canUndo: isUndoable(d) }
          : (d.how === 'answered' || d.how === 'done') &&
              lastActions[d.id]?.kind === 'mark' &&
              lastActions[d.id]?.at === d.at
            ? pendingDeliveryAt(lastActions[d.id], now)
            : null

      return { ...d, outcomeLabel: outcomeLabel(d), delivery, mark: closedMark(closedState(d), delivery) }
    })
  const fixesSent: ClosedView<ClosedFinding>[] = ledger.findings
    .filter(f => isFixSent(lastActions[f.id]))
    .map(f => {
      const outcome = fixLabel(f)
      const delivery = pendingDeliveryAt(lastActions[f.id], now)

      return {
        ...f,
        how: 'answered',
        outcome,
        outcomeLabel: outcomeLabel({ ...f, outcome }),
        closedAt: lastActions[f.id]!.at,
        delivery,
        mark: closedMark(closedState({ how: 'answered', outcome }), delivery),
      }
    })

  return {
    needsYou: {
      count: counted.length,
      questions: questionRows,
      tasks: taskRows,
      closed: { questions: closed.filter(d => d.kind === 'question'), tasks: closed.filter(d => d.kind === 'task') },
    },
    findings: {
      count: findingRows.filter(isWaitingRow).length,
      rows: findingRows,
      closed: [
        ...ledger.closedFindings
          .filter(f => !held.has(f.id))
          .map(f => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null, mark: closedMark(closedState(f), null) })),
        ...fixesSent,
      ].sort((a, b) => b.closedAt - a.closedAt),
    },
    status,
  }
}

function heldLabel(c: Pick<Closed, 'how' | 'outcome'>): string {
  if (c.how === 'answered') return `Answered: ${c.outcome}`

  return c.how === 'claude' ? capitalized(c.outcome) : `Closed: ${c.outcome}`
}

const UPDATING_TEXT = 'Updating…'
const REFRESHING_PRS_TEXT = 'Refreshing PRs…'

/**
 * The status line under the inbox for the shown tab. The PRs tab says when PRs refresh, and only once it lists some,
 * since an empty PRs tab already reads "Checking for PRs…". A failed ledger update is about rows, so it shows on every
 * tab but the PRs tab. On the Status tab, `statusPageError` shows in its place.
 */
export function footerStatus(
  tab: ShownTab,
  status: ItemStatus,
  prs: { isFetching: boolean; hasPrs: boolean },
  statusPageError: string | null,
): { text: string | null; error: string | null } {
  if (tab === 'prs') return { text: prs.isFetching && prs.hasPrs ? REFRESHING_PRS_TEXT : null, error: null }
  const error = (tab === 'overview' ? statusPageError : null) ?? status.error

  return { text: status.isUpdating ? UPDATING_TEXT : null, error }
}

export function perTurnStatus(update: { isUpdating: boolean; isFailed: boolean; retries: boolean }): ItemStatus {
  return {
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : '') : null,
  }
}
