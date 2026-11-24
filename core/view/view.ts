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
} from '../../types'
import { closedAt, reopenFinding, reopenItem, closedState } from '../domain/ledger-close'
import { isOpen } from '../domain/status-limits'
import { questionNumbers } from '../domain/inbox-text'
import { capitalized } from '../domain/press-labels'
import { baseName } from '../domain/open-targets'
import { stepsOf } from '../domain/help-steps'
import type { SessionPrs } from '../domain/help-steps'
import { isFixSent, isHandedOff } from '../domain/last-actions'
import { isHeldSend, isUndoable } from './pressed'
import { FINDING_GROUPS } from './help'
import { isSettledInPlace, canUndoClose, isUndoLeft, pendingDeliveryAt, earliestOf } from './timing'
import type { ListInput } from './timing'
import { closedRowState, optionDescriptionsOf, isWaitingRow, outcomeLabel, closedMark } from './rows'
import type { RowView, ClosedDelivery, ResultMark, RowState } from './rows'
import { doneLabel, feedbackOf, fixLabel, feedbackIn, pressUnderWaySince, pressFeedbackIn } from './feedback'
import type { ShownTab } from './tabs'
import type { StatusPage } from './status-page'
import type { LedgerSync } from './sync-state'
import { actionsOf } from './action-plan'
import { earlierLineOf } from '../domain/earlier-answers'

/** `error`: why the asks and findings may be missing some, as the line under the tabs says it, or null. */
type ItemStatus = { error: string | null }

export type ViewInput = {
  ledger: Ledger
  lastActions: Record<string, LastAction>
  notes: Record<string, RowNote>
  turns: Turns
  sessionPrs: SessionPrs
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
  /** The person's latest run of input on the list the look shows. Null when the look knows of none. */
  listInput: ListInput | null
  /**
   * The settled rows and PRs whose Undo the look still shows, by id. The Codex tab times Undo from its own first read of
   * a row, so it names them and the server keeps them in place. Other looks pass none.
   */
  undoShown?: string[]
  /** The settled rows whose Undo press is out in the look, by id. They keep their `undo` action after Undo ends. */
  undoOut?: string[]
  /** The rows that draw collapsed, from `core/view/collapse.ts:collapsedRows`. */
  collapsed?: string[]
  /** Whether the look can scroll the conversation to a reply, which only the fullscreen Claude Code terminal can. */
  canScrollConversation?: boolean
}

export type InboxView = {
  needsYou: {
    count: number
    questions: RowView[]
    tasks: RowView[]
    closed: { questions: ClosedView<Closed>[]; tasks: ClosedView<Closed>[] }
    /** When the oldest press still under way on a row of the tab began, or null. A settled row there that was in place then waits for it. */
    pressOutSince: number | null
  }
  findings: { count: number; rows: RowView[]; closed: ClosedView<ClosedFinding>[]; pressOutSince: number | null }
  status: ItemStatus
  /** The rows that draw collapsed, by id. Each look draws a collapsed row closed, even while it is selected. */
  collapsed: string[]
}

/** A closed entry as a look draws it. `mark` is `closedMark` of the entry and its delivery. */
type ClosedView<T> = T & { delivery: ClosedDelivery; outcomeLabel: string; mark: ResultMark }

const HOLDS_UP_TEXT = 'Holds up'

function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const newestReplyFirst = (kind: Item['kind']) =>
    ledger.items.filter(i => i.kind === kind).sort((a, b) => b.turn - a.turn)

  return { questions: newestReplyFirst('question'), tasks: newestReplyFirst('task') }
}

/** The open subjects, and open milestones of a set goal, the Status call linked an ask to, by the ask's id. */
function heldSubjectsOf(o: SessionStatus | null, askId: string): Pick<Subject, 'name'>[] {
  const milestones = o?.goal && !o.goal.isAwaitingMilestones ? o.milestones : []
  const linkable = [...(o?.subjects ?? []), ...milestones]

  return (o?.askSubjects[askId] ?? []).flatMap(id => linkable.filter(s => s.id === id && isOpen(s)))
}

export function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  sessionPrs,
  settleWindowMs,
  status,
  now,
  replies,
  discarded,
  shownSince,
  lastTypedMessageAt,
  listInput,
  undoShown,
  undoOut = [],
  collapsed = [],
  canScrollConversation = false,
}: ViewInput): InboxView {
  const isFindingId = (id: string) =>
    ledger.findings.some(f => f.id === id) || ledger.closedFindings.some(f => f.id === id)
  const isItemId = (id: string) => ledger.items.some(i => i.id === id) || ledger.closed.some(c => c.id === id)
  const pressOutSinceWhere = (isOnTab: (id: string) => boolean) =>
    earliestOf(
      Object.entries(lastActions).map(([id, last]) =>
        isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, turns, now)) : null,
      ),
    )
  const placingOn = (pressOutSince: number | null) => ({
    shownSince,
    lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    pressOutSince,
  })
  const placingFor = {
    needsYou: placingOn(pressOutSinceWhere(isItemId)),
    findings: placingOn(pressOutSinceWhere(isFindingId)),
  }
  const isInPlace = (id: string, at: number, canUndo: boolean, last?: LastAction) =>
    isSettledInPlace(
      { at, canUndo, delivery: pendingDeliveryAt(last, now) },
      isFindingId(id) ? placingFor.findings : placingFor.needsYou,
      id,
    )
  const pressedSend = (c: Closed | ClosedFinding) => {
    const last = lastActions[c.id]

    return (c.how === 'answered' || c.how === 'done') && last?.kind === 'mark' && last.at === closedAt(c)
      ? last
      : undefined
  }
  const isOpen = (id: string) => ledger.items.some(i => i.id === id) || ledger.findings.some(f => f.id === id)
  const replyAfter = (c: Closed | ClosedFinding) => {
    const last = lastActions[c.id]

    return last?.action === 'type' &&
      last.at >= closedAt(c) &&
      last.delivery?.state !== 'failed' &&
      isInPlace(c.id, last.at, false, last)
      ? last
      : null
  }
  const isPressedAnswer = (c: Closed | ClosedFinding) =>
    c.how === 'answered' && lastActions[c.id]?.kind === 'mark' && lastActions[c.id]?.at === closedAt(c)
  const isOwnClose = (c: Closed | ClosedFinding) => c.how === 'done' || c.how === 'dismissed' || isPressedAnswer(c)
  const isAnswerHeld = (c: Closed | ClosedFinding) =>
    isPressedAnswer(c) && isHeldSend(lastActions[c.id]) && isUndoLeft(closedAt(c), now, settleWindowMs)
  const isHeld = (c: Closed | ClosedFinding) => {
    const since = replies[c.id]

    return since !== undefined && since <= closedAt(c) && !isOwnClose(c)
  }
  const isDiscarded = (c: Closed | ClosedFinding) => (discarded[c.id] ?? -Infinity) >= closedAt(c)
  const isPlaced = (c: Closed | ClosedFinding) => {
    const at = closedAt(c)

    return (
      replyAfter(c) !== null ||
      (!isDiscarded(c) &&
        (isHeld(c) || isInPlace(c.id, at, isAnswerHeld(c) || canUndoClose(c, at, now, settleWindowMs), pressedSend(c))))
    )
  }
  const placedItems = new Map(
    ledger.closed.filter(d => d.item && !isOpen(d.id) && isPlaced(d)).map(d => [d.id, d] as const),
  )
  const isFixSettled = (id: string) => {
    const last = lastActions[id]

    return isFixSent(last) && !isInPlace(id, last.at, isUndoLeft(last.at, now, settleWindowMs), last)
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
      const reply = replyAfter(closed)
      if (reply)
        return {
          is: 'settled',
          label: doneLabel(reply),
          at: reply.at,
          canUndo: false,
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed),
          ...(reply.reply !== undefined ? { reply: reply.reply } : {}),
        }
      if (isHeld(closed)) return { is: 'held', label: heldLabel(closed), at }

      return closedRowState(
        closed,
        at,
        now,
        settleWindowMs,
        'doneNotification' in closed && closed.doneNotification?.error !== undefined
          ? { error: closed.doneNotification.error, canUndo: isUndoable(closed) }
          : pendingDeliveryAt(pressedSend(closed), now),
        isPressedAnswer(closed),
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
    row: Omit<
      RowView,
      'state' | 'feedback' | 'actions' | 'optionDescriptions' | 'holdsUpLine' | 'contextLine' | 'earlierLine'
    >,
  ): RowView => {
    const state = stateOf(row.id)
    const last = lastActions[row.id]
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt)
    // A button must keep its width while its press is out, or the buttons after it can move to another line.
    const actions = actionsOf(
      row,
      last,
      state,
      pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt),
      undoOut.includes(row.id),
      canScrollConversation,
    )

    const held = state.is === 'open' ? heldSubjectsOf(ledger.overview, row.id) : []

    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held.length > 0 ? `${HOLDS_UP_TEXT} ${held.map(s => s.name).join(', ')}` : null,
      contextLine: state.is === 'open' ? (row.item?.context ?? null) : null,
      earlierLine: state.is === 'open' ? earlierLineOf(row.item?.earlier, now) : null,
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
      steps: stepsOf(item, sessionPrs),
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
      pressOutSince: placingFor.needsYou.pressOutSince,
    },
    findings: {
      count: findingRows.filter(isWaitingRow).length,
      pressOutSince: placingFor.findings.pressOutSince,
      rows: findingRows,
      closed: [
        ...ledger.closedFindings
          .filter(f => !held.has(f.id))
          .map(f => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null, mark: closedMark(closedState(f), null) })),
        ...fixesSent,
      ].sort((a, b) => b.closedAt - a.closedAt),
    },
    status,
    collapsed,
  }
}

function heldLabel(c: Pick<Closed, 'how' | 'outcome'>): string {
  if (c.how === 'answered') return `Answered: ${c.outcome}`

  return c.how === 'claude' ? capitalized(c.outcome) : `Closed: ${c.outcome}`
}

/**
 * The failed-update text under the tabs for the shown tab, or null. A failed ledger update is about rows, so it shows on
 * every tab but the PRs tab. On the Status tab, the page's own error shows in its place, and the page's stale line
 * shows when neither failed.
 */
export function footerError(
  tab: ShownTab,
  status: ItemStatus,
  page: Pick<StatusPage, 'sync' | 'syncText'> | null,
): string | null {
  if (tab === 'prs') return null
  if (tab !== 'overview') return status.error
  const isPageFailed = page?.sync.is === 'stale' && page.sync.why === 'failed'

  return isPageFailed ? page.syncText : (status.error ?? page?.syncText ?? null)
}

const NEXT_TRY = ' It tries again after the next reply.'

/**
 * The line for a failed ledger update. Every host retries after the agent's next reply: a pending exchange on its own,
 * otherwise by catching up. A Codex chat saved with no rollout path gets one from that reply's Stop hook, which saves
 * it before the update starts.
 */
const FAILED_UPDATE_TEXT = {
  failed: `The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing.${NEXT_TRY}`,
  'failed-again': `The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing.${NEXT_TRY}`,
  unreadable: `The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing.${NEXT_TRY}`,
} as const

export function perTurnStatus(sync: LedgerSync): ItemStatus {
  const why = sync.is === 'stale' || sync.is === 'unavailable' ? sync.why : null
  const isQuiet = why === null || why === 'read-failed' || why === 'retrying'
  const error = isQuiet ? null : FAILED_UPDATE_TEXT[why]

  return { error }
}
