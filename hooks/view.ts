import type {
  Closed,
  ClosedFinding,
  Draft,
  FoldKind,
  Finding,
  Item,
  LastAction,
  Ledger,
  LocalResult,
  SessionStatus,
  PressKind,
  RowNote,
  PageTab,
  Stop,
  Session,
  SubjectStatus,
  Subject,
  Child,
  Tab,
  Turns,
} from '../types'
import { closedAt, closedState, reopenFinding, reopenItem } from './ledger'
import { isChildRunning, isOpen } from './status'
import { ago, clipLabel, cutAtPhrase } from './text'
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
  offersUndo,
  retryOf,
  stepsOf,
} from './presses'
import type { HelpStep, RowPress } from './presses'
import type { BannerTone, ToneName } from './tones'

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

export const SUBJECT_MARKS: Record<SubjectStatus, { mark: string; tone: StatusTone }> = {
  working: { mark: '●', tone: null },
  queued: { mark: '○', tone: null },
  'waits-on-other': { mark: '◌', tone: null },
  done: { mark: '✓', tone: 'done' },
  dropped: { mark: '✗', tone: null },
}
/** The mark of an open subject that an open ask holds up, in place of its status's mark, and of a delegate that waits for the person. */
export const HELD_MARK: { mark: string; tone: 'needsYou' } = { mark: '◆', tone: 'needsYou' }

/** The marks a running row cycles through in the text looks, one each `RUNNING_FRAME_MS`. */
export const RUNNING_FRAMES = ['●', '◉', '◎', '◉'] as const

/** The running mark's first frame, the one a look draws still. */
export const RUNNING_MARK = RUNNING_FRAMES[0]

export const CLOSED_MARKS: Record<ClosedState, string> = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: '✕',
  lapsed: SUBJECT_MARKS.dropped.mark,
}

/** A PR row's mark: a review thread that waits on the person, one sent to the agent, and a failing check. */
export const PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: 'needsYou' },
  sent: { text: SUBJECT_MARKS.done.mark, tone: 'done' },
  failing: { text: FINDING_GROUPS.issue.mark, tone: 'error' },
} as const

/** One mark the legend explains. `isRunning` draws it as the running mark. */
export type LegendEntry = { mark: string; tone: ToneName | null; isRunning: boolean; words: string }

/** Every mark a look draws on a row or a group title, once each, with what it means wherever it appears. */
export const MARK_LEGEND: readonly LegendEntry[] = [
  {
    mark: RUNNING_MARK,
    tone: null,
    isRunning: true,
    words: 'Working. It moves while the work runs or your message is on its way.',
  },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: 'Queued: not started yet' },
  {
    mark: SUBJECT_MARKS['waits-on-other'].mark,
    tone: null,
    isRunning: false,
    words: 'Waits on something other than you, such as a build or a review',
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: 'Waits on you' },
  { mark: SUBJECT_MARKS.done.mark, tone: 'done', isRunning: false, words: 'Done, or handed to the agent' },
  { mark: SUBJECT_MARKS.dropped.mark, tone: null, isRunning: false, words: 'Dropped before it was done' },
  { mark: CLOSED_MARKS.dismissed, tone: null, isRunning: false, words: 'Dismissed by you' },
  {
    mark: FINDING_GROUPS.issue.mark,
    tone: FINDING_GROUPS.issue.tone,
    isRunning: false,
    words: 'Something is wrong: an issue or a failing check',
  },
  {
    mark: FINDING_GROUPS.opportunity.mark,
    tone: FINDING_GROUPS.opportunity.tone,
    isRunning: false,
    words: 'Opportunity: something that could be better',
  },
]

export const HELP_COPY = { open: 'Help', close: '✕ Close help', keys: 'Keys', marks: 'Marks' } as const

export type HelpKey = { keys: string; does: string }

/**
 * The keys a look's Help lists, for the tab Help opened over. `hasStatusButtons` says the Status has a row with a
 * button, which the terminal and omp select with j and k. Desktop takes no keys, so its Help lists marks only. Each
 * look binds these keys in its own adapter.
 */
export function helpKeys(look: Look, isNextBuild: boolean, tab: ShownTab, hasStatusButtons: boolean): HelpKey[] {
  const tabKeys = shownTabs(isNextBuild)
    .map(t => t.hotkey)
    .join(' ')
  const hasRows = isRowTab(tab)
  const selectsStatusRows = tab === 'overview' && hasStatusButtons
  const switchTabs = { keys: tabKeys, does: 'Switch tabs' }
  switch (look) {
    case 'desktop':
      return []
    case 'terminal':
      return [
        switchTabs,
        ...(hasRows || selectsStatusRows ? [{ keys: 'j k', does: 'Select the next or previous row' }] : []),
        { keys: 'ctrl+x tab', does: 'Move focus to the line above the prompt, then the pane, then the prompt' },
      ]
    case 'codex':
      return [
        switchTabs,
        ...(hasRows ? [{ keys: 'j k ↑ ↓', does: 'Select the next or previous row' }] : []),
        { keys: '?', does: 'Open or close help' },
        { keys: 'esc', does: 'Close help, or leave a reply field' },
      ]
    case 'omp':
      return [
        { keys: `tab ${tabKeys}`, does: 'Switch tabs' },
        ...(hasRows
          ? [
              { keys: '↑ ↓ j k', does: 'Move between rows' },
              { keys: '← →', does: 'Pick a button' },
              { keys: '↵', does: 'Press the picked button' },
              { keys: 'r', does: 'Reply to the selected row' },
              { keys: 'u', does: 'Undo the last close' },
            ]
          : [
              ...(selectsStatusRows
                ? [
                    { keys: 'j k', does: 'Select the next or previous row with a button' },
                    { keys: '↵', does: "Press the selected row's button" },
                  ]
                : []),
              { keys: '↑ ↓', does: 'Scroll the page' },
            ]),
        { keys: '?', does: 'Open or close help' },
        { keys: 'esc', does: 'Close help, then the panel' },
      ]
  }
}

export const CLOSED_SHOWN = 3
/** How long Undo can take back a close or a press. Once it passes, Done tells the agent. */
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

/**
 * A send still on its way. For its first QUEUED_AFTER_MS a queued send reads as sending, so a send that the agent takes
 * at once never reads Queued. Neither reads as delivered, so neither draws a ✓.
 */
function pendingDeliveryAt(last: LastAction | undefined, now: number): 'sending' | 'queued' | 'unconfirmed' | null {
  if (last?.delivery?.state === 'unconfirmed') return 'unconfirmed'
  if (last?.delivery?.state !== 'queued') return null
  return isQueuedAt(last, now) ? 'queued' : 'sending'
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

/** What a look holds in place besides the session: the rows replies hold, and the rows closed while it shows them. */
export type Holds = Pick<ViewInput, 'replies' | 'discarded' | 'shownSince'>

export const NO_HOLDS: Holds = { replies: {}, discarded: {}, shownSince: null }

/**
 * Whether the look has shown its tab since `at`. Every row that closed or was pressed since then can still be drawn in
 * place, as `isSettledInPlace` says, so a prune keeps its record.
 */
export function isShownSince(at: number, shownSince: number | null): boolean {
  return shownSince !== null && at >= shownSince
}

/**
 * Whether a settled row stays in place, with its result. It stays while the look shows the tab it settled on, until
 * the person sends a message they typed. While its Undo lasts, it stays through that message and folds when Undo ends.
 * Leaving the tab, by switching tab or closing the inbox, folds it at once.
 */
export function isSettledInPlace(
  state: Pick<SettledState, 'at' | 'canUndo'>,
  { shownSince, lastTypedMessageAt }: Pick<ViewInput, 'shownSince' | 'lastTypedMessageAt'>,
): boolean {
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at

  return isShownSince(state.at, shownSince) && (state.canUndo || !isTypedSince)
}

/**
 * Whether a look drawing from a view it read before switching tabs still draws `row`. The view it reads next leaves a
 * settled row out once the look shows its tab from after the row settled, so the row folds without being drawn first.
 */
export function isDrawnInPlace(row: Pick<RowView, 'state'>, shownSince: number | null): boolean {
  return row.state.is !== 'settled' || isShownSince(row.state.at, shownSince)
}

/** The discards a look keeps: a discard keeps its row folded for as long as the row could stay in place. */
export function keptDiscards(discarded: Record<string, number>, shownSince: number | null): Record<string, number> {
  return Object.fromEntries(Object.entries(discarded).filter(([, at]) => isShownSince(at, shownSince)))
}

/** The row whose field is open and each row whose draft holds words. Opening a field gives its row a draft. */
export function heldReplies(typing: string | null, drafts: Record<string, Draft>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(drafts).flatMap(([id, d]) => (id === typing || d.text.trim() !== '' ? [[id, d.since]] : [])),
  )
}

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

function isUndoLeft(at: number, now: number, settleWindowMs: number): boolean {
  return now - at < settleWindowMs
}

/** Whether Undo can still take back a close made at `at`. */
function canUndoClose(
  closed: Pick<Closed, 'how' | 'isSentToAgent'>,
  at: number,
  now: number,
  settleWindowMs: number,
): boolean {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs)
}

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

export type Feedback =
  | { is: 'done'; label: string; at: number; isHandedStep?: true; isStillWaiting?: true }
  | { is: 'working'; label: string; at: number }
  | { is: 'stillOpen'; at: number }
  | { is: 'noComparison'; at: number }
  | { is: 'sending'; label: string; at: number }
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

/** A press result's text on a row with no row view, as a PR row. A row whose mark says done shows a done result's bare label. */
export function markedFeedbackText(f: Feedback, isMarkDone: boolean, look: Look): string {
  return f.is === 'done' && isMarkDone ? f.label : feedbackText(f, look)
}

/** A handed-off row's ✓ leads its result line, so its result reads without its own ✓. */
export function rowFeedbackText(row: RowView, look: Look): string | null {
  const f = row.feedback
  if (!f) return null
  if (!isHandedOffDone(row)) return feedbackText(f, look)

  return f.is === 'done' ? f.label : feedbackText(f, look).replace(/^✓ /, '')
}

/** Whether a handed-off row's last press is done: its send arrived, or its open or copy worked. */
function isHandedOffDone(row: Pick<RowView, 'state' | 'feedback'>): boolean {
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

/** A banner's subject. A look draws a button on the banners that have one: Try again, Resume, Hide demo, Reload. */
export type BannerKind =
  | 'demo'
  | 'update-failed'
  | 'tools-refused'
  | 'read-failed'
  | 'stopped'
  | 'gh-missing'
  | 'gh-signed-out'
  | 'press-note'
  | 'press-failed'
  | 'hooks-trust'
  | 'server-gone'
  | 'server-load-failed'
  | 'server-builds-differ'
  | 'tab-update-failed'

/**
 * Error: the inbox cannot do its job, or the turn stopped, until something changes. Warning: part of the inbox is
 * missing or out of date, and it still works. Notice: a fact.
 */
const BANNER_TONES: Record<BannerKind, BannerTone> = {
  demo: 'notice',
  'update-failed': 'warning',
  'tools-refused': 'error',
  'read-failed': 'error',
  stopped: 'error',
  'gh-missing': 'warning',
  'gh-signed-out': 'warning',
  'press-note': 'notice',
  'press-failed': 'error',
  'hooks-trust': 'error',
  'server-gone': 'error',
  'server-load-failed': 'error',
  'server-builds-differ': 'warning',
  'tab-update-failed': 'warning',
}

/** A message about the inbox's own state, or the turn's stop. Each look draws it as a tinted box, the lead in bold. */
export type BannerView = { kind: BannerKind; tone: BannerTone; lead: string; body: string | null }

/** The banner for `text`. Its first sentence is the lead, and the rest is the body. */
export function bannerOf(kind: BannerKind, text: string): BannerView {
  const end = text.indexOf('. ')
  const lead = end < 0 ? text : text.slice(0, end + 1)
  const body = end < 0 ? null : text.slice(end + 2)

  return { kind, tone: BANNER_TONES[kind], lead, body }
}

/** The stop's banner. Its lead is "Stopped", and its body why, with the fix when Resume cannot continue past it. */
export function stopBanner(stop: Stop): BannerView {
  const why = `${capitalized(stopText(stop))}.`

  return {
    kind: 'stopped',
    tone: BANNER_TONES.stopped,
    lead: 'Stopped',
    body: isResumable(stop) ? why : `${why} ${stopFix(stop)}`,
  }
}

/**
 * The banners under the tab bar, in the order every look draws them: the host's own, then a failed update, then the
 * result of a press whose row the tab no longer shows.
 */
export function tabBarBanners(
  host: BannerView[],
  statusError: string | null,
  pressNote: { text: string; isError: boolean } | null,
): BannerView[] {
  return [
    ...host,
    ...(statusError ? [bannerOf('update-failed', statusError)] : []),
    ...(pressNote ? [bannerOf(pressNote.isError ? 'press-failed' : 'press-note', pressNote.text)] : []),
  ]
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
const HOLDS_UP_TEXT = 'Holds up'
const STATUS_FAILED = 'Last Status update failed. Changes from that reply may be missing.'
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
  if (pending === 'queued' || pending === 'unconfirmed') return { is: pending, label: last.text, at: last.at }
  if (delivery?.state === 'failed') return { is: 'notSent', reason: delivery.reason, retry: retryOf(id, last) }
  const isAwaiting = isAwaitingReply(last, turns)
  const isUnreported = last.action === 'compare' && !(reportedAt !== undefined && reportedAt >= last.at)
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS
  const working = WORKING_LABELS[last.action]
  if (last.kind === 'talk' && working && (isAwaiting || (isUnreported && !isPastLimit)))
    return { is: 'working', label: working, at: last.at }
  if (pending === 'sending') return { is: 'sending', label: last.text, at: last.at }
  if (isUnreported) return { is: 'noComparison', at: last.at }
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: 'stillOpen', at: last.at }

  const isHandedStep = last.kind === 'handoff' && last.action.startsWith('step-')

  return {
    is: 'done',
    label: DONE_LABELS[last.action]?.(last.text) ?? last.text,
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

/** Presses after which their row still waits on the person, as a failing check does after Fix. */
const STILL_WAITING_AFTER = new Set(['check-fix'])

export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'notSent' || (f?.is === 'local' && f.result.state === 'failed')
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

export function isPressOut(f: Feedback | null): boolean {
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
 * under its buttons instead, so a status that wraps adds a line below them and never moves them. A row that still
 * waits after its press, such as a failing check after Fix, keeps its done status there, beside the button that
 * presses again, as a PR block does.
 */
export function isStatusUnderActions(f: Feedback | null, isOpen: boolean): boolean {
  const isDoneStillWaiting = f?.is === 'done' && f.isStillWaiting === true

  return isOpen && (isPressOut(f) || isDoneStillWaiting)
}

/**
 * Whether a row in the terminal and desktop looks draws a press status after its title, unless
 * `isStatusUnderActions` places it under the buttons. A status with an age and a Local result that did not fail
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
    case 'sending':
      return f.label
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

/** A settled row's mark: the one its line in the Closed list draws, so a row keeps its mark when it folds. */
export function settledMark(state: Pick<SettledState, 'delivery' | 'closedAs'>): ResultMark {
  return closedMark(state.closedAs, state.delivery)
}

/** A closed row's mark, as `CLOSED_MARKS` gives it: running while what it sent is on its way, else blank until it arrives. */
export function closedMark(state: ClosedState, delivery: ClosedDelivery): ResultMark {
  if (isSendMoving(delivery)) return RUNNING_RESULT
  return { text: delivery === null ? CLOSED_MARKS[state] : '', isRunning: false }
}

/**
 * Whether a row tab draws a running mark, so the terminal and omp keep their frame timer going: a row whose answer is
 * on its way, or such a line in a Closed list the look shows unfolded.
 */
export function isRowTabRunning(v: InboxView, tab: ListedTab, isUnfolded: (kind: FoldKind) => boolean): boolean {
  const rows = tab === 'needsYou' ? [...v.needsYou.questions, ...v.needsYou.tasks] : v.findings.rows
  const settled = new Set(settledRowIds(rows))
  const closed =
    tab === 'needsYou'
      ? NEEDS_YOU_GROUPS.flatMap(g => (isUnfolded(g.kind) ? closedShown(v.needsYou.closed[g.list], settled) : []))
      : (Object.keys(FINDING_GROUPS) as Finding['kind'][]).flatMap(kind =>
          isUnfolded(kind)
            ? closedShown(
                v.findings.closed.filter(f => f.kind === kind),
                settled,
              )
            : [],
        )

  return (
    rows.some(r => rowResultMark(r)?.isRunning) || closed.some(d => closedMark(closedState(d), d.delivery).isRunning)
  )
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

function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

/** Any tab a look can show: a row tab or a page tab. */
export type ShownTab = Tab | PageTab

/** The band and the inbox model always read a tab's words. A look draws its symbol in their place where the words do not fit. */
type TabName = { id: ShownTab; label: string; symbol: string }

/** A tab a build draws, with the number key that shows it. */
type DrawnTab = TabName & { hotkey: string }

const TAB_NAMES: readonly TabName[] = [
  { id: 'overview', label: 'Status', symbol: '\u{1F9ED}' },
  { id: 'needsYou', label: 'Asks', symbol: '\u{1F64B}' },
  { id: 'findings', label: 'Finds', symbol: '\u{1F50D}' },
  { id: 'prs', label: 'PRs', symbol: '\u{1F500}' },
]

const numbered = (tabs: readonly TabName[]): readonly DrawnTab[] =>
  tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }))

const NEXT_BUILD_TABS = numbered(TAB_NAMES)
const RELEASE_TABS = numbered(TAB_NAMES.filter(t => t.id !== 'overview'))

/** The tabs a build draws, in order, each keyed by its place. Only a next build draws the Status. */
export function shownTabs(isNextBuild: boolean): readonly DrawnTab[] {
  return isNextBuild ? NEXT_BUILD_TABS : RELEASE_TABS
}

/** The `/inbox` command's description: what the build's tabs show. */
export function inboxCommandText(isNextBuild: boolean): string {
  return isNextBuild
    ? 'Show where this session stands and what waits on you'
    : "Show this session's questions, tasks, findings and PRs"
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
/** What a tab draws after its name: a row tab's count when it has one. Null draws nothing. */
export function tabBadge(id: ShownTab, counts: Readonly<Record<Tab, number>>): string | null {
  return isRowTab(id) && counts[id] > 0 ? String(counts[id]) : null
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

/** A mark's tone on the Status. Null draws it muted. */
export type StatusTone = 'needsYou' | 'done' | null

/** Where a row under a subject sits in its tree: `last` ends the line that ties the rows to the subject. */
export type StatusBranch = 'mid' | 'last'

/** The word after a row's name: "waiting" in the needs-you tone while it waits on the person, or "finished". */
export type StatusStall = { text: string; tone: 'needsYou' | 'done' }

/**
 * One line of the Status's list, in the order to draw it. Each look lays out the parts; none chooses them. A subject
 * or child draws its name with its stall word after it, past `STALL_GAP`, in the stall's tone. A subject draws where it
 * stands on the line under its name.
 */
export type StatusRow = StatusRowParts & {
  /** Whether a rule sets it apart from the row above. A subject and the rows under it are one item, and the look line is a rule already. */
  isRuledAbove: boolean
}

type StatusRowParts =
  | {
      kind: 'subject'
      id: string
      mark: string
      tone: StatusTone
      /** Whether its work runs now, so a look animates the mark: this session's turn runs, or a child of it does. */
      isRunning: boolean
      name: string
      /** Where it stands. Null for a finished row below the look line, which the person has seen. */
      text: string | null
      /** "waiting" while an open ask holds it up. */
      stall: StatusStall | null
      /** The names of the subjects merged into it, while the person has not seen them. */
      merged: string | null
      /** The plan a reversal replaced, while the person has not seen it. */
      was: string | null
      /** Whether rows of its children follow, so its tree line runs down from its mark. */
      hasChildren: boolean
      /** The oldest open ask that holds it up, which its View button opens. Null while no open ask holds it up. */
      ask: { id: string; kind: Item['kind'] } | null
    }
  | {
      kind: 'child'
      id: string
      mark: string
      tone: StatusTone
      /** Whether its work shows under way, as `isChildWorking` says. A look animates the mark while it is set. */
      isRunning: boolean
      name: string
      /** What its work does, as `childStall` says. */
      stall: StatusStall | null
      /** Its place under its subject. Null when it is linked to no subject the list shows, so it sits at the top of the list. */
      branch: StatusBranch | null
    }
  /** The children of a subject past `CHILD_ROWS`, as "+ 2 more running", or "+ 2 more" when one finished. It is always the last row under its subject. */
  | { kind: 'more'; id: string; text: string; branch: 'last' }
  /** Where the person last looked: rows above it changed since. */
  | { kind: 'look'; id: string; text: string }
  /** Rows folded into a count, as "✓ 3 done" or "○ 2 more queued". */
  | { kind: 'fold'; id: string; mark: string; tone: StatusTone; text: string }

/** What the Status page shows. Every look draws it as it is. */
export type StatusPage = {
  isEmpty: boolean
  /** What the session is focused on now. The description is null until the Status call writes one. */
  head: { title: string; description: string | null } | null
  rows: StatusRow[]
  /** The status line's error while the last Status call wrote nothing. */
  error: string | null
  empty: { title: string; hint: string }
}

export const LOOK_TEXT = 'Last seen'
/** What a subject's was line starts with, before the plan it replaces. */
export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3
/** Finished rows drawn above the look line; older ones fold into the count. */
const NEW_CLOSED_ROWS = 2
/** Open rows drawn before the oldest queued ones fold into a count. */
const OPEN_ROWS = 7

const CHILD_MARK: { mark: string; tone: StatusTone } = { mark: SUBJECT_MARKS.working.mark, tone: null }

/** The order of subjects on each side of the look line, from what needs the person to what is finished. */
const STATUS_PLACES = ['held', 'working', 'waits-on-other', 'queued', 'closed'] as const

type StatusPlace = (typeof STATUS_PLACES)[number]

export const RUNNING_FRAME_MS = 300

/** One pulse of a running mark, which the Codex tab and the desktop pane draw as a fade. */
export const RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS

/**
 * A subject's merged line, as "merged in: Sync retry", cut at a phrase to the one line `fits` allows. When its first
 * phrase does not fit, the line keeps that phrase whole and a look wraps it.
 */
export function mergedLine(merged: string, fits: (text: string) => boolean): string {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, names => fits(`${MERGED_PREFIX}${names}`))}`
}

/**
 * A row's name as it shows before its stall word, which stays on the line of its last word. Whole when `fits` says the
 * name and the stall word fit in `STATUS_TEXT_LINES` lines, else cut at a word with an ellipsis until they do. The
 * stall word is never cut. When no cut fits, the name keeps its first word.
 */
export function nameBeforeStall(name: string, fits: (shown: string) => boolean): string {
  const words = name.split(' ')
  const cuts = words.map((_, n) => (n === 0 ? name : `${words.slice(0, words.length - n).join(' ')}…`))

  return cuts.find(fits) ?? cuts.at(-1)!
}

export function hasRunningMark(page: StatusPage): boolean {
  return page.rows.some(r => (r.kind === 'subject' || r.kind === 'child') && r.isRunning)
}

/** A running row's mark at `now`. Every mark on a page takes its frame from the clock, so all of them move together. */
export function runningMark(now: number): string {
  return RUNNING_FRAMES[Math.floor(now / RUNNING_FRAME_MS) % RUNNING_FRAMES.length]!
}

/** Whether `row` starts an item after another, with no look line between them. */
function isItemAfterItem(row: StatusRowParts, prev: StatusRowParts | undefined): boolean {
  const isUnderSubject = row.kind === 'more' || (row.kind === 'child' && row.branch !== null)

  return prev !== undefined && prev.kind !== 'look' && row.kind !== 'look' && !isUnderSubject
}

/** Whether `c` is a delegate that finished after the person last looked, so the page still shows it. */
function isFinishedUnseen(c: Child, lastLookAt: number | null): boolean {
  return c.delegateState === 'finished' && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt)
}

/** Whether `c` runs and waits on no one: not a delegate at a question or an approval, and not one that finished. */
function isChildWorking(c: Child): boolean {
  return c.endedAt === null && c.delegateState !== 'blocked'
}

/**
 * A delegate's stall word, from what Herdr shows: "waiting" at a question or an approval, in the needs-you tone, and
 * "finished", in the done tone. Other work shows none, since its moving mark shows it runs.
 */
function childStall(c: Child): StatusStall | null {
  if (c.delegateState === 'finished') return { text: 'finished', tone: 'done' }
  if (c.delegateState === 'blocked') return { text: 'waiting', tone: 'needsYou' }

  return null
}

function childRow(c: Child, branch: StatusBranch | null): StatusRowParts {
  const marks =
    c.delegateState === 'finished' ? SUBJECT_MARKS.done : c.delegateState === 'blocked' ? HELD_MARK : CHILD_MARK

  return {
    kind: 'child',
    id: c.id,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch,
  }
}

export function statusPage(
  s: {
    ledger: Pick<Ledger, 'overview' | 'items'>
    presence: Session['presence']
    overviewFailure?: Session['overviewFailure']
  },
  now: number,
): StatusPage {
  const o = s.ledger.overview
  const look = o?.lastLookAt ?? null
  const subjects = (o?.subjects ?? []).filter(x => x.into === null)
  const isNew = (x: Subject) => look === null || x.changedAt > look
  const heldIds = new Set(s.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
  const isHeld = (x: Subject) => isOpen(x) && heldIds.has(x.id)
  const oldestAskOf = (x: Subject): { id: string; kind: Item['kind'] } | null => {
    if (!isHeld(x)) return null
    const oldest = s.ledger.items
      .filter(i => o?.askSubjects[i.id] === x.id)
      .sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

    return oldest ? { id: oldest.id, kind: oldest.kind } : null
  }
  const placeOf = (x: Subject): StatusPlace =>
    isHeld(x) ? 'held' : x.status === 'done' || x.status === 'dropped' ? 'closed' : x.status
  const pageOrder = (x: Subject, y: Subject) =>
    Number(isNew(y)) - Number(isNew(x)) ||
    STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) ||
    y.changedAt - x.changedAt
  const stallOf = (x: Subject): StatusStall | null => (isHeld(x) ? { text: 'waiting', tone: 'needsYou' } : null)
  const newClosed = subjects
    .filter(x => !isOpen(x) && isNew(x))
    .sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0))
    .slice(0, NEW_CLOSED_ROWS)
  const open = subjects.filter(isOpen)
  const queuedOver = Math.max(0, open.length - OPEN_ROWS)
  const hiddenQueued = new Set(
    open
      .filter(x => placeOf(x) === 'queued')
      .sort((x, y) => x.changedAt - y.changedAt)
      .slice(0, queuedOver)
      .map(x => x.id),
  )
  const shown = [...open.filter(x => !hiddenQueued.has(x.id)), ...newClosed].sort(pageOrder)
  const folded = subjects.filter(x => x.status === 'done' && !newClosed.includes(x))
  const running = (o?.children ?? [])
    .filter(c => isChildRunning(c, now) || isFinishedUnseen(c, look))
    .sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt))
  const shownIds = new Set(shown.map(x => x.id))
  const rows: StatusRowParts[] = running
    .filter(c => c.subjectId === null || !shownIds.has(c.subjectId))
    .map(c => childRow(c, null))
  const lookRow: StatusRowParts | null = look === null ? null : { kind: 'look', id: 'look', text: LOOK_TEXT }
  const firstSeen = shown.findIndex(x => !isNew(x))
  for (const [i, x] of shown.entries()) {
    const hasNewAbove = i > 0
    if (lookRow && i === firstSeen && hasNewAbove) rows.push(lookRow)
    const under = running.filter(c => c.subjectId === x.id)
    const shownUnder = under.slice(0, CHILD_ROWS)
    const isMore = under.length > CHILD_ROWS
    rows.push({
      kind: 'subject',
      id: x.id,
      ...(isHeld(x) ? HELD_MARK : SUBJECT_MARKS[x.status]),
      isRunning: x.status === 'working' && !isHeld(x) && (s.presence.isTurnRunning || under.some(isChildWorking)),
      name: x.name,
      text: isNew(x) || isOpen(x) ? x.text || null : null,
      stall: stallOf(x),
      merged: isNew(x) ? x.merged : null,
      was: isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: oldestAskOf(x),
    })
    rows.push(...shownUnder.map((c, n) => childRow(c, n === shownUnder.length - 1 && !isMore ? 'last' : 'mid')))
    const hidden = under.slice(CHILD_ROWS)
    const isEveryHiddenRunning = hidden.every(c => c.delegateState !== 'finished')
    if (isMore)
      rows.push({
        kind: 'more',
        id: `${x.id}-more`,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? ' running' : ''}`,
        branch: 'last',
      })
  }
  const isEveryShownNew = firstSeen === -1
  if (lookRow && isEveryShownNew && shown.length > 0) rows.push(lookRow)
  if (hiddenQueued.size > 0)
    rows.push({
      kind: 'fold',
      id: 'queued',
      mark: SUBJECT_MARKS.queued.mark,
      tone: null,
      text: `${hiddenQueued.size} more queued`,
    })
  if (folded.length > 0) {
    const isMore = newClosed.some(x => x.status === 'done')
    rows.push({
      kind: 'fold',
      id: 'done',
      mark: SUBJECT_MARKS.done.mark,
      tone: 'done',
      text: `${folded.length}${isMore ? ' more' : ''} done`,
    })
  }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0,
    head,
    rows: rows.map((r, n) => ({ ...r, isRuledAbove: isItemAfterItem(r, rows[n - 1]) })),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: 'Status',
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts.",
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
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
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

export type DrawnEntry<R> = { row: R } | { settled: RowView; state: SettledState }

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

/** A press on an Status row. `show-ask` opens Asks with that ask selected, and sends nothing. */
export type StatusPress = { action: 'show-ask'; askId: string }

export type StatusKey = { press: StatusPress; label: string; hotkey: string; kind: PressKind }

/** The View button's label, by the kind of ask it opens. */
export const VIEW_ASK_LABELS: Record<Item['kind'], string> = { question: 'View question', task: 'View task' }

/** An Status row's buttons, in the order every look draws them. A row with none takes no press. */
export function statusKeyPlan(row: StatusRow): StatusKey[] {
  if (row.kind !== 'subject' || row.ask === null) return []

  return [
    {
      press: { action: 'show-ask', askId: row.ask.id },
      label: VIEW_ASK_LABELS[row.ask.kind],
      hotkey: 'v',
      kind: 'view',
    },
  ]
}

/** The Status rows that have buttons, in page order: the rows j and k move between. */
export function statusKeyRows(page: StatusPage): StatusRow[] {
  return page.rows.filter(r => statusKeyPlan(r).length > 0)
}

/** The Status row whose keys work: the selected row while it still has buttons, else the first row that has. */
export function statusSelected(page: StatusPage, selectedId: string | null): StatusRow | null {
  const rows = statusKeyRows(page)

  return rows.find(r => r.id === selectedId) ?? rows[0] ?? null
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

/** The open subject the Status call linked an ask to, by the ask's id. */
function heldSubjectOf(o: SessionStatus | null, askId: string): Subject | null {
  const subjectId = o?.askSubjects[askId]

  return o?.subjects.find(s => s.id === subjectId && isOpen(s)) ?? null
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
