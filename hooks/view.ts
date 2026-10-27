import type {
  Closed,
  ClosedFinding,
  Draft,
  Finding,
  Item,
  LastAction,
  Ledger,
  LocalResult,
  PressKind,
  RowNote,
  PageTab,
  Stop,
  OverviewStatus,
  Tab,
  Turns,
} from '../types'
import { isLapsed, reopenFinding, reopenItem } from './ledger'
import { awayOf, orderParts, workOf } from './overview'
import type { PartId } from './overview'
import { ago, clipLabel } from './text'
import { questionNumbers } from './model-text'
import type { ScreenTab } from './model-text'
import type { ListedTab } from './arrivals'
import type { ClosedState } from './ledger'
import {
  actionId,
  baseName,
  stepIconKind,
  capitalized,
  isAwaitingReply,
  isFixSent,
  ISSUE_LABEL,
  isFoldingPress,
  isHandedOff,
  isPrRowId,
  isRepeatOf,
  isUndoable,
  noteText,
  retryOf,
  stepsOf,
} from './presses'
import type { HelpStep, RowPress } from './presses'

const OPTIONS_FOLD_AT = 5
const OPTION_LABEL_CHARS = 32
// The digits switch tabs, and the letters left out are the
// keys of an Asks row's other actions and of moving the selection.
export const CHOICE_KEYS = [...'abcfghilm']
/**
 * The dot between parts of a drawn line, as "title · 3m ago", set apart by spaces wider than a space. The one before
 * it is a figure space, which never breaks, so a wrapped line ends with the dot instead of starting with it.
 */
export const DOT = '\u2007·\u2002'

export const FINDING_GROUPS: Record<Finding['kind'], { title: string; mark: string; tone: 'issue' | 'done' }> = {
  issue: { title: 'Issues', mark: '▲', tone: 'issue' },
  opportunity: { title: 'Opportunities', mark: '✦', tone: 'done' },
}

export const NEEDS_YOU_GROUPS: { kind: Item['kind']; title: string; list: 'questions' | 'tasks' }[] = [
  { kind: 'question', title: 'Questions', list: 'questions' },
  { kind: 'task', title: 'Tasks', list: 'tasks' },
]

export const CLOSED_MARKS: Record<ClosedState, string> = { handled: '✓', dismissed: '✕', lapsed: '' }

export const CLOSED_SHOWN = 3
export const SETTLED_MS = 5120

/** How long an ask waits before its permission row shows, where no classic.PermissionRequest hook runs. */
export const PERMISSION_FALLBACK_DELAY_MS = 1500
export const PRESS_GUARD_MS = 400
export const QUEUED_AFTER_MS = 1000
/** How long a Compare press waits for the agent to record the question again after its reply. */
export const COMPARE_LIMIT_MS = 30 * 60_000

/** When the soonest Compare press still inside its limit reaches it, so a look can redraw then. */
export function compareEndsAt(lastActions: Record<string, LastAction>, now: number): number | null {
  const ends = Object.values(lastActions)
    .filter(l => l.action === 'compare')
    .map(l => l.at + COMPARE_LIMIT_MS)
    .filter(at => at > now)

  return ends.length > 0 ? Math.min(...ends) : null
}

export function isQueuedAt(last: LastAction | undefined, now: number): boolean {
  return last?.delivery?.state === 'queued' && now - last.at >= QUEUED_AFTER_MS
}

function pendingDeliveryAt(last: LastAction | undefined, now: number): 'queued' | 'unconfirmed' | null {
  if (last?.delivery?.state === 'unconfirmed') return 'unconfirmed'
  return isQueuedAt(last, now) ? 'queued' : null
}

/** 0 means no click opened it, so nothing is guarded. */
export function isGuarded(openedAt: number, now: number): boolean {
  return openedAt > 0 && now - openedAt < PRESS_GUARD_MS
}

export type ItemStatus = { isUpdating: boolean; error: string | null }

export type ViewInput = {
  ledger: Ledger
  lastActions: Record<string, LastAction>
  notes: Record<string, RowNote>
  turns: Turns
  extraSteps: Record<string, HelpStep[]>
  settleWindowMs: number
  status: ItemStatus
  now: number
  /** The rows a reply in progress holds, from `heldReplies`: each row's id, and when its reply began. */
  replies: Record<string, number>
  /** The held rows whose reply the person discarded: each row's id, and when. */
  discarded: Record<string, number>
}

export type ReplyHolds = Pick<ViewInput, 'replies' | 'discarded'>

export const NO_HOLDS: ReplyHolds = { replies: {}, discarded: {} }

/** The row whose field is open and each row whose draft holds words. Opening a field gives its row a draft. */
export function heldReplies(typing: string | null, drafts: Record<string, Draft>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(drafts).flatMap(([id, d]) => (id === typing || d.text.trim() !== '' ? [[id, d.since]] : [])),
  )
}

export type ClosedDelivery = 'queued' | 'unconfirmed' | { error: string; canUndo: boolean } | null

export type RowState =
  | { is: 'open' }
  | { is: 'handedOff' }
  | { is: 'held'; label: string; at: number }
  | {
      is: 'settled'
      label: string
      at: number
      canUndo: boolean
      delivery: ClosedDelivery
      isLapsed: boolean
    }

export type Feedback =
  | { is: 'done'; label: string; at: number; isHandedStep?: true }
  | { is: 'working'; label: string; at: number }
  | { is: 'stillOpen'; at: number }
  | { is: 'noComparison'; at: number }
  | { is: 'queued'; label: string; at: number }
  | { is: 'unconfirmed'; label: string; at: number }
  | { is: 'notSent'; reason: string; retry: RowPress | null }
  | { is: 'local'; result: LocalResult }
  | { is: 'note'; note: RowNote['note']; at: number }
  | { is: 'closed'; label: string; at: number }

export type Look = 'terminal' | 'desktop' | 'codex' | 'omp'
export type ModLook = Exclude<Look, 'codex' | 'omp'>

const isTerminalLike = (look: Look) => look === 'terminal' || look === 'omp'

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
  handle: string
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
}

export type OptionDescription = { label: string; description: string; isFolded: boolean }

function optionDescriptionsOf(item: Item | null, actions: ActionView[]): OptionDescription[] {
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

export function rowMark(row: RowView, look: Look): { text: string; tone?: 'done' | 'issue' } {
  if (row.state.is === 'handedOff' && row.feedback?.is !== 'unconfirmed') return { text: '✓', tone: 'done' }
  if (row.finding) {
    const group = FINDING_GROUPS[row.finding.kind]
    return { text: group.mark, tone: group.tone }
  }
  return { text: isTerminalLike(look) ? row.handle : '' }
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

/** A press result's text on a row with no row view, as a PR row. A row whose mark says done shows a done result's bare label. */
export function markedFeedbackText(f: Feedback, isMarkDone: boolean, look: Look): string {
  return f.is === 'done' && isMarkDone ? f.label : feedbackText(f, look)
}

export function rowFeedbackText(row: RowView, look: Look): string | null {
  const f = row.feedback
  return f ? (f.is === 'done' && row.state.is === 'handedOff' ? f.label : feedbackText(f, look)) : null
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

export type ClosedView<T> = T & { delivery: ClosedDelivery; outcomeLabel: string }

export function allRows(v: InboxView): RowView[] {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]
}

export function settledRowIds(rows: RowView[]): string[] {
  return rows.filter(r => r.state.is === 'settled').map(r => r.id)
}

export function closedShown<T extends { id: string }>(closed: T[], drawnSettled: ReadonlySet<string>): T[] {
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

export function groupEmptyText(title: string): string {
  return `No open ${title.toLowerCase()}`
}

/** The message Resume sends after an API error stopped a turn. */
export const RESUME_TEXT = 'Continue'

/** True when Resume can continue past the stop. */
export function isResumable(stop: Stop): boolean {
  return stop.kind === 'api-error'
}

export function stopText(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return 'sign-in expired'
    case 'billing':
      return 'billing problem'
    case 'usage-limit':
      return 'usage limit reached'
    default:
      return stop.detail === 'rate_limit'
        ? 'the API is limiting requests'
        : stop.detail === 'overloaded'
          ? 'the API is overloaded'
          : `API error (${stop.detail})`
  }
}

export function stopFix(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return 'Run /login, then send a message to resume.'
    case 'billing':
      return 'Check billing in the Claude console, then resume.'
    case 'usage-limit':
      return stop.resets ? `Resume after ${stop.resets}.` : 'Resume when the limit resets.'
    default:
      return 'Send a message to resume.'
  }
}

export const DEMO_NOTICE = 'Sample entries. Buttons here send nothing.'
export const READING_TEXT = 'Reading the inbox…'

/**
 * A checkout that follows the `next` branch can hold this file in each folder a host installs or loads: the repo root,
 * `codex/plugin` and `omp`. Git ignores it, and the Codex and omp installs copy it.
 */
export const NEXT_BUILD_MARK = '.next-build'

export function versionLabel(version: string, isNextBuild: boolean): string {
  return isNextBuild ? `v${version} · next` : `v${version}`
}

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing.'
const UPDATE_RETRIES = ' It retries after your next message.'

function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const newestReplyFirst = (kind: Item['kind']) =>
    ledger.items.filter(i => i.kind === kind).sort((a, b) => b.turn - a.turn)

  return { questions: newestReplyFirst('question'), tasks: newestReplyFirst('task') }
}

export function showsCompare(item: Pick<Item, 'kind' | 'options' | 'isDesignChoice'>): boolean {
  return item.kind === 'question' && item.isDesignChoice === true && item.options.length >= 2
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
  if (result && (result.state !== 'done' || now - result.at < SETTLED_MS)) return { is: 'local', result }
  if (!last || last.kind === 'local') return null
  const delivery = last.delivery
  const pending = pendingDeliveryAt(last, now)
  if (pending) return { is: pending, label: last.text, at: last.at }
  if (delivery?.state === 'failed') return { is: 'notSent', reason: delivery.reason, retry: retryOf(id, last) }
  const isAwaiting = isAwaitingReply(last, turns)
  const isUnreported = last.action === 'compare' && !(reportedAt !== undefined && reportedAt >= last.at)
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS
  const working = WORKING_LABELS[last.action]
  if (last.kind === 'talk' && working && (isAwaiting || (isUnreported && !isPastLimit)))
    return { is: 'working', label: working, at: last.at }
  if (isUnreported) return { is: 'noComparison', at: last.at }
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: 'stillOpen', at: last.at }

  const isHandedStep = last.kind === 'handoff' && last.action.startsWith('step-')

  return {
    is: 'done',
    label: DONE_LABELS[last.action]?.(last.text) ?? last.text,
    at: last.at,
    ...(isHandedStep ? { isHandedStep: true as const } : {}),
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

const fixLabel = (f: Pick<Finding, 'kind'>) => (f.kind === 'opportunity' ? 'Do it' : 'Fix')

const WORKING_LABELS: Record<string, string> = {
  explain: 'Explaining…',
  compare: 'Comparing…',
  discuss: 'Discussing…',
  'thread-discuss': 'Discussing…',
  'thread-draft': 'Drafting a reply…',
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
}

export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'notSent' || (f?.is === 'local' && f.result.state === 'failed')
}

export function hasAge(
  f: Feedback,
): f is Extract<
  Feedback,
  { is: 'done' | 'working' | 'stillOpen' | 'noComparison' | 'queued' | 'unconfirmed' | 'closed' }
> {
  return (
    f.is === 'done' ||
    f.is === 'working' ||
    f.is === 'stillOpen' ||
    f.is === 'noComparison' ||
    f.is === 'queued' ||
    f.is === 'unconfirmed' ||
    f.is === 'closed'
  )
}

export function isPressOut(f: Feedback | null): boolean {
  return (
    f?.is === 'working' ||
    f?.is === 'queued' ||
    f?.is === 'unconfirmed' ||
    (f?.is === 'local' && f.result.state === 'pending')
  )
}

/** The id of the action whose press is out on a row, as `actionId` makes it, or null. */
export function pressOutAction(last: LastAction | undefined, f: Feedback | null): string | null {
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
 * under its buttons instead, so a status that wraps adds a line below them and never moves them.
 */
export function isStatusUnderActions(f: Feedback | null, isOpen: boolean): boolean {
  return isOpen && isPressOut(f)
}

/**
 * Whether a row in the terminal and desktop looks draws a press status after its title, once
 * `isStatusUnderActions` has placed a press that is out. A status with an age and a Local result that did not fail
 * do. A failure takes its own line above an open row's buttons, in the error color.
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
}

function localText(r: LocalResult, look: Look): string {
  const isPrs =
    r.parts.length > 1 && r.parts.every(p => p.kind === 'open' && p.error === null && /^PR #\d+$/.test(p.name))
  const parts = isPrs ? [{ ...r.parts[0]!, name: `${r.parts.length} PRs` }] : r.parts
  if (r.state === 'pending') return `${parts.map(p => `${VERBS[p.kind].pending} ${p.name}`).join(DOT)}…`
  const text = parts
    .map(p =>
      p.error === null ? `${VERBS[p.kind].done} ${p.name}` : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`,
    )
    .join(DOT)
  if (r.state === 'failed') return text
  const isCommand = parts.some(p => p.kind === 'copy' && p.isCommand)

  return `✓ ${text}${isCommand ? `. ${runIt(look)}` : ''}`
}

export function feedbackText(f: Feedback, look: Look): string {
  switch (f.is) {
    case 'note':
      return noteText()
    case 'local':
      return localText(f.result, look)
    case 'queued':
      return deliveryLabel(f.is, f.label)
    case 'unconfirmed':
      return deliveryLabel(f.is, f.label)
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

function deliveryLabel(state: 'queued' | 'unconfirmed', label: string): string {
  return state === 'queued' ? `Queued: ${label}` : `Not confirmed: ${label}`
}

/** A settled row's mark: ✓ once nothing it sent is on its way, else blank. */
export function settledMark(delivery: ClosedDelivery): string {
  return delivery === null ? '✓' : ''
}

/** A closed row's mark: blank while what it sent is on its way. */
export function closedMark(state: ClosedState, delivery: ClosedDelivery): string {
  return delivery === null ? CLOSED_MARKS[state] : ''
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
export function settledTone(state: { delivery: ClosedDelivery; isLapsed: boolean }): 'done' | 'muted' {
  return state.delivery === null && !state.isLapsed ? 'done' : 'muted'
}

export function settledLabel(label: string, delivery: ClosedDelivery): string {
  if (delivery && typeof delivery === 'object') return `${label} · Not sent: ${delivery.error}`
  return delivery === null ? label : deliveryLabel(delivery, label)
}

function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

/** Any tab a look can show: a row tab or a page tab. */
export type ShownTab = Tab | PageTab

/** The band and the inbox model always read a tab's words. A look draws its symbol in their place where the words do not fit. */
type TabName = { id: ShownTab; label: string; symbol: string }

/** A tab a build draws, with the number key that shows it. */
export type DrawnTab = TabName & { hotkey: string }

const TAB_NAMES: readonly TabName[] = [
  { id: 'overview', label: 'Overview', symbol: '\u{1F9ED}' },
  { id: 'needsYou', label: 'Asks', symbol: '\u{1F64B}' },
  { id: 'findings', label: 'Finds', symbol: '\u{1F50D}' },
  { id: 'prs', label: 'PRs', symbol: '\u{1F500}' },
]

const numbered = (tabs: readonly TabName[]): readonly DrawnTab[] =>
  tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }))

const NEXT_BUILD_TABS = numbered(TAB_NAMES)
const RELEASE_TABS = numbered(TAB_NAMES.filter(t => t.id !== 'overview'))

/** The tabs a build draws, in order, each keyed by its place. Only a next build draws the Overview. */
export function shownTabs(isNextBuild: boolean): readonly DrawnTab[] {
  return isNextBuild ? NEXT_BUILD_TABS : RELEASE_TABS
}

/** The tab a build draws for a saved or sent one: that tab when the build draws it, else the build's first tab. */
export function drawnTabOf(tab: ShownTab, isNextBuild: boolean): ShownTab {
  const tabs = shownTabs(isNextBuild)

  return tabs.some(t => t.id === tab) ? tab : tabs[0]!.id
}

/** How a look names its tabs: by their words, or by their symbols. */
export type TabNaming = 'words' | 'symbols'

/** The namings a look tries, in order: the words wherever they fit, and the symbols only where they do not. */
export const TAB_NAMINGS: readonly TabNaming[] = ['words', 'symbols']

export function tabName(tab: { label: string; symbol: string }, naming: TabNaming): string {
  return naming === 'words' ? tab.label : tab.symbol
}

/**
 * The naming and layout a look draws its tabs in: the words at the first of the look's layouts, roomiest first, where
 * they fit on one line, else the symbols at the first layout where those fit. When neither fits, the symbols at the
 * tightest layout, which the look wraps or cuts.
 */
export function fitTabs<L>(
  layouts: readonly L[],
  fits: (naming: TabNaming, layout: L) => boolean,
): {
  naming: TabNaming
  layout: L
} {
  for (const naming of TAB_NAMINGS) for (const layout of layouts) if (fits(naming, layout)) return { naming, layout }

  return { naming: 'symbols', layout: layouts.at(-1)! }
}
/** Whether a shown tab lists rows you answer or close: Asks and Finds. */
export function isListedTab(tab: ShownTab): tab is ListedTab {
  return tab === 'needsYou' || tab === 'findings'
}

/** Whether a shown tab is a row tab, which has rows, a count and a cursor. */
export function isRowTab(tab: ShownTab): tab is Tab {
  return tab !== 'overview'
}

/** Whether a saved or sent value names a tab that some build draws. */
export function isShownTab(raw: unknown): raw is ShownTab {
  return TAB_NAMES.some(t => t.id === raw)
}

/** The tab a look shows, as the inbox model is told. */
export function screenTabOf(tab: ShownTab): ScreenTab {
  return { label: TAB_NAMES.find(t => t.id === tab)?.label ?? tab, isPage: !isRowTab(tab) }
}

/** The tabs that list rows: Asks, Finds and PRs. */
export const ROW_TABS = TAB_NAMES.filter((t): t is TabName & { id: Tab } => isRowTab(t.id))

export const LISTED_TABS = TAB_NAMES.filter((t): t is TabName & { id: ListedTab } => isListedTab(t.id))

/** A line on the Overview page. A null tone draws the mark muted. */
export type OverviewRow = {
  id: string
  mark: string
  tone: 'needsYou' | 'done' | 'issue' | null
  /**
   * Whether the work is running now, so a look animates the mark. A stream runs in its own session, so its status
   * holds while this one is idle. Any other row runs only while this session's turn does.
   */
  isRunning: boolean
  text: string
  detail: string | null
}

/** One text line of the page: the headline, why the direction changed, how it is going, a pointer to the Inbox, or a quiet note. */
export type OverviewLead = {
  id: 'headline' | 'course' | 'status' | 'pointer' | 'quiet'
  text: string
  /** Whether a blank line separates it from the line above, as when the status follows a course or the pointer follows the status. */
  hasGapAbove: boolean
}

export type OverviewSection = { id: string; title: string; rows: OverviewRow[] }

/** What the Overview page shows. Every look draws it as it is. */
export type OverviewPage = {
  isEmpty: boolean
  /** The text lines above the lists, in the order to draw them. */
  lead: OverviewLead[]
  sections: OverviewSection[]
  /** One line for each earlier topic, oldest first. */
  earlier: string[]
  empty: { title: string; hint: string }
}

export const WORKING_TEXT = 'Working…'

const OVERVIEW_MARKS: Record<OverviewStatus, Pick<OverviewRow, 'mark' | 'tone'>> = {
  working: { mark: '●', tone: null },
  queued: { mark: '○', tone: null },
  'waits-on-you': { mark: '◆', tone: 'needsYou' },
  'waits-on-other': { mark: '◌', tone: null },
  done: { mark: '✓', tone: 'done' },
  'ruled-out': { mark: '✗', tone: null },
  problem: { mark: '!', tone: 'issue' },
  unknown: { mark: '?', tone: null },
}

/** A section's title. Every section has one, so rows never sit directly under the lead lines without a name. */
const SECTION_TITLES: Partial<Record<PartId, string>> = {
  workstreams: 'Streams',
  queue: 'Work',
  since: 'Since you looked',
  works: 'What works now',
  open: 'Still open',
  next: 'Next',
}

/** The heading over the Overview's earlier topics. `place` is the host's word for a conversation with the agent. */
export function earlierTitle(place: string): string {
  return `Earlier in this ${place}`
}

/** The marks a running row cycles through in the text looks, one each `RUNNING_FRAME_MS`. */
export const RUNNING_FRAMES = ['●', '◉', '◎', '◉'] as const

export const RUNNING_FRAME_MS = 300

/** One pulse of a running mark, which the Codex tab and the desktop pane draw as a fade. */
export const RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS

export function hasRunningMark(page: OverviewPage): boolean {
  return page.sections.some(p => p.rows.some(r => r.isRunning))
}

/** A running row's mark at `now`. Every mark on a page takes its frame from the clock, so all of them move together. */
export function runningMark(now: number): string {
  return RUNNING_FRAMES[Math.floor(now / RUNNING_FRAME_MS) % RUNNING_FRAMES.length]!
}

export const QUIET_TEXT = 'Nothing new since you looked.'

export function pointerText(count: number): string | null {
  return count === 0 ? null : count === 1 ? 'Asks has 1 item.' : `Asks has ${count} items.`
}

/** `parts` with `id` placed after the headline and the course. */
function withAfterHeading(parts: PartId[], id: PartId): PartId[] {
  const at = parts.filter(p => p === 'headline' || p === 'course').length

  return [...parts.slice(0, at), id, ...parts.slice(at)]
}

export function overviewPage(
  s: { ledger: Pick<Ledger, 'overview'>; presence: { isTurnRunning: boolean }; stop?: unknown },
  now: number,
  waitingOnYou = 0,
): OverviewPage {
  const { overview } = s.ledger
  const { isTurnRunning } = s.presence
  const headline = overview?.headline || null
  const parts = overview
    ? orderParts(
        overview,
        overview.look?.away ?? awayOf(overview.lastLookAt, now),
        workOf(overview, { isTurnRunning, isStopped: Boolean(s.stop), waitingOnYou }),
      )
    : []
  const sections = overview
    ? parts.flatMap(id => {
        const title = SECTION_TITLES[id]
        if (title === undefined) return []

        const rows = overview[id as 'queue'].map((item, n) => ({
          id: `${id}-${n}`,
          ...OVERVIEW_MARKS[item.status],
          isRunning: item.status === 'working' && (id === 'workstreams' || isTurnRunning),
          text: item.text,
          detail: item.detail,
        }))

        return rows.length > 0 ? [{ id, title, rows }] : []
      })
    : []

  const texts: Record<OverviewLead['id'], string | null> = {
    headline,
    course: overview?.course || null,
    status: isTurnRunning ? WORKING_TEXT : overview?.status || null,
    pointer: pointerText(waitingOnYou),
    quiet: QUIET_TEXT,
  }
  const withWorking: PartId[] = isTurnRunning && !parts.includes('status') ? withAfterHeading(parts, 'status') : parts
  const leadIds: PartId[] = overview ? withWorking : isTurnRunning ? ['status'] : []
  const lead = leadIds
    .flatMap(id => {
      const text = id in texts ? texts[id as OverviewLead['id']] : null

      return text === null ? [] : [{ id: id as OverviewLead['id'], text, hasGapAbove: false }]
    })
    .map((line, n, all) => ({ ...line, hasGapAbove: n > 0 && all[n - 1]!.id !== 'headline' }))

  return {
    isEmpty: headline === null && !isTurnRunning,
    lead,
    sections,
    earlier: parts.includes('earlier') ? (overview?.earlier ?? []) : [],
    empty: {
      title: 'Overview',
      hint: "Where the work stands and where it's heading. It fills in once the work starts.",
    },
  }
}

export function emptyText(tab: 'needsYou' | 'findings', agent: string): { title: string; hint: string } {
  return tab === 'needsYou'
    ? { title: 'Nothing needed', hint: `${agent}'s questions and the tasks only you can do show up here.` }
    : { title: 'No findings yet', hint: `${agent} flags issues and opportunities it spots beyond your task.` }
}

const FOLLOW_UPS: ReadonlySet<RowPress['action']> = new Set([
  'type',
  'explain',
  'compare',
  'discuss',
  'dismiss',
  'discard',
])
const ACTION_KEYS: Partial<Record<RowPress['action'], string>> = {
  done: 'd',
  address: 'a',
  issue: 'i',
  type: 't',
  explain: 'e',
  compare: 'p',
  discuss: 'd',
  dismiss: 'x',
  discard: 'x',
}

function actionsOf(
  row: { id: string; item: Item | null; finding: Finding | null; steps: HelpStep[] },
  last: LastAction | undefined,
  state: RowState,
  feedback: Feedback | null,
): ActionView[] {
  const { id, item, steps } = row
  const pressing = pressOutAction(last, feedback)
  const out = outAction(last, feedback)
  const action = (
    press: RowPress,
    label: string,
    kind: PressKind,
    flags: Partial<Pick<ActionView, 'isPrimary' | 'isFolded'>> = {},
  ): ActionView => {
    const pressAction = actionId(press)

    return {
      press,
      label: press.action !== 'type' && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis:
        flags.isPrimary || press.action === 'done' || press.action === 'address'
          ? 'primary'
          : press.action === 'discuss' ||
              press.action === 'explain' ||
              press.action === 'compare' ||
              press.action === 'dismiss' ||
              press.action === 'discard'
            ? 'quiet'
            : 'normal',
      ...(press.action === 'done'
        ? { icon: 'done' as const }
        : press.action === 'step' && stepIconKind(steps[press.step])
          ? { icon: stepIconKind(steps[press.step])! }
          : {}),
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...(ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {}),
      isOut: out === pressAction,
    }
  }
  if (state.is === 'settled') return state.canUndo ? [action({ action: 'undo', id }, 'Undo', 'view')] : []
  if (state.is === 'held')
    return [
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'discard', id }, ROW_COPY.discard, 'view'),
    ]
  const stepActions = steps.map((s, n) => action({ action: 'step', id, step: n, label: s.label }, s.label, stepKind(s)))
  if (!item)
    return [
      action({ action: 'address', id }, row.finding ? fixLabel(row.finding) : 'Fix', 'handoff'),
      action({ action: 'issue', id }, ISSUE_LABEL, 'handoff'),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'explain', id }, 'Explain', 'talk'),
      action({ action: 'discuss', id }, 'Discuss', 'talk'),
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  if (item.kind === 'task')
    return [
      ...stepActions,
      action({ action: 'done', id }, 'Done', 'mark'),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'explain', id }, 'Explain', 'talk'),
    ]
  const isFolding = item.options.length > OPTIONS_FOLD_AT
  const options =
    item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter(o => o !== item.rec)] : item.options

  return [
    ...options.map((option, n) =>
      action({ action: 'answer', id, option }, clipLabel(option, OPTION_LABEL_CHARS), 'mark', {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
      }),
    ),
    ...stepActions,
    action({ action: 'type', id, text: '' }, 'Reply', 'mark'),
    action({ action: 'explain', id }, 'Explain', 'talk'),
    ...(showsCompare(item) ? [action({ action: 'compare', id }, 'Compare', 'talk')] : []),
    action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
  ]
}

export type DrawnEntry<R> = { row: R } | { settled: RowView; state: Extract<RowState, { is: 'settled' }> }

export type DrawnLists<R> = {
  questions: DrawnEntry<R>[]
  tasks: DrawnEntry<R>[]
  findings: DrawnEntry<R>[]
  findingGroups: { kind: Finding['kind']; title: string; entries: DrawnEntry<R>[] }[]
  byTab: { needsYou: R[]; findings: R[] }
}

export function drawnLists<R>(
  v: InboxView,
  isSettledDrawn: (id: string) => boolean,
  toRow: (r: RowView) => R | null,
): DrawnLists<R> {
  const entries = (rows: RowView[]) =>
    rows.flatMap((r): DrawnEntry<R>[] => {
      if (r.state.is === 'settled') return isSettledDrawn(r.id) ? [{ settled: r, state: r.state }] : []
      const row = toRow(r)
      return row === null ? [] : [{ row }]
    })
  const questions = entries(v.needsYou.questions)
  const tasks = entries(v.needsYou.tasks)
  const findingGroups = (Object.keys(FINDING_GROUPS) as Finding['kind'][]).map(kind => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    entries: entries(v.findings.rows.filter(r => r.finding?.kind === kind)),
  }))
  const findings = findingGroups.flatMap(g => g.entries)

  return {
    questions,
    tasks,
    findings,
    findingGroups,
    byTab: { needsYou: [...rowsIn(questions), ...rowsIn(tasks)], findings: rowsIn(findings) },
  }
}

export function entryId(x: DrawnEntry<{ id: string }>): string {
  return 'row' in x ? x.row.id : x.settled.id
}

export type RowWait = { id: string; isWaiting: boolean }

export function listWaits(v: InboxView): { needsYou: RowWait[]; findings: RowWait[] } {
  const lists = drawnLists(
    v,
    () => true,
    r => r,
  )
  const waits = (entries: DrawnEntry<RowView>[]) =>
    entries.map(x =>
      'row' in x ? { id: x.row.id, isWaiting: isWaitingRow(x.row) } : { id: x.settled.id, isWaiting: false },
    )

  return { needsYou: waits([...lists.questions, ...lists.tasks]), findings: waits(lists.findings) }
}

export function firstWaiting(rows: RowWait[]): string | null {
  return rows.find(r => r.isWaiting)?.id ?? null
}

export function keptOpen(rows: RowWait[], added: readonly string[]): string | null {
  return firstWaiting(rows.filter(r => !added.includes(r.id)))
}

export function rowAfterClose(rows: RowWait[], closedId: string): string | null {
  const at = rows.findIndex(r => r.id === closedId)
  if (at < 0) return null

  return (
    (
      rows.slice(at + 1).find(r => r.isWaiting) ??
      rows
        .slice(0, at)
        .reverse()
        .find(r => r.isWaiting)
    )?.id ?? null
  )
}

export function rowsIn<R>(entries: DrawnEntry<R>[]): R[] {
  return entries.flatMap(x => ('row' in x ? [x.row] : []))
}

export function settledIn(entries: DrawnEntry<unknown>[]): Set<string> {
  return new Set(entries.flatMap(x => ('settled' in x ? [x.settled.id] : [])))
}

export type ActionKey = { slot: 'action'; action: ActionView; hotkey: string }

export type PlannedKey =
  | { slot: 'retry'; press: RowPress; kind: PressKind; label: string; emphasis: 'normal'; icon: 'retry' }
  | {
      slot: 'choice'
      action: ActionView & { press: Extract<RowPress, { action: 'answer' | 'step' }> }
      hotkey?: string
    }
  | { slot: 'allOptions'; count: number; label: string; emphasis: 'quiet' }
  | ActionKey

export function rowKeyPlan(r: RowView, isAllShown: boolean): { keys: PlannedKey[]; more: ActionKey[] } {
  const shown = r.actions.filter(a => isAllShown || !a.isFolded)
  const folded = r.actions.length - shown.length
  const lastOption = shown.map(a => a.press.action).lastIndexOf('answer')
  const keys: PlannedKey[] = []
  const more: ActionKey[] = []
  const retry = r.feedback?.is === 'notSent' ? r.feedback.retry : null
  if (retry) {
    const kind = r.actions.find(a => actionId(a.press) === actionId(retry))?.kind ?? 'talk'
    keys.push({ slot: 'retry', press: retry, kind, label: ROW_COPY.retry, emphasis: 'normal', icon: 'retry' })
  }
  let letters = 0
  for (const [n, a] of shown.entries()) {
    const { press } = a
    if (press.action === 'answer' || press.action === 'step') {
      const hotkey = letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++]! } : {}
      keys.push({ slot: 'choice', action: { ...a, press }, ...hotkey })
      if (n === lastOption && folded > 0)
        keys.push({
          slot: 'allOptions',
          count: r.actions.filter(x => x.press.action === 'answer').length,
          label: ROW_COPY.allOptions(r.actions.filter(x => x.press.action === 'answer').length),
          emphasis: 'quiet',
        })
    } else if (a.hotkey)
      (a.isFollowUp ? more : keys).push({
        slot: 'action',
        action: a,
        hotkey: a.hotkey,
      })
  }

  return { keys, more }
}

/** Widths in a look's own unit. `separator` is the extra room a look draws between the buttons and the follow-ups when they share a line. */
export type ActionSpacing = { width: number; gap: number; separator: number }

/**
 * Lays out a row's buttons, then its follow-ups, filling each line before the next. The follow-ups stay on the
 * buttons' last line only when all of them fit there. Otherwise they start the next line together, and wrap among
 * themselves. Each line lists indexes into the buttons followed by the follow-ups.
 */
export function actionLines(
  keys: readonly number[],
  more: readonly number[],
  { width, gap, separator }: ActionSpacing,
): { lines: number[][]; isFollowUpLineNew: boolean } {
  const lines: number[][] = []
  let used = 0
  const place = (at: number, size: number, before: number) => {
    const line = lines.at(-1)
    if (line && used + before + size <= width) {
      line.push(at)
      used += before + size
    } else {
      lines.push([at])
      used = size
    }
  }
  keys.forEach((size, i) => place(i, size, gap))
  const followUpsWidth = more.reduce((sum, size) => sum + size, gap * Math.max(0, more.length - 1))
  const isFollowUpLineNew = keys.length > 0 && more.length > 0 && used + gap + separator + followUpsWidth > width
  more.forEach((size, i) => {
    if (i === 0 && isFollowUpLineNew) {
      lines.push([keys.length])
      used = size
    } else place(keys.length + i, size, i === 0 ? gap + separator : gap)
  })

  return { lines, isFollowUpLineNew }
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
}: ViewInput): InboxView {
  const isSettling = (at: number) => now - at < settleWindowMs
  const isOpen = (id: string) => ledger.items.some(i => i.id === id) || ledger.findings.some(f => f.id === id)
  const closedAt = (c: Closed | ClosedFinding) => ('closedAt' in c ? c.closedAt : c.at)
  const replyAfter = (c: Closed | ClosedFinding) => {
    const last = lastActions[c.id]

    return last?.action === 'type' && last.at >= closedAt(c) && last.delivery?.state !== 'failed' && isSettling(last.at)
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
  const isPlaced = (c: Closed | ClosedFinding) =>
    replyAfter(c) !== null || (!isDiscarded(c) && (isHeld(c) || isSettling(closedAt(c))))
  const placedItems = new Map(
    ledger.closed.filter(d => d.item && !isOpen(d.id) && isPlaced(d)).map(d => [d.id, d] as const),
  )
  const isFixSettled = (id: string) => {
    const last = lastActions[id]

    return isFixSent(last) && !isSettling(last.at)
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
          delivery: pendingDeliveryAt(reply, now),
          isLapsed: false,
        }
      if (isHeld(closed)) return { is: 'held', label: heldLabel(closed), at }

      return {
        is: 'settled',
        label: outcomeLabel(closed),
        at,
        canUndo: isUndoable(closed),
        isLapsed: isLapsed(closed),
        delivery:
          'doneNotification' in closed && closed.doneNotification?.error !== undefined
            ? { error: closed.doneNotification.error, canUndo: isUndoable(closed) }
            : (closed.how === 'answered' || closed.how === 'done') && last?.kind === 'mark' && last.at === at
              ? pendingDeliveryAt(last, now)
              : null,
      }
    }

    const last = lastActions[id]
    const sent = ledger.findings.find(f => f.id === id)
    if (sent && isFixSent(last))
      return {
        is: 'settled',
        label: fixLabel(sent),
        at: last.at,
        canUndo: true,
        delivery: pendingDeliveryAt(last, now),
        isLapsed: false,
      }

    return isHandedOff(last, turns) ? { is: 'handedOff' } : { is: 'open' }
  }
  const rowOf = (row: Omit<RowView, 'state' | 'feedback' | 'actions' | 'optionDescriptions'>): RowView => {
    const state = stateOf(row.id)
    const last = lastActions[row.id]
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt)
    // A button must keep its width while its press is out, or the buttons after it can move to another line.
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt))

    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
    }
  }
  const itemRow = (item: Item): RowView => {
    const n = numbers.get(item.id)

    return rowOf({
      id: item.id,
      type: item.kind,
      handle: n === undefined ? '•' : `${n})`,
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
        handle: '•',
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
    .map(d => ({
      ...d,
      outcomeLabel: outcomeLabel(d),
      delivery:
        d.doneNotification?.error !== undefined
          ? { error: d.doneNotification.error, canUndo: isUndoable(d) }
          : (d.how === 'answered' || d.how === 'done') &&
              lastActions[d.id]?.kind === 'mark' &&
              lastActions[d.id]?.at === d.at
            ? pendingDeliveryAt(lastActions[d.id], now)
            : null,
    }))
  const fixesSent: ClosedView<ClosedFinding>[] = ledger.findings
    .filter(f => isFixSent(lastActions[f.id]))
    .map(f => {
      const outcome = fixLabel(f)

      return {
        ...f,
        how: 'answered',
        outcome,
        outcomeLabel: outcomeLabel({ ...f, outcome }),
        closedAt: lastActions[f.id]!.at,
        delivery: pendingDeliveryAt(lastActions[f.id], now),
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
          .map(f => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null as null })),
        ...fixesSent,
      ].sort((a, b) => b.closedAt - a.closedAt),
    },
    status,
  }
}

/** A closed record's outcome as a look shows it. A finding a question replaced says where it went. */
export function outcomeLabel(c: { outcome: string; askedAs?: string }): string {
  return c.askedAs ? 'Now a question in Asks' : capitalized(c.outcome)
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
 * tab but the PRs tab.
 */
export function footerStatus(
  tab: ShownTab,
  status: ItemStatus,
  prs: { isFetching: boolean; hasPrs: boolean },
): { text: string | null; error: string | null } {
  if (tab === 'prs') return { text: prs.isFetching && prs.hasPrs ? REFRESHING_PRS_TEXT : null, error: null }

  return { text: status.isUpdating ? UPDATING_TEXT : null, error: status.error }
}

export function perTurnStatus(update: { isUpdating: boolean; isFailed: boolean; retries: boolean }): ItemStatus {
  return {
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : '') : null,
  }
}
