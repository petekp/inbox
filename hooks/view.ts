import type {
  Closed,
  ClosedFinding,
  Draft,
  Finding,
  Item,
  LastAction,
  Ledger,
  LocalResult,
  Milestone,
  PressKind,
  RowNote,
  ShownTab,
  Tab,
  Turns,
} from '../types'
import { isLapsed, reopenFinding, reopenItem } from './ledger'
import { ago } from './text'
import { questionNumbers } from './model-text'
import type { ClosedState } from './ledger'
import {
  actionId,
  baseName,
  stepIconKind,
  capitalized,
  clipLabel,
  isAwaitingReply,
  isFixSent,
  ISSUE_LABEL,
  isFoldingPress,
  isHandedOff,
  isPrRowId,
  isUndoable,
  noteText,
  retryOf,
  stepsOf,
} from './presses'
import type { HelpStep, RowPress } from './presses'

const OPTIONS_FOLD_AT = 5
// The digits switch tabs, and the letters left out are the
// keys of a Needs you row's other actions and of moving the selection.
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

export const CLOSED_MARKS: Record<ClosedState, string> = { handled: '✓', dismissed: '✕', lapsed: '–' }

export const CLOSED_SHOWN = 3
export const SETTLED_MS = 5120
export const PRESS_GUARD_MS = 400
export const QUEUED_AFTER_MS = 1000

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
  | { is: 'queued'; label: string; at: number }
  | { is: 'unconfirmed'; label: string; at: number }
  | { is: 'notSent'; reason: string; retry: RowPress | null }
  | { is: 'local'; result: LocalResult }
  | { is: 'note'; note: RowNote['note']; at: number }
  | { is: 'closed'; label: string; at: number }

export type Look = 'terminal' | 'desktop' | 'codex'
export type ModLook = Exclude<Look, 'codex'>

export type ActionEmphasis = 'primary' | 'normal' | 'quiet'
export type ActionIcon = 'done' | 'retry' | 'open' | 'copy' | 'run'

export const ROW_COPY = {
  retry: 'Try again',
  send: 'Send',
  cancel: 'Cancel',
  discard: 'Discard',
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
}

export function rowMark(row: RowView, look: Look): { text: string; tone?: 'done' | 'issue' } {
  if (row.state.is === 'handedOff' && row.feedback?.is !== 'unconfirmed') return { text: '✓', tone: 'done' }
  if (row.finding) {
    const group = FINDING_GROUPS[row.finding.kind]
    return { text: group.mark, tone: group.tone }
  }
  return { text: look === 'terminal' ? row.handle : '' }
}

export function replyHint(row: RowView, agent: string): string {
  return row.replyKind === 'answer' ? 'Your answer' : `Your reply to ${agent}`
}

export function actionLabel(action: Pick<ActionView, 'label' | 'isPrimary'>): string {
  return action.isPrimary ? `${action.label} (recommended)` : action.label
}

export function fieldExit(row: RowView): 'cancel' | 'discard' {
  return row.state.is === 'held' ? 'discard' : 'cancel'
}

export function isWaitingRow(row: RowView): boolean {
  return row.state.is === 'open'
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

export type ClosedView<T> = T & { delivery: ClosedDelivery }

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

export const DEMO_NOTICE = 'Sample entries. Presses send nothing.'

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing.'
const UPDATE_RETRIES = ' It retries after your next message.'

function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const newestReplyFirst = (kind: Item['kind']) =>
    ledger.items.filter(i => i.kind === kind).sort((a, b) => b.turn - a.turn)

  return { questions: newestReplyFirst('question'), tasks: newestReplyFirst('task') }
}

export function feedbackOf(
  id: string,
  last: LastAction | undefined,
  note: RowNote | undefined,
  turns: Turns,
  now: number,
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
  const working = WORKING_LABELS[last.action]
  if (last.kind === 'talk' && working && isAwaiting) return { is: 'working', label: working, at: last.at }
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last)) return { is: 'stillOpen', at: last.at }

  const isHandedStep = last.kind === 'handoff' && last.action.startsWith('step-')

  return {
    is: 'done',
    label: DONE_LABELS[last.action]?.(last.text) ?? last.text,
    at: last.at,
    ...(isHandedStep ? { isHandedStep: true as const } : {}),
  }
}

const fixLabel = (f: Pick<Finding, 'kind'>) => (f.kind === 'opportunity' ? 'Do it' : 'Fix')

const WORKING_LABELS: Record<string, string> = {
  explain: 'Explaining…',
  discuss: 'Discussing…',
  'thread-discuss': 'Discussing…',
  'thread-draft': 'Drafting a reply…',
}

const DONE_LABELS: Record<string, (text: string) => string> = {
  address: () => 'Handed off',
  issue: () => 'Asked to file',
  discuss: () => 'Discussed',
  explain: () => 'Explained',
  dismiss: () => 'Dismissed',
  type: () => 'Replied',
  'thread-address': () => 'Addressed',
  'thread-discuss': () => 'Discussed',
  'thread-draft': () => 'Drafted a reply',
  'pr-conflicts': () => 'Asked to resolve conflicts',
  'pr-merge': () => 'Asked to merge',
  'pr-address-all': text => text.replace(/^Address\b/, 'Addressed'),
}

export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'notSent' || (f?.is === 'local' && f.result.state === 'failed')
}

export function hasAge(
  f: Feedback,
): f is Extract<Feedback, { is: 'done' | 'working' | 'stillOpen' | 'queued' | 'unconfirmed' | 'closed' }> {
  return (
    f.is === 'done' ||
    f.is === 'working' ||
    f.is === 'stillOpen' ||
    f.is === 'queued' ||
    f.is === 'unconfirmed' ||
    f.is === 'closed'
  )
}

const runIt = (look: Look) =>
  look === 'terminal' ? 'Run it in a terminal, or type ! and paste.' : 'Run it in Terminal.'
const VERBS = {
  open: { pending: 'Opening', done: 'Opened', failed: 'open' },
  copy: { pending: 'Copying', done: 'Copied', failed: 'copy' },
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
      return noteText(f.note)
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
    case 'closed':
      return f.label
  }
}

function deliveryLabel(state: 'queued' | 'unconfirmed', label: string): string {
  return state === 'queued' ? `Queued: ${label}` : `Delivery unconfirmed: ${label}`
}

export function settledLabel(label: string, delivery: ClosedDelivery): string {
  if (delivery && typeof delivery === 'object') return `${label} · Not sent: ${delivery.error}`
  return delivery === null ? label : deliveryLabel(delivery, label)
}

function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

export const TABS: readonly { id: ShownTab; label: string; hotkey: string }[] = [
  { id: 'needsYou', label: 'Needs you', hotkey: '1' },
  { id: 'findings', label: 'Findings', hotkey: '2' },
  { id: 'prs', label: 'PRs', hotkey: '3' },
  { id: 'map', label: 'Map', hotkey: '4' },
]

export const LIST_TABS: readonly Tab[] = TABS.map(t => t.id).filter(isListTab)

/** Whether a shown tab lists rows. The Map tab shows a page, so it has no rows, count or cursor. */
export function isListTab(tab: ShownTab): tab is Tab {
  return tab !== 'map'
}

export const ROW_TABS = TABS.filter(
  (t): t is (typeof TABS)[number] & { id: 'needsYou' | 'findings' } => t.id === 'needsYou' || t.id === 'findings',
)

export type MapTone = 'done' | 'needsYou' | 'findings'
export type MapRow = { id: string; tone: MapTone; text: string; detail: string | null; age: string }
export type MapSection = { title: string; count: number; rows: MapRow[] }
export type MapRunning = { id: string; text: string }

/** What the Map tab shows. Adapters draw it as it is. */
export type MapView = {
  isEmpty: boolean
  /** The session's goal; null until the person has asked for something. */
  goal: string | null
  now: string | null
  running: { title: string; count: number; rows: MapRunning[] } | null
  milestones: MapSection | null
  /** The milestones past `MAP_SHOWN`, as "12 earlier"; null when all show. */
  earlier: string | null
  empty: { title: string; hint: string }
}

export const MAP_SHOWN = 30
const MAP_TONES: Record<Milestone['source'], MapTone> = {
  done: 'done',
  answered: 'needsYou',
  fixed: 'findings',
}

/** Timed milestones newest first, then the ones with no time, newest stored first. */
function newestFirst(milestones: Milestone[]): Milestone[] {
  const timed = milestones.filter(m => m.at !== null).sort((a, b) => b.at! - a.at!)

  return [...timed, ...milestones.filter(m => m.at === null).reverse()]
}

export function mapView(ledger: Pick<Ledger, 'card' | 'milestones'>, now: number, agent: string): MapView {
  const card = ledger.card
  const all = newestFirst(ledger.milestones)
  const shown = all.slice(0, MAP_SHOWN)

  return {
    isEmpty: !card?.goal && all.length === 0,
    goal: card?.goal || null,
    now: card?.goal && card.now ? card.now : null,
    running:
      card?.goal && card.running.length > 0
        ? {
            title: 'Running',
            count: card.running.length,
            rows: card.running.map((text, n) => ({ id: `running-${n}`, text })),
          }
        : null,
    milestones:
      shown.length > 0
        ? {
            title: 'Milestones',
            count: all.length,
            rows: shown.map(m => ({
              id: m.id,
              tone: MAP_TONES[m.source],
              text: m.text,
              detail: m.detail,
              age: m.at === null ? '' : shortAgo(Math.max(0, now - m.at)),
            })),
          }
        : null,
    earlier: earlierLabel(all.length, shown.length),
    empty: {
      title: 'No map yet',
      hint: `When you give ${agent} a task, its goal and what it finishes show up here.`,
    },
  }
}

export function emptyText(tab: 'needsYou' | 'findings', agent: string): { title: string; hint: string } {
  return tab === 'needsYou'
    ? { title: 'Nothing needs you.', hint: `${agent}'s questions and the tasks only you can do show up here.` }
    : { title: 'No findings yet', hint: `${agent} flags issues and opportunities it spots beyond your task.` }
}

const FOLLOW_UPS: ReadonlySet<RowPress['action']> = new Set(['type', 'explain', 'discuss', 'dismiss', 'discard'])
const ACTION_KEYS: Partial<Record<RowPress['action'], string>> = {
  done: 'd',
  address: 'a',
  issue: 'i',
  type: 't',
  explain: 'e',
  discuss: 'd',
  dismiss: 'x',
  discard: 'x',
}

function actionsOf(
  row: { id: string; item: Item | null; finding: Finding | null; steps: HelpStep[] },
  last: LastAction | undefined,
  state: RowState,
): ActionView[] {
  const { id, item, steps } = row
  const action = (
    press: RowPress,
    label: string,
    kind: PressKind,
    flags: Partial<Pick<ActionView, 'isPrimary' | 'isFolded'>> = {},
  ): ActionView => ({
    press,
    label:
      press.action !== 'type' &&
      last?.kind !== 'local' &&
      last?.delivery?.state !== 'failed' &&
      last?.action === actionId(press)
        ? `${label} again`
        : label,
    kind,
    emphasis:
      flags.isPrimary || press.action === 'done' || press.action === 'address'
        ? 'primary'
        : press.action === 'discuss' ||
            press.action === 'explain' ||
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
  })
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
      action({ action: 'answer', id, option }, clipLabel(option, 32), 'mark', {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
      }),
    ),
    ...stepActions,
    action({ action: 'type', id, text: '' }, 'Reply', 'mark'),
    action({ action: 'explain', id }, 'Explain', 'talk'),
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
        label: capitalized(closed.outcome),
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
  const feedbackIn = (id: string, state: RowState): Feedback | null => {
    if (state.is === 'settled') return null
    const f = feedbackOf(id, lastActions[id], notes[id], turns, now)
    if (state.is !== 'held') return f
    const isFailedReply = f?.is === 'notSent' && lastActions[id]?.action === 'type' && lastActions[id].at >= state.at

    return f?.is === 'note' || isFailedReply ? f : { is: 'closed', label: state.label, at: state.at }
  }
  const rowOf = (row: Omit<RowView, 'state' | 'feedback' | 'actions'>): RowView => {
    const state = stateOf(row.id)

    return {
      ...row,
      state,
      feedback: feedbackIn(row.id, state),
      actions: actionsOf(row, lastActions[row.id], state),
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
    .map(f => ({
      ...f,
      how: 'answered',
      outcome: fixLabel(f),
      closedAt: lastActions[f.id]!.at,
      delivery: pendingDeliveryAt(lastActions[f.id], now),
    }))

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
        ...ledger.closedFindings.filter(f => !held.has(f.id)).map(f => ({ ...f, delivery: null as null })),
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

export function perTurnStatus(update: { isUpdating: boolean; isFailed: boolean; retries: boolean }): ItemStatus {
  return {
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : '') : null,
  }
}
