import type { LocalResult, RowNote, LastAction, Turns, Finding, PressKind } from '../../types'
import { isAwaitingReply, isFoldingPress } from '../domain/last-actions'
import { isPrRowId } from '../domain/presses'
import type { RowPress } from '../domain/presses'
import { retryOf, isRepeatOf } from './pressed'
import { noteText } from './press-reducer'
import { SETTLED_MS, pendingDeliveryAt, COMPARE_LIMIT_MS, queuedSentAt } from './timing'
import { isHandedOffDone, isTerminalLike, DOT, deliveryLabel } from './rows'
import type { Look, RowView, RowState } from './rows'
import type { ViewInput } from './view'

export type Feedback =
  | { is: 'done'; label: string; at: number; isHandedStep?: true; isStillWaiting?: true }
  /** `isHandoff` is a hand-off's work, which can run for minutes, so it does not hold the tab's other rows in place. */
  | { is: 'working'; label: string; at: number; isHandoff?: true }
  | { is: 'stillOpen'; at: number }
  | { is: 'noComparison'; at: number }
  /** The labels of a message on its way read as the row draws them, from `deliveryLabel`, as "Queued: Yes" or "Queued reply: Call it hello". */
  | { is: 'sending'; label: string; at: number }
  | { is: 'queued'; label: string; at: number }
  | { is: 'unconfirmed'; label: string; at: number }
  | { is: 'notSent'; reason: string; retry: RowPress | null }
  /**
   * An open, copy or scroll's result. `talkOutSince` is when the row's talk press began, while that press still waits on
   * its reply under the result, so its button stays out.
   */
  | { is: 'local'; result: LocalResult; talkOutSince?: number }
  | { is: 'note'; note: RowNote['note']; at: number }
  | { is: 'closed'; label: string; at: number }

/** A press result's text on a row with no row view, as a PR row. A row whose mark says done shows a done result's bare label. */
export function markedFeedbackText(f: Feedback, isMarkDone: boolean, look: Look): string {
  return f.is === 'done' && isMarkDone ? f.label : feedbackText(f, look)
}

/** A handed-off row's ✓ leads its result line, so its result reads without its own ✓. */
export function rowFeedbackText(row: RowView, look: Look): string | null {
  const f = row.feedback
  if (!f) return null
  if (!isHandedOffDone(row)) return feedbackText(f, look)

  return f.is === 'done' ? f.label : f.is === 'local' ? localText(f.result, look) : feedbackText(f, look)
}

/**
 * When a row's press under way began, or null while none is: its talk press waits on the agent's reply, its message is
 * sending, or its open or copy runs. A settled row on its tab that was still in place when the press began waits for it
 * to end, so nothing shifts under the row being worked on. A queued or unconfirmed message does not count, since it can
 * wait a whole turn or for good. A message held for Undo counts from when its host sent it, so a row that folded while
 * it was held does not come back.
 */
export function pressUnderWaySince(f: Feedback | null): number | null {
  if (f?.is === 'working' || f?.is === 'sending') return f.at
  if (f?.is !== 'local') return null

  return f.talkOutSince ?? (f.result.state === 'pending' ? f.result.at : null)
}

/** `pressUnderWaySince` for the PRs tab's hold on its settled rows. A hand-off's work can run for minutes, so it does not hold them. */
export function prTabHoldSince(f: Feedback | null): number | null {
  return f?.is === 'working' && f.isHandoff === true ? null : pressUnderWaySince(f)
}

export function feedbackOf(
  id: string,
  last: LastAction | undefined,
  note: RowNote | undefined,
  turns: Turns,
  now: number,
  reportedAt?: number,
): Feedback | null {
  const result = last?.result
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: 'note', note: note.note, at: note.at }
  if (result && (result.state !== 'done' || now - result.at < SETTLED_MS)) {
    const under =
      last.kind === 'talk' ? feedbackOf(id, { ...last, result: undefined }, undefined, turns, now, reportedAt) : null
    const isTalkOut = under?.is === 'working' || under?.is === 'sending' || under?.is === 'queued'
    const talkOutSince = isTalkOut ? under.at : undefined

    return { is: 'local', result, ...(talkOutSince === undefined ? {} : { talkOutSince }) }
  }
  if (!last || last.kind === 'local') return null
  const delivery = last.delivery
  const pending = pendingDeliveryAt(last, now)
  if (pending === 'queued' || pending === 'unconfirmed')
    return { is: pending, label: deliveryLabel(pending, last.text, last.reply), at: last.at }
  if (delivery?.state === 'failed') return { is: 'notSent', reason: delivery.reason, retry: retryOf(id, last) }
  const isAwaiting = isAwaitingReply(last, turns)
  const isUnreported = last.action === 'compare' && !(reportedAt !== undefined && reportedAt >= last.at)
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS
  const working = WORKING_LABELS[last.action]
  const isHandoffWorking = last.kind === 'handoff' && isPrRowId(id) && last.repliedAt === undefined
  const isWorking = last.kind === 'talk' || isHandoffWorking
  if (isWorking && working && (isAwaiting || (isUnreported && !isPastLimit)))
    return {
      is: 'working',
      label: working,
      at: last.at,
      ...(last.kind === 'handoff' ? { isHandoff: true as const } : {}),
    }
  if (pending === 'sending')
    return { is: 'sending', label: deliveryLabel('sending', last.text, last.reply), at: queuedSentAt(last) }
  if (isUnreported) return { is: 'noComparison', at: last.at }
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: 'stillOpen', at: last.at }

  const isHandedStep = last.kind === 'handoff' && last.action.startsWith('step-')

  return {
    is: 'done',
    label: deliveryLabel('arrived', doneLabel(last), last.reply),
    at: last.at,
    ...(isHandedStep ? { isHandedStep: true as const } : {}),
    ...(STILL_WAITING_AFTER.has(last.action) ? { isStillWaiting: true as const } : {}),
  }
}

/**
 * The feedback a row draws in its state. A settled row draws none. A held row draws why it closed, unless a note shows
 * or a reply sent since the close failed.
 */
export function feedbackIn(
  id: string,
  state: RowState,
  last: LastAction | undefined,
  note: RowNote | undefined,
  turns: Turns,
  now: number,
  reportedAt?: number,
): Feedback | null {
  if (state.is === 'settled') return null
  const f = feedbackOf(id, last, note, turns, now, reportedAt)
  if (state.is !== 'held') return f
  const isFailedReply = f?.is === 'notSent' && last?.action === 'type' && last.at >= state.at

  return f?.is === 'note' || isFailedReply ? f : { is: 'closed', label: state.label, at: state.at }
}

/**
 * The feedback a row's buttons read their press from: the row's feedback without its note. A note, such as a stale
 * press's, does not end a press that is out, so its button stays out and ignores another press.
 */
export function pressFeedbackIn(
  id: string,
  state: RowState,
  last: LastAction | undefined,
  turns: Turns,
  now: number,
  reportedAt?: number,
): Feedback | null {
  return feedbackIn(id, state, last, undefined, turns, now, reportedAt)
}

export const fixLabel = (f: Pick<Finding, 'kind'>) => (f.kind === 'opportunity' ? 'Do it' : 'Fix')

const WORKING_LABELS: Record<string, string> = {
  explain: 'Explaining…',
  compare: 'Comparing…',
  discuss: 'Discussing…',
  'thread-discuss': 'Discussing…',
  'thread-draft': 'Drafting a reply…',
  'pr-rank-again': 'Ranking…',
  'pr-conflicts': 'Resolving conflicts…',
  'pr-address-all': 'Addressing…',
  'pr-merge': 'Merging…',
  'thread-address': 'Addressing…',
  'check-fix': 'Fixing…',
}

const DONE_LABELS: Record<string, (text: string) => string> = {
  address: () => 'Handed off',
  issue: () => 'Asked to file',
  discuss: () => 'Discussed',
  explain: () => 'Explained',
  compare: () => 'Compared',
  dismiss: () => 'Dismissed',
  type: () => 'Replied',
  'thread-address': () => 'Addressed',
  'thread-discuss': () => 'Discussed',
  'thread-draft': () => 'Drafted a reply',
  'pr-conflicts': () => 'Asked to resolve conflicts',
  'pr-merge': () => 'Asked to merge',
  'pr-address-all': text => text.replace(/^Address\b/, 'Addressed'),
  'check-fix': () => 'Asked to fix',
  'pr-rank-again': () => 'Ranked',
}

/** What a press reads once its message arrived, before a reply's words: "Replied", "Explained", or the label pressed. */
export function doneLabel(last: Pick<LastAction, 'action' | 'text'>): string {
  return DONE_LABELS[last.action]?.(last.text) ?? last.text
}

/** Presses after which their row still waits on the person, as a failing check does after Fix. */
const STILL_WAITING_AFTER = new Set(['check-fix'])

export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'notSent' || (f?.is === 'local' && f.result.state === 'failed')
}

export type FeedbackTone = 'error' | 'done' | 'muted'

/**
 * A press result's color. A done result carries the ✓ that says the press was made, in its text or in its row's mark
 * column, and takes that ✓'s color.
 */
export function feedbackTone(f: Feedback | null): FeedbackTone {
  if (isFailure(f)) return 'error'

  return f?.is === 'done' || (f?.is === 'local' && f.result.state === 'done') ? 'done' : 'muted'
}

export function hasAge(
  f: Feedback,
): f is Extract<
  Feedback,
  { is: 'done' | 'working' | 'stillOpen' | 'noComparison' | 'sending' | 'queued' | 'unconfirmed' | 'closed' }
> {
  return (
    f.is === 'done' ||
    f.is === 'working' ||
    f.is === 'stillOpen' ||
    f.is === 'noComparison' ||
    f.is === 'sending' ||
    f.is === 'queued' ||
    f.is === 'unconfirmed' ||
    f.is === 'closed'
  )
}

function isPressOut(f: Feedback | null): boolean {
  return (
    f?.is === 'working' ||
    f?.is === 'sending' ||
    f?.is === 'queued' ||
    f?.is === 'unconfirmed' ||
    (f?.is === 'local' && f.result.state === 'pending')
  )
}

/** The id of the action whose press is out on a row, as `actionId` makes it, or null. */
export function pressOutAction(last: LastAction | undefined, f: Feedback | null): string | null {
  if (f?.is === 'local' && f.result.state !== 'pending' && f.talkOutSince !== undefined) return last?.action ?? null
  if (!isPressOut(f)) return null

  return (f?.is === 'local' ? f.result.action : last?.action) ?? null
}

/**
 * The id of the action whose button draws dim and ignores another press until its press settles. A press that reads
 * Not confirmed does not, since pressing again is how the person resends a message that may be lost. A reply never
 * does, since each one sends new words.
 */
export function outAction(last: LastAction | undefined, f: Feedback | null): string | null {
  const action = f?.is === 'unconfirmed' ? null : pressOutAction(last, f)

  return action === 'type' ? null : action
}

/**
 * Whether a button reads "… again". A first press gains "again" only once it settles, so its button keeps its width
 * while the press is out. A repeat press keeps "again" throughout.
 */
export function isAgain(last: LastAction | undefined, action: string, isOut: boolean): boolean {
  return isRepeatOf(last, action) && (!isOut || last?.isRepeat === true)
}

/** What a PR row's buttons read their presses from. */
export type PressState = Pick<ViewInput, 'lastActions' | 'turns' | 'now'>

/**
 * A press status follows the row's title. While the press is out, an open row draws its status, such as "Comparing…",
 * under its buttons instead, so a status that wraps adds a line below them and never moves them. An open, copy or
 * scroll keeps its result there until it clears, done or failed, where "Opening plan.md…" read. A row that still waits
 * after its press, such as a failing check after Fix, keeps its done status there, beside the button that presses
 * again, as a PR block does.
 */
export function isStatusUnderActions(f: Feedback | null, isOpen: boolean): boolean {
  const isDoneStillWaiting = f?.is === 'done' && f.isStillWaiting === true

  return isOpen && (isPressOut(f) || f?.is === 'local' || isDoneStillWaiting)
}

/**
 * Whether a press of `kind` draws no status of its own while it is out, in a look that waits on the host's reply: a Mark
 * press, such as Dismiss, Done, an answer, or Set goal and Remove on the goal. Its reply changes the row, the PR block
 * or the goal in one move, often closing it, so a status that grew in for it would shrink again with that change, and
 * would turn back as it grew if the reply landed then. Its button draws out in the press's own draw instead, and the
 * reply shows the press. A status the row drew before the press stays as it was. `kind` is null for a press that no
 * plan action makes, such as a typed reply, which keeps its status.
 */
export const holdsStatusWhileOut = (kind: PressKind | null): boolean => kind === 'mark'

/**
 * Whether a row in the terminal and desktop looks draws a press status after its title, unless
 * `isStatusUnderActions` places it under the buttons. A status with an age and a Local result that did not fail
 * do. A failure takes its own line above an open row's buttons, in the error color, unless it is an open or copy's,
 * which stays under them.
 */
export function isAfterTitle(f: Feedback): boolean {
  return hasAge(f) || (f.is === 'local' && f.result.state !== 'failed')
}

const runIt = (look: Look) =>
  isTerminalLike(look) ? 'Run it in a terminal, or type ! and paste.' : 'Run it in Terminal.'
const VERBS = {
  open: { pending: 'Opening', done: 'Opened', failed: 'open' },
  copy: { pending: 'Copying', done: 'Copied', failed: 'copy' },
  'refresh-prs': { pending: 'Refreshing', done: 'Refreshed', failed: 'refresh' },
  rerun: { pending: 'Starting a re-run of', done: 'Started a re-run of', failed: 'start a re-run of' },
  scroll: { pending: 'Showing', done: 'Shown', failed: 'show' },
}
const doneText = (p: LocalResult['parts'][number]) =>
  p.kind === 'scroll' ? 'Shown in the conversation' : `${VERBS[p.kind].done} ${p.name}`

function localText(r: LocalResult, look: Look): string {
  const isPrs =
    r.parts.length > 1 && r.parts.every(p => p.kind === 'open' && p.error === null && /^PR #\d+$/.test(p.name))
  const parts = isPrs ? [{ ...r.parts[0]!, name: `${r.parts.length} PRs` }] : r.parts
  if (r.state === 'pending') return `${parts.map(p => `${VERBS[p.kind].pending} ${p.name}`).join(DOT)}…`
  const text = parts
    .map(p => (p.error === null ? doneText(p) : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`))
    .join(DOT)
  if (r.state === 'failed') return text
  const isCommand = parts.some(p => p.kind === 'copy' && p.isCommand)

  return `${text}${isCommand ? `. ${runIt(look)}` : ''}`
}

export function feedbackText(f: Feedback, look: Look): string {
  switch (f.is) {
    case 'note':
      return noteText()
    case 'local':
      return f.result.state === 'done' ? `✓ ${localText(f.result, look)}` : localText(f.result, look)
    case 'sending':
      return f.label
    case 'queued':
      return f.label
    case 'unconfirmed':
      return f.label
    case 'notSent':
      return `Not sent: ${f.reason}`
    case 'done':
      return f.isHandedStep ? `✓ Handed off: ${f.label}` : `✓ ${f.label}`
    case 'working':
      return f.label
    case 'stillOpen':
      return 'Still open'
    case 'noComparison':
      return 'No comparison came back'
    case 'closed':
      return f.label
  }
}
