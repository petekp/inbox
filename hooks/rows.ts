import type { Item, Closed, PressKind, Finding } from '../types'
import { closedState } from './ledger-close'
import type { ClosedState } from './ledger-close'
import { clipLabel, ago } from './text'
import { capitalized } from './press-labels'
import type { HelpStep } from './help-steps'
import type { RowPress } from './presses'
import { offersUndo } from './pressed'
import { RUNNING_MARK, SUBJECT_MARKS, CLOSED_MARKS } from './help'
import { canUndoClose } from './timing'
import type { Feedback } from './feedback'
import type { InboxView } from './view'

export const OPTIONS_FOLD_AT = 5
export const OPTION_LABEL_CHARS = 32
/**
 * The dot between parts of a drawn line, as "title · 3m ago", set apart by spaces wider than a space. The one before
 * it is a figure space, which never breaks, so a wrapped line ends with the dot instead of starting with it.
 */
export const DOT = '\u2007·\u2002'

export const NEEDS_YOU_GROUPS: { kind: Item['kind']; title: string; list: 'questions' | 'tasks' }[] = [
  { kind: 'question', title: 'Questions', list: 'questions' },
  { kind: 'task', title: 'Tasks', list: 'tasks' },
]

export const CLOSED_SHOWN = 3

export type ClosedDelivery = 'sending' | 'queued' | 'unconfirmed' | { error: string; canUndo: boolean } | null

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
    }

export type SettledState = Extract<RowState, { is: 'settled' }>

/** The state of a row closed at `at`, drawn in place with its outcome. Its close sets whether it offers Undo. */
export function closedRowState(
  closed: Pick<Closed, 'how' | 'outcome' | 'isSentToAgent'> & { askedAs?: string },
  at: number,
  now: number,
  settleWindowMs: number,
  delivery: ClosedDelivery,
): SettledState {
  return {
    is: 'settled',
    label: outcomeLabel(closed),
    at,
    canUndo: canUndoClose(closed, at, now, settleWindowMs),
    offersUndo: offersUndo(closed),
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
  send: 'Send',
  cancel: 'Cancel',
  discard: 'Discard',
  clickField: 'Click the field to type',
  relevantFile: 'Relevant file: ',
  allOptions: (count: number) => `All ${count} options`,
} as const

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
  type: 'question' | 'task' | 'finding'
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
   * "Holds up" and the open subject's name, on an open ask the Status call linked to an open subject. A look draws it
   * on a next build, which draws the Status.
   */
  holdsUpLine: string | null
}

type OptionDescription = { label: string; description: string; isFolded: boolean }

export function optionDescriptionsOf(item: Item | null, actions: ActionView[]): OptionDescription[] {
  const descriptions = item?.optionDescriptions
  if (!descriptions) return []

  return actions.flatMap(a => {
    if (a.press.action !== 'answer' || !Object.hasOwn(descriptions, a.press.option)) return []
    const description = descriptions[a.press.option]!

    return [{ label: clipLabel(a.press.option, OPTION_LABEL_CHARS), description, isFolded: a.isFolded }]
  })
}

/** The option descriptions a row shows: all of them once its folded options show, else the unfolded ones. */
export function shownOptionDescriptions(row: RowView, isShowingAll: boolean): OptionDescription[] {
  return row.optionDescriptions.filter(o => isShowingAll || !o.isFolded)
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

/** The count a group's title shows: its rows that wait on the person. A look draws no count when it is 0. */
export function waitingCount(rows: readonly (RowView | undefined)[]): number {
  return rows.filter(r => r !== undefined && isWaitingRow(r)).length
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
export type ResultMark = { text: string; isRunning: boolean; tone?: 'done' }

const RUNNING_RESULT: ResultMark = { text: RUNNING_MARK, isRunning: true }

/**
 * A row's result mark: a settled row's, or a handed-off row's, which runs while its message is on its way and is ✓
 * once its press is done. It is blank otherwise, as while the message is unconfirmed, and keeps its place, so the
 * result does not move when its mark arrives. Null on an open row.
 */
export function rowResultMark(row: Pick<RowView, 'state' | 'feedback'>): ResultMark | null {
  if (row.state.is === 'settled') return settledMark(row.state)
  const f = row.feedback
  if (row.state.is !== 'handedOff' || !f) return null
  if (f.is === 'sending' || f.is === 'queued') return RUNNING_RESULT
  return isHandedOffDone(row)
    ? { text: SUBJECT_MARKS.done.mark, isRunning: false, tone: 'done' }
    : { text: '', isRunning: false }
}

/** Whether what a row sent is still on its way to the agent: `unconfirmed` and a refused send are not. */
function isSendMoving(delivery: ClosedDelivery): boolean {
  return delivery === 'sending' || delivery === 'queued'
}

export function allRows(v: InboxView): RowView[] {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]
}

export function settledRowIds(rows: RowView[]): string[] {
  return rows.filter(r => r.state.is === 'settled').map(r => r.id)
}

export function closedShown<T extends { id: string }>(closed: readonly T[], drawnSettled: ReadonlySet<string>): T[] {
  return closed.filter(d => !drawnSettled.has(d.id)).slice(0, CLOSED_SHOWN)
}

export function closedTotal(closed: { id: string }[], drawnSettled: ReadonlySet<string>): number {
  return closed.filter(d => !drawnSettled.has(d.id)).length
}

export function foldLabel(total: number): string {
  return `${total} closed`
}

export function earlierLabel(total: number, shown: number): string | null {
  return total > shown ? `${total - shown} earlier` : null
}

export function shortAgo(ms: number): string {
  const age = ago(ms)

  return age === 'just now' ? 'now' : age.replace(/ ago$/, '')
}

export function deliveryLabel(state: 'queued' | 'unconfirmed', label: string): string {
  return state === 'queued' ? `Queued: ${label}` : `Not confirmed: ${label}`
}

/** A settled row's mark: the one its line in the Closed list draws, so a row keeps its mark when it folds. */
export function settledMark(state: Pick<SettledState, 'delivery' | 'closedAs'>): ResultMark {
  return closedMark(state.closedAs, state.delivery)
}

/** A closed row's mark, as `CLOSED_MARKS` gives it: running while what it sent is on its way, else blank until it arrives. */
export function closedMark(state: ClosedState, delivery: ClosedDelivery): ResultMark {
  if (isSendMoving(delivery)) return RUNNING_RESULT
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

export function settledLabel(label: string, delivery: ClosedDelivery): string {
  if (delivery && typeof delivery === 'object') return `${label} · Not sent: ${delivery.error}`
  return delivery === null || delivery === 'sending' ? label : deliveryLabel(delivery, label)
}

/** A closed record's outcome as a look shows it. A finding a question replaced says where it went. */
export function outcomeLabel(c: { outcome: string; askedAs?: string }): string {
  return c.askedAs ? 'Now a question in Asks' : capitalized(c.outcome)
}
