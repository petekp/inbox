import type { Item, Closed, PressKind, Finding } from '../../types'
import { closedState } from '../domain/ledger-close'
import type { ClosedState } from '../domain/ledger-close'
import { ago, cutLine } from '../domain/text'
import { capitalized } from '../domain/press-labels'
import type { HelpStep } from '../domain/help-steps'
import type { EarlierLine } from '../domain/earlier-answers'
import type { RowPress } from '../domain/presses'
import { offersUndo } from './pressed'
import {
  RUNNING_MARK,
  SUBJECT_MARKS,
  CLOSED_MARKS,
  QUESTION_MARK,
  NEEDS_YOU_MARKS,
  TASK_MARK,
  WAITS_ON_YOU_MARK,
} from './help'
import { canUndoClose, isUndoLeft } from './timing'
import type { Feedback } from './feedback'
import type { InboxView } from './view'

export const OPTIONS_FOLD_AT = 5
/**
 * The dot between parts of a drawn line, as "title · 3m ago", set apart by spaces wider than a space. The one before
 * it is a figure space, which never breaks, so a wrapped line ends with the dot instead of starting with it.
 */
export const DOT = '\u2007·\u2002'

export const NEEDS_YOU_GROUPS: {
  kind: Item['kind']
  title: string
  list: 'questions' | 'tasks'
  mark: { mark: string; tone: 'needsYou' | 'tasks' }
}[] = [
  { kind: 'question', title: 'Questions', list: 'questions', mark: NEEDS_YOU_MARKS.question },
  { kind: 'task', title: 'Tasks', list: 'tasks', mark: NEEDS_YOU_MARKS.task },
]

export const CLOSED_SHOWN = 3

export type ClosedDelivery = 'held' | 'sending' | 'queued' | 'unconfirmed' | { error: string; canUndo: boolean } | null

export type RowState =
  | { is: 'open' }
  | { is: 'handedOff' }
  | { is: 'held'; label: string; at: number }
  | {
      is: 'settled'
      label: string
      at: number
      canUndo: boolean
      /** Whether this kind of close offers Undo while Undo lasts. `canUndo` is whether Undo is on offer now. */
      offersUndo: boolean
      delivery: ClosedDelivery
      closedAs: ClosedState
      /** The words of a reply sent after the close, which the label reads with. */
      reply?: string
    }

export type SettledState = Extract<RowState, { is: 'settled' }>

/**
 * The state of a row closed at `at`, drawn in place with its outcome. Its close sets whether it offers Undo. An
 * answer pressed in the inbox offers it too, while its message waits for the settle window to pass.
 */
export function closedRowState(
  closed: Pick<Closed, 'how' | 'outcome' | 'isSentToAgent'> & { askedAs?: string },
  at: number,
  now: number,
  settleWindowMs: number,
  delivery: ClosedDelivery,
  isPressedAnswer = false,
): SettledState {
  const canUndoAnswer = isPressedAnswer && delivery === 'held' && isUndoLeft(at, now, settleWindowMs)

  return {
    is: 'settled',
    label: outcomeLabel(closed),
    at,
    canUndo: canUndoAnswer || canUndoClose(closed, at, now, settleWindowMs),
    offersUndo: isPressedAnswer || offersUndo(closed),
    closedAs: closedState(closed),
    delivery,
  }
}

export type Look = 'terminal' | 'desktop' | 'codex' | 'omp' | 'herdr'
export type ModLook = Exclude<Look, 'codex' | 'omp' | 'herdr'>

export const isTerminalLike = (look: Look) => look === 'terminal' || look === 'omp'

export type ActionEmphasis = 'primary' | 'normal' | 'quiet'
export type ActionIcon = 'done' | 'retry' | 'open' | 'copy' | 'run'

export const ROW_COPY = {
  retry: 'Try again',
  goToSession: 'Go to session',
  send: 'Send',
  cancel: 'Cancel',
  discard: 'Discard',
  clickField: 'Click the field to type',
  relevantFile: 'Relevant file: ',
  allOptions: (count: number) => `All ${count} options`,
  undo: 'Undo',
  reopen: 'Reopen',
} as const

/**
 * Why a message did not send when Claude Code held it after the person stopped the session. Claude Code holds plugin
 * messages until the person types in that session, and a press from outside it, as in the Herdr look, does not count.
 */
export const STOPPED_REASON = 'you stopped this session. It takes inbox messages again after you write to it.'

/** The button that shows the session a message was not sent to, so the person can type there. */
export type SessionKey = { label: string; emphasis: 'normal' }

/**
 * Go to session for a message refused for `reason`, when the person stopped the session and the look shows the
 * session from outside it, as the Herdr look does, and passes `canShowSession`. Null otherwise.
 */
export function sessionKeyOf(reason: string | null, canShowSession: boolean): SessionKey | null {
  return canShowSession && reason === STOPPED_REASON ? { label: ROW_COPY.goToSession, emphasis: 'normal' } : null
}

/** The stop banner's button: Resume, and Resuming… while its message is on its way. */
export function resumeLabel(isSending: boolean): string {
  return isSending ? 'Resuming…' : 'Resume'
}

/**
 * A Closed line's buttons. Its press is Undo after its notification was refused, else Reopen on a row the person
 * dismissed, which stays reachable for the rest of the session. Reopening loses nothing, since a dismissal sent nothing.
 * A look that passes `canShowSession` draws `sessionKey` before the press, as `sessionKeyOf` gives it.
 */
export function closedLinePlan(
  d: { id: string; how: Closed['how']; delivery: ClosedDelivery },
  canShowSession = false,
): { action: { label: string; press: RowPress } | null; sessionKey: SessionKey | null } {
  const sessionKey = sessionKeyOf(refusalOf(d.delivery), canShowSession)
  if (canUndoRefused(d.delivery))
    return { action: { label: ROW_COPY.undo, press: { id: d.id, action: 'undo' } }, sessionKey }
  const reopen = { label: ROW_COPY.reopen, press: { id: d.id, action: 'undo' as const } }

  return { action: d.how === 'dismissed' ? reopen : null, sessionKey }
}

export type ActionView = {
  press: RowPress
  label: string
  kind: PressKind
  emphasis: ActionEmphasis
  icon?: ActionIcon
  isPrimary: boolean
  isFolded: boolean
  isFollowUp: boolean
  hotkey?: string
  /** Its press is out, so it draws dim and ignores another press until the press settles. */
  isOut: boolean
}

export type RowView = {
  id: string
  /** `dialog`: the agent's own dialog, from `core/view/dialog-row.ts:withDialogRow`. */
  type: 'question' | 'task' | 'finding' | 'dialog'
  /** The question's number in the batch the person can answer by number, as the agent's message numbers it. */
  number: number | null
  title: string
  at: number | null
  detail: string | null
  fileName: string | null
  replyKind: 'answer' | 'reply'
  item: Item | null
  finding: Finding | null
  steps: HelpStep[]
  state: RowState
  feedback: Feedback | null
  actions: ActionView[]
  /** The description of each answer button that has one, in button order. A folded button's is folded with it. */
  optionDescriptions: OptionDescription[]
  /**
   * "Holds up" and the names of the open subjects an open ask holds up, comma-separated, as the Status call linked them.
   */
  holdsUpLine: string | null
  /**
   * Why the agent asked, on an open question whose record gave a context. A look draws it whole, first under the
   * title, on the selected row only.
   */
  contextLine: string | null
  /** The person's earlier answer to a similar question, on an open question that has a shown one, drawn after the context. */
  earlierLine: EarlierLine | null
}

/**
 * An answer button's line under a question: its label, what it does, and for the recommended answer the agent's
 * reason for it. An answer with neither has no line.
 */
type OptionDescription = {
  /** The answer as the agent wrote it, which the answer's press carries. */
  option: string
  description: string | null
  reason: string | null
  isFolded: boolean
}

export function optionDescriptionsOf(item: Item | null, actions: ActionView[]): OptionDescription[] {
  const descriptions = item?.optionDescriptions

  return actions.flatMap(a => {
    if (a.press.action !== 'answer') return []
    const description =
      descriptions && Object.hasOwn(descriptions, a.press.option) ? descriptions[a.press.option]! : null
    const reason = item?.rec === a.press.option && item.recReason ? item.recReason : null
    if (description === null && reason === null) return []

    return [
      {
        option: a.press.option,
        description,
        reason,
        isFolded: a.isFolded,
      },
    ]
  })
}

/** What follows an option's label and a colon: its description, then the recommendation's reason. Null with no description. */
function optionBody(o: OptionDescription): string | null {
  if (o.description === null) return null
  if (o.reason === null) return o.description

  return `${o.description}${/[.!?]$/.test(o.description) ? '' : '.'} ${recommendedLine(o.reason)}`
}

/** The recommendation's reason on a line of its own, for a recommended option that has no description. */
export function optionReasonLine(o: OptionDescription): string | null {
  return o.description === null && o.reason !== null ? recommendedLine(o.reason) : null
}

const recommendedLine = (reason: string) => `Recommended: ${reason}`

/** The line under an answer's button: what it does, then the recommendation's reason, or the reason alone. Null with neither. */
export function optionNote(o: OptionDescription | undefined): string | null {
  return o ? (optionBody(o) ?? optionReasonLine(o)) : null
}

/** A row's handle in text the agent reads: its number, as "1)", or "•". */
export function rowHandle(row: Pick<RowView, 'number'>): string {
  return row.number === null ? '•' : `${row.number})`
}

/** A row's title as a look draws it. The terminal and omp start a numbered question's title with its number. */
export function rowTitle(row: Pick<RowView, 'number' | 'title'>, look: Look): string {
  return isTerminalLike(look) && row.number !== null ? `${rowHandle(row)} ${row.title}` : row.title
}

export function replyHint(row: RowView, agent: string): string {
  return row.replyKind === 'answer' ? 'Your answer' : `Your reply to ${agent}`
}

/**
 * A look that fills the recommended answer's button passes `fits`, its own measure of whether a label fits that
 * button. Where "(recommended)" would not fit, the fill alone marks the recommended answer.
 */
export function actionLabel(
  action: Pick<ActionView, 'label' | 'isPrimary'>,
  fits?: (label: string) => boolean,
): string {
  if (!action.isPrimary) return action.label
  const marked = `${action.label} (recommended)`

  return fits && !fits(marked) ? action.label : marked
}

export function fieldExit(row: RowView): 'cancel' | 'discard' {
  return row.state.is === 'held' ? 'discard' : 'cancel'
}

export function isWaitingRow(row: RowView): boolean {
  return row.state.is === 'open'
}

/**
 * The count a group's title shows: its rows that wait on the person, save the agent's own dialog, which no count
 * includes. A look draws no count when it is 0.
 */
export function waitingCount(rows: readonly (RowView | undefined)[]): number {
  return rows.filter(r => r !== undefined && isWaitingRow(r) && r.type !== 'dialog').length
}

/** Whether a handed-off row's last press is done: its send arrived, or its open or copy worked. */
export function isHandedOffDone(row: Pick<RowView, 'state' | 'feedback'>): boolean {
  const f = row.feedback

  return row.state.is === 'handedOff' && (f?.is === 'done' || (f?.is === 'local' && f.result.state === 'done'))
}

/**
 * The mark of a row's result: what came of it. The terminal and omp draw it before the result, and desktop and Codex
 * in the row's mark column. `isRunning` says the look draws its running mark in place of `text`, as on the Status,
 * while what the row sent is on its way.
 */
export type ResultMark = { text: string; isRunning: boolean; tone?: 'done' | 'needsYou' | 'tasks' }

const RUNNING_RESULT: ResultMark = { text: RUNNING_MARK, isRunning: true }

/**
 * A row's result mark: a settled row's, or a handed-off row's, which runs while its message is on its way and is ✓
 * once its press is done. It is blank otherwise, as while the message is unconfirmed, and keeps its place, so the
 * result does not move when its mark arrives. An open row's runs while the agent works on its Talk press, as beside
 * "Explaining…", so a long reply never looks like a stuck press. Null on any other open row.
 */
export function rowResultMark(row: Pick<RowView, 'state' | 'feedback'>): ResultMark | null {
  if (row.state.is === 'settled') return settledMark(row.state)
  const f = row.feedback
  if (row.state.is === 'open' && f?.is === 'working') return RUNNING_RESULT
  if (row.state.is !== 'handedOff' || !f) return null
  if (f.is === 'sending' || f.is === 'queued') return RUNNING_RESULT
  return isHandedOffDone(row)
    ? { text: SUBJECT_MARKS.done.mark, isRunning: false, tone: 'done' }
    : { text: '', isRunning: false }
}

/** The mark an open row waits on the person with: ? on a question, □ on a task, ◆ on a dialog, none on a finding. */
export function openMark(row: Pick<RowView, 'type'>): ResultMark | null {
  if (row.type === 'finding') return null
  const m = row.type === 'task' ? TASK_MARK : row.type === 'dialog' ? WAITS_ON_YOU_MARK : QUESTION_MARK

  return { text: m.mark, isRunning: false, tone: m.tone }
}

/**
 * A row's mark in the mark column: its result mark, or on an open row its `openMark`, which waits on the person. A
 * running mark replaces it while the agent works on the row.
 */
export function rowMark(row: Pick<RowView, 'state' | 'feedback' | 'type'>): ResultMark | null {
  return rowResultMark(row) ?? (row.state.is === 'open' ? openMark(row) : null)
}

export function allRows(v: InboxView): RowView[] {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]
}

export function settledRowIds(rows: RowView[]): string[] {
  return rows.filter(r => r.state.is === 'settled').map(r => r.id)
}

/** The Closed lines a fold lists: the newest CLOSED_SHOWN, or every one once the person opened the earlier ones. */
export function closedShown<T extends { id: string }>(
  closed: readonly T[],
  drawnSettled: ReadonlySet<string>,
  isAllShown = false,
): T[] {
  const listed = closed.filter(d => !drawnSettled.has(d.id))

  return isAllShown ? listed : listed.slice(0, CLOSED_SHOWN)
}

export function closedTotal(closed: { id: string }[], drawnSettled: ReadonlySet<string>): number {
  return closed.filter(d => !drawnSettled.has(d.id)).length
}

export function foldLabel(total: number): string {
  return `${total} closed`
}

/** The button under a Closed list that lists the rest of it, or null when the list shows every line. */
export function earlierLabel(total: number, shown: number): string | null {
  return total > shown ? `Show ${total - shown} earlier` : null
}

export function shortAgo(ms: number): string {
  const age = ago(ms)

  return age === 'just now' ? 'now' : age.replace(/ ago$/, '')
}

/** A sent message's step on its way to the agent, as its row reads it. `arrived` covers a message with no delivery record. */
type SendStep = 'sending' | 'queued' | 'unconfirmed' | 'arrived'

function sendStepOf(delivery: ClosedDelivery): SendStep {
  return delivery === 'queued' || delivery === 'unconfirmed' ? delivery : delivery === 'sending' ? 'sending' : 'arrived'
}

/** A reply's words on one line: its line breaks and runs of spaces become one space. */
function replyLine(words: string): string {
  return words.replace(/\s+/g, ' ').trim()
}

/**
 * What a press reads at each step of its message's way. `label` is what it reads at rest: the answer chosen, or its
 * done label, as "Replied". A reply reads with the words the person typed in every step, and names itself, since
 * free words have no button on the row to recognize them by. An answer's option is one of the row's own buttons.
 */
export function deliveryLabel(step: SendStep, label: string, reply?: string): string {
  if (reply !== undefined) {
    const words = replyLine(reply)
    switch (step) {
      case 'sending':
        return `Sending reply: ${words}`
      case 'queued':
        return `Queued reply: ${words}`
      case 'unconfirmed':
        return `Reply not confirmed: ${words}`
      case 'arrived':
        return `Replied: ${words}`
    }
  }
  switch (step) {
    case 'queued':
      return `Queued: ${label}`
    case 'unconfirmed':
      return `Not confirmed: ${label}`
    default:
      return label
  }
}

/** A settled row's mark: the one its line in the Closed list draws, so a row keeps its mark when it folds. */
export function settledMark(state: Pick<SettledState, 'delivery' | 'closedAs'>): ResultMark {
  return closedMark(state.closedAs, state.delivery)
}

const QUEUED_RESULT: ResultMark = { text: SUBJECT_MARKS.queued.mark, isRunning: false }

/**
 * A closed row's mark, as `CLOSED_MARKS` gives it: running while what it sent is sending, the still queued mark while
 * the message waits for the agent's turn to end, so a closed row never reads as active, else blank until it arrives.
 */
export function closedMark(state: ClosedState, delivery: ClosedDelivery): ResultMark {
  if (delivery === 'sending') return RUNNING_RESULT
  if (delivery === 'queued') return QUEUED_RESULT
  return { text: delivery === null ? CLOSED_MARKS[state] : '', isRunning: false }
}

/** Whether a closed row offers Undo after its notification was refused. */
export function canUndoRefused(delivery: ClosedDelivery): boolean {
  return delivery !== null && typeof delivery === 'object' && delivery.canUndo
}

/**
 * The tone of a settled row's label: done once nothing it sent is on its way and the row did not lapse, so a
 * "Not sent" or unconfirmed result never reads as success. A look that draws the label as muted text after the
 * title draws it muted either way.
 */
export function settledTone(state: Pick<SettledState, 'delivery' | 'closedAs'>): 'done' | 'muted' {
  return state.delivery === null && state.closedAs === 'handled' ? 'done' : 'muted'
}

/**
 * The tone of a settled row's title tint, from how the row closed: done once it was handled, from the press
 * on, whatever step its message is at; error once a send failed; muted for a dismissed or lapsed row. A host that does
 * not hold a send until its run marks each send unconfirmed until it is accepted, so unconfirmed stays done.
 */
export function closedTitleTone(state: Pick<SettledState, 'delivery' | 'closedAs'>): 'done' | 'muted' | 'error' {
  if (isSendRefused(state.delivery)) return 'error'

  return state.closedAs === 'handled' ? 'done' : 'muted'
}

/** Why the agent refused a closed row's message, or null when it was not refused. */
export const refusalOf = (delivery: ClosedDelivery): string | null => (isSendRefused(delivery) ? delivery.error : null)

function isSendRefused(delivery: ClosedDelivery): delivery is { error: string; canUndo: boolean } {
  return delivery !== null && typeof delivery === 'object'
}

/** A settled row's label with its message's step, as "Queued: Yes", or a reply's words as "Replied: Call it hello". */
export function settledLabel(label: string, delivery: ClosedDelivery, reply?: string): string {
  if (delivery && typeof delivery === 'object') return `${label} · Not sent: ${delivery.error}`
  return deliveryLabel(sendStepOf(delivery), label, reply)
}

const MAX_OUTCOME_CHARS = 120

/**
 * An outcome as a closed row shows it: whole, or cut at a word with an ellipsis when over `MAX_OUTCOME_CHARS`, so a
 * long answer the person typed does not fill the row. The record keeps the whole text.
 */
export function shortOutcome(outcome: string): string {
  return cutLine(outcome, t => t.length <= MAX_OUTCOME_CHARS)
}

/** A closed record's outcome as a look shows it. A finding a question replaced says where it went. */
export function outcomeLabel(c: { outcome: string; askedAs?: string }): string {
  return c.askedAs ? 'Now a question in Asks' : capitalized(shortOutcome(c.outcome))
}
