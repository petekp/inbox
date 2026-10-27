import type { Closed, Draft, FoldKind, Stop, Tab } from '../../types'
import { version } from '../package.json'
import {
  ARRIVAL_TABS,
  closedGroups,
  followTo,
  isPrsTabEmpty,
  isTabEmpty,
  listedRowIds,
  openRowIds,
  prRowIds,
  recordRows,
} from '../../hooks/arrivals'
import type { RowRecord } from '../../hooks/arrivals'
import { closedState } from '../../hooks/ledger'
import {
  GH_MISSING_TEXT,
  prsEmptyText,
  prRefreshFailedText,
  PR_DISMISSED_LABEL,
  PR_GROUP_TITLES,
  PR_TONES,
  checkActions,
  checkRowText,
  prBlockActions,
  prCheckId,
  prMarkId,
  prRowWaits,
  prThreadId,
  threadActions,
  threadRowText,
  threadSentIn,
} from '../../hooks/pr-tab'
import type { PrAction, PrPress, PrRowMark } from '../../hooks/pr-tab'
import { failingChecks, readiness, waitingThreads } from '../../hooks/prs'
import { capitalized, noteText } from '../../hooks/presses'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session'
import type { ToneName } from '../../hooks/tones'
import { ago, cellWidth, cutToCells } from '../../hooks/text'
import {
  canUndoRefused,
  closedMark,
  settledMark,
  settledTone,
  DEMO_NOTICE,
  FINDING_GROUPS,
  NEEDS_YOU_GROUPS,
  QUEUED_AFTER_MS,
  ROW_COPY,
  LISTED_TABS,
  SETTLED_MS,
  shownTabs,
  tabBadge,
  actionLabel,
  actionLines,
  fitTabs,
  tabName,
  closedShown,
  closedTotal,
  earlierLabel,
  emptyText,
  feedbackOf,
  markedFeedbackText,
  firstWaiting,
  foldLabel,
  footerStatus,
  groupEmptyText,
  heldReplies,
  isFailure,
  isRowTab,
  isResumable,
  isStatusUnderActions,
  isWaitingRow,
  waitingCount,
  keptOpen,
  replyHint,
  rowAfterClose,
  rowFeedbackText,
  rowKeyPlan,
  rowMark,
  hasRunningMark,
  LOOK_RULE_LABEL,
  WAS_PREFIX,
  runningMark,
  settledLabel,
  stopFix,
  stopText,
  versionLabel,
} from '../../hooks/view'
import type {
  ClosedDelivery,
  Feedback,
  OverviewBranch,
  OverviewPage,
  OverviewRow,
  ReplyHolds,
  RowView,
  ShownTab,
  TabNaming,
} from '../../hooks/view'

export type ResumePress = { action: 'resume' }
export type PanelPress = RowPress | PrPress | ResumePress

/** What the panel draws: the session's view and the host facts the shared view does not hold. */
export type PanelScreen = {
  view: SessionView
  /** The model that runs the inbox update, or null when the person has none. */
  modelName: string | null
  isGhMissing: boolean
  isFetchingPrs: boolean
  /** Why the last turn stopped, until the next turn starts. */
  stop: Stop | null
  isNextBuild?: boolean
  isDemo?: boolean
}

export type Tone = ToneName | 'accent' | 'sep'

/** The terminal styles the panel draws with. The host maps them onto the active omp theme. */
export type Style = {
  bold(s: string): string
  dim(s: string): string
  inverse(s: string): string
  underline(s: string): string
  tone(name: Tone, s: string): string
}

export type PanelUi = {
  tab: ShownTab
  selectedId: string | null
  /** The focused button of one row. Another row's focus starts at its recommended option. */
  focus: { rowId: string; index: number } | null
  /** The row whose reply field is open. */
  typing: string | null
  /** Replies begun and not sent, by row id. Cancelling the field keeps its draft, and so does a send that is not confirmed. */
  drafts: Record<string, Draft>
  /** Rows whose draft the person discarded, and when. */
  discarded: Record<string, number>
  /** A line about the last press that the row itself cannot show, until `at` + SETTLED_MS. */
  notice: { text: string; at: number } | null
  /** The groups whose closed rows show. Each starts folded. */
  unfolded: FoldKind[]
  /** A Resume press for the stop that began at `stopAt`. */
  resuming: { stopAt: number; is: 'sending' } | { stopAt: number; is: 'refused'; why: string } | null
  /** A handed-off row the person opened again with Enter. Moving the selection off it folds it again. */
  opened: string | null
  /** How many lines of the Overview page are scrolled above the panel. Drawing clamps it to the page's end. */
  pageTop: number
}

export const INITIAL_UI: PanelUi = {
  tab: 'needsYou',
  selectedId: null,
  focus: null,
  typing: null,
  drafts: {},
  discarded: {},
  notice: null,
  unfolded: [],
  resuming: null,
  opened: null,
  pageTop: 0,
}

export function holdsOf(ui: Pick<PanelUi, 'typing' | 'drafts' | 'discarded'>): ReplyHolds {
  return { replies: heldReplies(ui.typing, ui.drafts), discarded: ui.discarded }
}

const AGENT = 'omp'
const REPLY_KEY = 'r'
const INDENT = 7
const STOP_ID = 'stop'

type Button = {
  label: string
  key: string | null
  press: PanelPress
  isRecommended: boolean
  isFollowUp: boolean
  /** Its press is out, so it draws dim and its key does nothing. */
  isOut?: boolean
}

type Lead = { text: string; tone: Tone | null }

type Line = {
  id: string
  /** Extra indent, for the rows under a PR. */
  depth: number
  lead: Lead
  title: string
  isDim: boolean
  /** The status words after a PR's title. */
  status: { text: string; tone: Tone | null; rest: string } | null
  age: number | null
  detail: string | null
  file: string | null
  feedback: { text: string; tone: Tone | null; source: Feedback | null } | null
  /** Set once the row has closed and its label shows until it leaves. */
  settled: { label: string; tone: 'done' | 'muted'; undo: PanelPress | null } | null
  buttons: Button[]
  row: RowView | null
  /** The group a Closed line folds. Enter unfolds or folds it. */
  fold: FoldKind | null
  /** A line the selection skips: a closed row with nothing to press, or a stop with no Resume. */
  isStatic: boolean
  /** Whether the line waits on the person, so a default selection may land on it. */
  isWaiting: boolean
  /** Shows the detail when the line is not selected. */
  isDetailShown: boolean
  /** A handed-off row, drawn as its one line until the person opens it. */
  isFolded: boolean
}

type Entry =
  | { kind: 'heading'; text: string; count?: number }
  /** A note stops at 3 lines. One with `isWhole`, such as an empty page's hint, is the page's content and wraps in full. */
  | { kind: 'note'; text: string; isStrong?: boolean; indent?: number; isWhole?: boolean }
  | { kind: 'row'; line: Line }
  | { kind: 'page'; row: OverviewRow }

const blankLine = (id: string): Line => ({
  id,
  depth: 0,
  lead: { text: '', tone: null },
  title: '',
  isDim: false,
  status: null,
  age: null,
  detail: null,
  file: null,
  feedback: null,
  settled: null,
  buttons: [],
  row: null,
  fold: null,
  isStatic: false,
  isWaiting: true,
  isDetailShown: false,
  isFolded: false,
})

const wrapIndex = (i: number, n: number) => ((i % n) + n) % n

function feedbackTone(f: Feedback): Tone | null {
  if (isFailure(f)) return 'error'
  if (f.is === 'done' || (f.is === 'local' && f.result.state === 'done') || f.is === 'closed') return 'done'

  return null
}

function rowButtons(row: RowView): Button[] {
  const { keys, more } = rowKeyPlan(row, true)
  const recommended = row.item?.rec

  return [...keys, ...more].flatMap((k): Button[] => {
    if (k.slot === 'allOptions') return []
    if (k.slot === 'retry')
      return [{ label: k.label, key: null, press: k.press, isRecommended: false, isFollowUp: false }]
    const { press } = k.action
    const key = press.action === 'type' ? REPLY_KEY : (k.hotkey ?? null)

    return [
      {
        label: k.action.label,
        key,
        press,
        isRecommended: k.slot === 'choice' && press.action === 'answer' && press.option === recommended,
        isFollowUp: k.slot === 'action' && k.action.isFollowUp,
        isOut: k.action.isOut,
      },
    ]
  })
}

function prButtons(actions: PrAction[]): Button[] {
  return actions.map(a => ({
    label: a.label,
    key: a.hotkey ?? null,
    press: a.press,
    isRecommended: false,
    isFollowUp: a.isFollowUp === true,
    isOut: a.isOut,
  }))
}

function leadOf(row: RowView): Lead {
  const mark = rowMark(row, AGENT)
  if (mark.tone === 'done') return { text: mark.text, tone: 'done' }
  if (mark.tone === 'issue') return { text: mark.text, tone: 'issue' }

  return { text: mark.text, tone: mark.text === '•' ? 'sep' : null }
}

function lineOfRow(row: RowView): Line {
  const feedbackLabel = rowFeedbackText(row, AGENT)
  const f = row.feedback
  const state = row.state
  const undo = row.actions.find(a => a.press.action === 'undo')

  const settledLead: Lead | null =
    state.is === 'settled' ? { text: settledMark(state.delivery) || ' ', tone: 'sep' } : null

  return {
    ...blankLine(row.id),
    lead: settledLead ?? leadOf(row),
    title: row.title,
    isDim: state.is === 'settled',
    // As in the terminal, a row a press finished reads the press's age.
    age: f?.is === 'done' ? f.at : row.at,
    detail: row.detail,
    file: row.fileName,
    feedback: feedbackLabel && f ? { text: feedbackLabel, tone: feedbackTone(f), source: f } : null,
    settled:
      state.is === 'settled'
        ? {
            label: settledLabel(state.label, state.delivery),
            tone: settledTone(state),
            undo: state.canUndo && undo ? undo.press : null,
          }
        : null,
    buttons: state.is === 'settled' ? [] : rowButtons(row),
    row,
    isWaiting: isWaitingRow(row),
    isFolded: state.is === 'handedOff',
  }
}

type ClosedLine = {
  id: string
  title: string
  at: number
  how: Closed['how']
  outcome: string
  outcomeLabel: string
  delivery: ClosedDelivery
}

type Group = { kind: FoldKind; title: string; rows: RowView[]; closed: ClosedLine[] }

const settledIn = (g: Group) => new Set(g.rows.filter(r => r.state.is === 'settled').map(r => r.id))
const isGroupEmpty = (g: Group) => g.rows.length === 0 && closedTotal(g.closed, settledIn(g)) === 0

const closedId = (id: string) => `closed ${id}`
const foldId = (kind: FoldKind) => `fold ${kind}`

function closedLines(d: ClosedLine): Line {
  const canUndo = canUndoRefused(d.delivery)
  const undo: Button = {
    label: 'Undo',
    key: null,
    press: { id: d.id, action: 'undo' },
    isRecommended: false,
    isFollowUp: false,
  }

  return {
    ...blankLine(closedId(d.id)),
    depth: 1,
    lead: { text: closedMark(closedState(d), d.delivery), tone: null },
    title: d.title,
    isDim: true,
    age: d.at,
    feedback: { text: settledLabel(d.outcomeLabel, d.delivery), tone: null, source: null },
    buttons: canUndo ? [undo] : [],
    isStatic: !canUndo,
    isWaiting: false,
  }
}

function groupEntries(g: Group, unfolded: readonly FoldKind[]): Entry[] {
  const settled = settledIn(g)
  const total = closedTotal(g.closed, settled)
  const out: Entry[] = [{ kind: 'heading', text: g.title, count: waitingCount(g.rows) }]
  out.push(...g.rows.map((row): Entry => ({ kind: 'row', line: lineOfRow(row) })))
  if (g.rows.length === 0) out.push({ kind: 'note', text: groupEmptyText(g.title), indent: 3 })
  if (total === 0) return out
  const isUnfolded = unfolded.includes(g.kind)
  out.push({
    kind: 'row',
    line: {
      ...blankLine(foldId(g.kind)),
      lead: { text: isUnfolded ? '▾' : '▸', tone: 'sep' },
      title: foldLabel(total),
      isDim: true,
      fold: g.kind,
      isWaiting: false,
    },
  })
  if (!isUnfolded) return out
  const shown = closedShown(g.closed, settled)
  out.push(...shown.map((d): Entry => ({ kind: 'row', line: closedLines(d) })))
  const earlier = earlierLabel(total, shown.length)
  if (earlier) out.push({ kind: 'note', text: earlier, indent: 7 })

  return out
}

function stopEntries(screen: PanelScreen, ui: PanelUi): Entry[] {
  const { stop } = screen
  if (!stop) return []
  const canResume = isResumable(stop)
  const resuming = ui.resuming?.stopAt === stop.at ? ui.resuming : null
  const resume: Button = {
    label: resuming?.is === 'sending' ? 'Resuming…' : 'Resume',
    key: null,
    press: { action: 'resume' },
    isRecommended: true,
    isFollowUp: false,
  }

  return [
    {
      kind: 'row',
      line: {
        ...blankLine(STOP_ID),
        lead: { text: '!', tone: 'error' },
        title: 'Stopped',
        status: { text: `${capitalized(stopText(stop))}.`, tone: 'error', rest: '' },
        age: stop.at,
        detail: canResume ? null : stopFix(stop),
        feedback:
          resuming?.is === 'refused' ? { text: `Not sent: ${resuming.why}`, tone: 'error', source: null } : null,
        buttons: canResume ? [resume] : [],
        isStatic: !canResume,
        isWaiting: canResume,
        isDetailShown: true,
      },
    },
  ]
}

function rowEntries(screen: PanelScreen, ui: PanelUi, tab: 'needsYou' | 'findings'): Entry[] {
  const { view } = screen
  const groups: Group[] =
    tab === 'needsYou'
      ? NEEDS_YOU_GROUPS.map(g => ({
          kind: g.kind,
          title: g.title,
          rows: view.needsYou[g.list],
          closed: view.needsYou.closed[g.list].map(d => ({ ...d, title: d.ask })),
        }))
      : (Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map(kind => ({
          kind,
          title: FINDING_GROUPS[kind].title,
          rows: view.findings.rows.filter(r => r.finding?.kind === kind),
          closed: view.findings.closed.filter(f => f.kind === kind).map(f => ({ ...f, at: f.closedAt })),
        }))
  const stops = tab === 'needsYou' ? stopEntries(screen, ui) : []
  if (groups.every(isGroupEmpty)) {
    const empty = emptyText(tab, AGENT)

    return stops.length > 0
      ? stops
      : [
          { kind: 'note', text: empty.title, isStrong: true },
          { kind: 'note', text: empty.hint, isWhole: true },
        ]
  }

  return [...stops, ...groups.flatMap(g => groupEntries(g, ui.unfolded))]
}

function prEntries(screen: PanelScreen, now: number): Entry[] {
  const { prs, lastActions, turns } = screen.view
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now }
  const waits = prRowWaits(
    prs.drawn.filter(d => !d.isSettled).map(d => d.pr),
    lastActions,
  )
  const isWaiting = (id: string) => waits.some(w => w.id === id && w.isWaiting)
  const markLead = (mark: PrRowMark): Lead => ({ text: mark.text, tone: mark.tone ?? 'sep' })
  const out: Entry[] = []
  if (prs.drawn.length === 0) {
    const empty = prsEmptyText({ isFetching: screen.isFetchingPrs, isGhMissing: screen.isGhMissing }, 'session')
    return [
      { kind: 'note', text: empty.title, isStrong: true },
      { kind: 'note', text: empty.hint, isWhole: true },
    ]
  }
  if (screen.isGhMissing) out.push({ kind: 'note', text: GH_MISSING_TEXT })
  for (const { pr, isSettled } of prs.drawn) {
    const markId = prMarkId(pr.ref)
    const lead: Lead = { text: `#${pr.number}`, tone: 'prs' }
    if (isSettled) {
      out.push({
        kind: 'row',
        line: {
          ...blankLine(markId),
          lead,
          title: pr.title,
          isDim: true,
          settled: { label: PR_DISMISSED_LABEL, tone: 'done', undo: { action: 'pr-undo', ref: pr.ref } },
        },
      })
      continue
    }
    const { status, head, unlisted } = readiness(pr, isSent)
    const last = lastActions[markId]
    const f = last?.action === 'pr-dismiss' ? null : pressFeedback(screen, markId, now)
    out.push({
      kind: 'row',
      line: {
        ...blankLine(markId),
        lead,
        title: pr.title,
        status: { text: head, tone: PR_TONES[status], rest: unlisted.map(r => ` · ${r}`).join('') },
        age: doneAt(f),
        feedback: f,
        detail: pr.error ? prRefreshFailedText(pr.error) : null,
        buttons: prButtons(prBlockActions(pr, isSent, prs.branchRef, presses)),
        isWaiting: false,
      },
    })
    const threads = waitingThreads(pr)
    if (threads.length > 0) out.push({ kind: 'heading', text: PR_GROUP_TITLES.threads, count: threads.length })
    for (const t of threads) {
      const id = prThreadId(pr, t)
      const text = threadRowText(pr, t, lastActions)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      out.push({
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.title,
          isDim: text.fold !== null,
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · ') || null,
          age: doneAt(feedback),
          feedback,
          buttons: prButtons(threadActions(pr, t, presses)),
          isWaiting: isWaiting(id),
          isFolded: text.fold !== null,
        },
      })
    }
    const checks = failingChecks(pr)
    if (checks.length > 0) out.push({ kind: 'heading', text: PR_GROUP_TITLES.checks, count: checks.length })
    for (const c of checks) {
      const id = prCheckId(pr, c)
      const text = checkRowText(c)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      out.push({
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.lead ? `${text.lead} / ${text.title}` : text.title,
          detail: text.meta,
          age: doneAt(feedback),
          feedback,
          buttons: prButtons(checkActions(pr, c, presses)),
          isWaiting: isWaiting(id),
        },
      })
    }
  }
  if (prs.olderText) out.push({ kind: 'note', text: prs.olderText })

  return out
}

function pressFeedback(screen: PanelScreen, id: string, now: number, isMarkDone = false): Line['feedback'] {
  const f = feedbackOf(id, screen.view.lastActions[id], undefined, screen.view.turns, now)

  return f ? { text: markedFeedbackText(f, isMarkDone, AGENT), tone: feedbackTone(f), source: f } : null
}

const doneAt = (f: Line['feedback']): number | null => (f?.source?.is === 'done' ? f.source.at : null)

/** Where an Overview row's mark sits. A subject's text, its was line and the look line start at `PAGE_TEXT_AT`. */
const PAGE_MARK_AT = 3
const PAGE_TEXT_AT = PAGE_MARK_AT + 2
/** Where the mark of a child under a subject sits: after the tree's arm, which starts under the subject's mark. */
const PAGE_CHILD_AT = PAGE_MARK_AT + 3
const TREE_ARMS: Record<OverviewBranch, { first: string; rest: string }> = {
  mid: { first: '├─', rest: '│' },
  last: { first: '└─', rest: ' ' },
}

function pageEntries(page: OverviewPage): Entry[] {
  if (page.isEmpty)
    return [
      { kind: 'note', text: page.empty.title, isStrong: true },
      { kind: 'note', text: page.empty.hint, isWhole: true },
    ]
  const head: Entry[] = [
    ...(page.identity ? [{ kind: 'note' as const, text: page.identity }] : []),
    ...(page.goal ? [{ kind: 'note' as const, text: page.goal, isStrong: true }] : []),
    ...(page.live ? [{ kind: 'note' as const, text: page.live }] : []),
  ]
  const rows = page.rows.map((row): Entry => ({ kind: 'page', row }))

  return head.length > 0 && rows.length > 0 ? [...head, { kind: 'note', text: '' }, ...rows] : [...head, ...rows]
}

function entriesOf(screen: PanelScreen, ui: PanelUi, tab: ShownTab, now: number): Entry[] {
  if (!isRowTab(tab)) return pageEntries(screen.view.overviewPage)

  return tab === 'prs' ? prEntries(screen, now) : rowEntries(screen, ui, tab)
}

const linesOf = (entries: Entry[]): Line[] => entries.flatMap(e => (e.kind === 'row' ? [e.line] : []))
const waitsOf = (lines: Line[]) => lines.map(l => ({ id: l.id, isWaiting: isSelectable(l) && l.isWaiting }))
const isSelectable = (line: Line) => line.settled === null && !line.isStatic
/** A folded line the person has not opened: it draws one line and takes only Enter. */
const isShut = (line: Line, ui: Pick<PanelUi, 'opened'>) => line.isFolded && ui.opened !== line.id

function resolveSelected(lines: Line[], selectedId: string | null): Line | null {
  const selectable = lines.filter(isSelectable)
  const current = lines.find(l => l.id === selectedId)
  if (current && isSelectable(current)) return current
  const waits = waitsOf(lines)
  const nextId = (current ? rowAfterClose(waits, current.id) : null) ?? firstWaiting(waits)

  return lines.find(l => l.id === nextId) ?? selectable[0] ?? null
}

function defaultFocus(line: Line): number {
  return Math.max(
    0,
    line.buttons.findIndex(b => b.isRecommended),
  )
}

const focusOf = (line: Line, ui: PanelUi): number =>
  ui.focus?.rowId === line.id ? Math.min(ui.focus.index, line.buttons.length - 1) : defaultFocus(line)

export type KeyResult = { ui: PanelUi; press?: PanelPress; close?: true }

function withSelection(ui: PanelUi, id: string | null): PanelUi {
  return { ...ui, selectedId: id, focus: null, opened: ui.opened === id ? ui.opened : null }
}

const withTab = (ui: PanelUi, tab: ShownTab): PanelUi => ({ ...withSelection(ui, null), tab, pageTop: 0 })

/** Whether the line `id` on the shown tab waits on the person. */
export function isLineWaiting(screen: PanelScreen, ui: PanelUi, id: string, now: number): boolean {
  return waitsOf(linesOf(entriesOf(screen, ui, ui.tab, now))).some(w => w.id === id && w.isWaiting)
}

/**
 * After a press stops the selected row from waiting, the selection moves to the next row that waits, as the
 * terminal's does. The row stays selected when none waits. A failed send leaves the row waiting, so it stays selected.
 */
export function afterHandOff(screen: PanelScreen, ui: PanelUi, id: string, now: number): PanelUi {
  if (ui.selectedId !== id) return ui
  const lines = linesOf(entriesOf(screen, ui, ui.tab, now))
  const waits = waitsOf(lines)
  if (!lines.some(l => l.id === id) || waits.some(w => w.id === id && w.isWaiting)) return ui
  const next = rowAfterClose(waits, id)

  return next === null ? { ...ui, focus: null, opened: null } : withSelection(ui, next)
}

function activate(screen: PanelScreen, ui: PanelUi, line: Line, button: Button, now: number): KeyResult {
  const { press } = button
  if (button.isOut) return { ui }
  if (press.action === 'resume') {
    const { stop } = screen
    const isSending = ui.resuming?.is === 'sending' && ui.resuming.stopAt === stop?.at
    if (!stop || isSending) return { ui }

    return { ui: { ...ui, focus: null, resuming: { stopAt: stop.at, is: 'sending' } }, press }
  }
  if (!('ref' in press) && press.action === 'type') {
    const draft = ui.drafts[line.id] ?? { text: '', since: now }

    return { ui: { ...ui, typing: line.id, focus: null, drafts: { ...ui.drafts, [line.id]: draft } } }
  }
  if (!('ref' in press) && press.action === 'discard') {
    const { [line.id]: _discarded, ...drafts } = ui.drafts
    const recent = Object.entries(ui.discarded).filter(([, at]) => now - at < SETTLED_MS)

    return { ui: { ...ui, focus: null, drafts, discarded: { ...Object.fromEntries(recent), [line.id]: now } } }
  }

  return { ui: { ...ui, focus: null }, press }
}

function typingKey(ui: PanelUi, id: string, key: string, now: number, text: string | undefined): KeyResult {
  const draft = ui.drafts[id] ?? { text: '', since: now }
  const edit = (next: string): KeyResult => ({
    ui: { ...ui, drafts: { ...ui.drafts, [id]: { ...draft, text: next } } },
  })
  if (key === 'escape') return { ui: { ...ui, typing: null } }
  if (key === 'enter') {
    if (draft.text.trim() === '') return { ui }

    return { ui: { ...ui, typing: null }, press: { action: 'type', id, text: draft.text } }
  }
  if (key === 'backspace') return edit([...draft.text].slice(0, -1).join(''))
  if (text !== undefined) return edit(draft.text + text.replace(/[\r\n]+/g, ' '))

  return { ui }
}

/**
 * Applies one key. `key` is the parsed key name, as pi-tui's `parseKey` gives it. `text` is the printable text the
 * key types, which only a reply field reads.
 */
export function handleKey(screen: PanelScreen, ui: PanelUi, key: string, now: number, text?: string): KeyResult {
  const lines = linesOf(entriesOf(screen, ui, ui.tab, now))
  const selected = resolveSelected(lines, ui.selectedId)
  const base: PanelUi = { ...ui, selectedId: selected?.id ?? null }
  if (base.typing !== null) return typingKey(base, base.typing, key, now, text)
  if (key === 'escape') return { ui: base, close: true }
  const isUp = key === 'up' || key === 'k'
  if (!isRowTab(base.tab) && (isUp || key === 'down' || key === 'j'))
    return { ui: { ...base, pageTop: Math.max(0, base.pageTop + (isUp ? -1 : 1)) } }
  const selectable = lines.filter(isSelectable)
  const at = selectable.findIndex(l => l.id === selected?.id)
  if ((key === 'up' || key === 'k' || key === 'down' || key === 'j') && selectable.length > 0) {
    const step = key === 'up' || key === 'k' ? -1 : 1

    return { ui: withSelection(base, selectable[wrapIndex(Math.max(0, at) + step, selectable.length)]!.id) }
  }
  const shown = shownTabs(screen.isNextBuild === true)
  const tabs = shown.map(t => t.id)
  const pickedTab = shown.find(t => t.hotkey === key)
  if (key === 'tab' || key === 'shift+tab') {
    const step = key === 'tab' ? 1 : -1

    return { ui: withTab(base, tabs[wrapIndex(tabs.indexOf(base.tab) + step, tabs.length)]!) }
  }
  if (pickedTab) return { ui: withTab(base, pickedTab.id) }
  if (key === 'u') {
    const undoable = lines.filter(l => l.settled?.undo).at(-1)
    const press = undoable?.settled?.undo
    if (undoable && press) return { ui: withSelection(base, undoable.id), press }

    return { ui: base }
  }
  if (selected?.fold && key === 'enter') {
    const kind = selected.fold
    const unfolded = base.unfolded.includes(kind) ? base.unfolded.filter(k => k !== kind) : [...base.unfolded, kind]

    return { ui: { ...base, unfolded } }
  }
  if (selected && isShut(selected, base))
    return key === 'enter' ? { ui: { ...base, opened: selected.id } } : { ui: base }
  if (!selected || selected.buttons.length === 0) return { ui: base }
  if (key === 'left' || key === 'right') {
    const index = wrapIndex(focusOf(selected, base) + (key === 'left' ? -1 : 1), selected.buttons.length)

    return { ui: { ...base, focus: { rowId: selected.id, index } } }
  }
  const button = key === 'enter' ? selected.buttons[focusOf(selected, base)] : selected.buttons.find(b => b.key === key)

  return button ? activate(screen, base, selected, button, now) : { ui: base }
}

export type SeenRows = RowRecord<Tab>

/** Each tab's row ids: every row it lists, and the open rows a freshly opened panel moves for. PRs are null while they load. */
function tabRows(screen: PanelScreen): { listed: Record<Tab, string[] | null>; open: Record<Tab, string[]> } {
  const { view } = screen

  return {
    listed: { ...listedRowIds(view), prs: screen.isFetchingPrs ? null : prRowIds(view.prs.drawn) },
    open: { ...openRowIds(view), prs: [] },
  }
}

function isShownEmpty(screen: PanelScreen, ui: PanelUi, tab: Tab): boolean {
  const { view } = screen
  if (tab === 'prs') return isPrsTabEmpty(view.prs.drawn.length, screen.isFetchingPrs)
  const rows = tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows
  return isTabEmpty({
    rows,
    settled: new Set(rows.filter(r => r.state.is === 'settled').map(r => r.id)),
    closed: closedGroups(view, tab, kind => ui.unfolded.includes(kind)),
    hasBlocker: tab === 'needsYou' && screen.stop !== null,
  })
}

/**
 * Records which rows are new since `seen`, and where the panel moves for them. While the shown tab is empty, it moves
 * to the first other tab with new rows, or as the panel opens, with open rows. A default selection stays on the row it
 * was on when new rows arrive above it.
 */
export function followRows(
  screen: PanelScreen,
  ui: PanelUi,
  seen: SeenRows,
  isOpening: boolean,
  now: number,
): { ui: PanelUi; seen: SeenRows } {
  const { listed, open } = tabRows(screen)
  const recorded = recordRows(seen, listed)
  const { tab } = ui
  if (!isRowTab(tab)) return { ui, seen: recorded.seen }
  const to = followTo(ARRIVAL_TABS, tab, isShownEmpty(screen, ui, tab), isOpening ? open : recorded.added)
  if (to) return { ui: withTab(ui, to), seen: recorded.seen }
  const arrived = recorded.added[tab]
  if (ui.selectedId !== null || arrived.length === 0) return { ui, seen: recorded.seen }
  const kept = keptOpen(waitsOf(linesOf(entriesOf(screen, ui, tab, now))), arrived)

  return { ui: kept === null ? ui : { ...ui, selectedId: kept }, seen: recorded.seen }
}

/**
 * True while the view changes with the clock alone: a closed row counting down to leave, a local press's result
 * showing, a send waiting to read as queued, or a notice. Changes the host saves arrive as events instead.
 */
export function isAnimating(screen: PanelScreen, ui: PanelUi, now: number): boolean {
  const { view } = screen
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const isPressMoving = Object.values(view.lastActions).some(
    l =>
      (l.result !== undefined && (l.result.state === 'pending' || now - l.result.at < SETTLED_MS)) ||
      (l.delivery?.state === 'queued' && now - l.at < QUEUED_AFTER_MS),
  )
  const isNoticeShown = ui.notice !== null && now - ui.notice.at < SETTLED_MS

  return (
    rows.some(r => r.state.is === 'settled') || view.prs.drawn.some(p => p.isSettled) || isPressMoving || isNoticeShown
  )
}

/** Whether the Overview is shown with a running mark, whose frame moves with the clock. */
export function isRunningMarkShown(screen: PanelScreen, ui: PanelUi): boolean {
  return !isRowTab(ui.tab) && hasRunningMark(screen.view.overviewPage)
}

/** The notice for a press the row cannot show: a failed send, or a press whose row had changed. */
export function noticeFor(outcome: { error: string | null; note: 'stale' | null }, now: number): PanelUi['notice'] {
  const text = outcome.error ?? (outcome.note ? noteText() : null)

  return text === null ? null : { text, at: now }
}

const ANSI = /\x1b\[[0-9;]*m/g
export const visibleLength = (s: string): number => cellWidth(s.replace(ANSI, ''))

function fit(s: string, width: number): string {
  if (visibleLength(s) <= width) return s
  let out = ''
  let n = 0
  for (const part of s.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) {
      out += part
      continue
    }
    const cells = cellWidth(part)
    if (n + cells > width - 1) return `${out}${cutToCells(part, width - 1 - n)}…\x1b[0m`
    out += part
    n += cells
  }

  return out
}

function spread(left: string, right: string, width: number): string {
  const gap = width - visibleLength(left) - visibleLength(right)

  return gap >= 2 ? left + ' '.repeat(gap) + right : fit(left, width)
}

function wrapText(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const long = cellWidth(word) > width ? cutToCells(word, width - 1) + '…' : word
      if (line === '') line = long
      else if (cellWidth(line) + 1 + cellWidth(long) <= width) line += ` ${long}`
      else {
        out.push(line)
        line = long
      }
    }
    out.push(line)
  }

  return out
}

function indented(
  text: string,
  indent: number,
  width: number,
  maxLines: number,
  paint: (s: string) => string,
): string[] {
  const wrapped = wrapText(text, Math.max(10, width - indent - 1))
  const shown = wrapped.slice(0, maxLines)
  if (wrapped.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]!.replace(/.$/, '')}…`

  return shown.map(l => ' '.repeat(indent) + paint(l))
}

type Draw = { screen: PanelScreen; ui: PanelUi; width: number; now: number; style: Style }

function buttonCell(b: Button, isFocused: boolean, s: Style, mark = ''): string {
  if (isFocused) return s.inverse(b.isOut ? s.dim(` ↵ ${b.label}${mark} `) : s.bold(` ↵ ${b.label}${mark} `))
  if (b.isOut && !b.isFollowUp) return s.dim(b.key ? ` ${b.key} ${b.label}${mark} ` : ` ${b.label}${mark} `)
  if (b.isFollowUp) return s.dim(b.key ? ` ${b.key} ${b.label} ` : ` ${b.label} `)
  const label = (b.isRecommended ? s.underline(b.label) : b.label) + mark

  return b.key ? ` ${s.bold(b.key)} ${label} ` : ` ${label} `
}

/** What `actionLabel` adds to the label, measured on the focused cell, the widest form, alone on a line. */
function labelMark(b: Button, room: number, s: Style): string {
  const fits = (label: string) => visibleLength(buttonCell({ ...b, label }, true, s)) <= room

  return actionLabel({ label: b.label, isPrimary: b.isRecommended }, fits).slice(b.label.length)
}

function buttonLines(line: Line, ui: PanelUi, indent: number, width: number, s: Style): string[] {
  const focused = focusOf(line, ui)
  const cells = line.buttons.map((b, i) => buttonCell(b, i === focused, s, labelMark(b, width - indent, s)))
  const sizes = cells.map(visibleLength)
  const firstFollowUp = line.buttons.findIndex(b => b.isFollowUp)
  const keyCount = firstFollowUp < 0 ? cells.length : firstFollowUp
  const { lines } = actionLines(sizes.slice(0, keyCount), sizes.slice(keyCount), {
    width: width - indent,
    gap: 0,
    separator: 0,
  })

  return lines.map(at => ' '.repeat(indent) + at.map(i => cells[i]).join(''))
}

function leadText(lead: Lead, s: Style): string {
  const padded = lead.text.padEnd(2)

  return lead.tone ? s.tone(lead.tone, padded) : padded
}

function feedbackPaint(tone: Tone | null, s: Style) {
  return (text: string) => (tone ? s.tone(tone, text) : s.dim(text))
}

function drawLine(line: Line, isSelected: boolean, d: Draw): string[] {
  const { ui, width, now, style: s } = d
  const pad = line.depth * 2
  const out: string[] = []
  const status = line.status
    ? `  ${line.status.tone ? s.tone(line.status.tone, line.status.text) : s.dim(line.status.text)}${s.dim(line.status.rest)}`
    : ''
  const statusUnder =
    line.feedback &&
    line.settled === null &&
    !isShut(line, ui) &&
    isStatusUnderActions(line.feedback.source, isSelected)
      ? line.feedback
      : null
  const after = line.settled
    ? `  ${line.settled.tone === 'done' ? s.tone('done', line.settled.label) : s.dim(line.settled.label)}${line.settled.undo ? `  ${s.dim('u Undo')}` : ''}`
    : line.feedback && !statusUnder
      ? `  ${feedbackPaint(line.feedback.tone, s)(line.feedback.text)}`
      : ''
  const title = line.isDim ? s.dim(line.title) : isSelected ? s.bold(line.title) : line.title
  // omp marks a selected item with ❯, its `nav.cursor` symbol, and keeps ▸ and ▾ for expand and collapse.
  const cursor = isSelected ? s.tone('accent', '❯') : ' '
  const age = line.age !== null && line.settled === null ? s.dim(ago(now - line.age)) : ''
  out.push(spread(` ${' '.repeat(pad)}${cursor} ${leadText(line.lead, s)} ${title}${status}${after}`, `${age} `, width))
  if (line.settled || isShut(line, ui)) return out
  const indent = INDENT + pad
  if (line.detail && (isSelected || line.isDetailShown)) out.push(...indented(line.detail, indent, width, 4, s.dim))
  if (!isSelected) return out
  if (line.file) out.push(' '.repeat(indent) + s.tone('accent', line.file))
  for (const o of line.row?.optionDescriptions ?? [])
    out.push(fit(' '.repeat(indent) + o.label + s.dim(`: ${o.description}`), width))
  // As in the terminal, an open reply field replaces the row's buttons: Enter sends, so no button reads as focused.
  if (line.buttons.length > 0 && ui.typing !== line.id) out.push(...buttonLines(line, ui, indent - 1, width, s))
  if (ui.typing === line.id) {
    const hint = line.row ? replyHint(line.row, AGENT) : 'Your reply'
    const text = ui.drafts[line.id]?.text ?? ''
    out.push(' '.repeat(indent) + s.dim(`${hint}:`))
    const field = wrapText(`${text}\u0000`, Math.max(10, width - indent - 1))
    out.push(...field.map(l => ' '.repeat(indent) + l.replace('\u0000', s.inverse(' '))))
  }
  if (statusUnder) out.push(...indented(statusUnder.text, indent, width, 4, feedbackPaint(statusUnder.tone, s)))

  return out
}

/**
 * One line of the Overview's list: a mark, its text wrapped after it to at most `maxLines` lines and cut with an
 * ellipsis past them, and the age at the panel's right edge. `paint` styles the text from `plainCells` on, so a
 * subject's name stays plain and where it stands draws dim.
 */
function pageLine(
  d: Draw,
  indent: number,
  mark: string,
  text: string,
  age: string | null,
  {
    plainCells = 0,
    agePaint = d.style.dim,
    maxLines = Infinity,
  }: { plainCells?: number; agePaint?: (t: string) => string; maxLines?: number } = {},
): string[] {
  const { width, style: s } = d
  const textAt = indent + 2
  const side = age ? cellWidth(age) + 1 : 0
  const room = Math.max(10, width - textAt - side - 1)
  const wrapped = wrapText(text, room)
  const lines = wrapped.slice(0, maxLines)
  if (wrapped.length > lines.length)
    lines[lines.length - 1] = `${cutToCells(lines.at(-1)!, room - 1).replace(/[\s.,;:]+$/, '')}…`
  let plainLeft = plainCells
  const painted = lines.map(l => {
    const plain = cutToCells(l, Math.max(0, plainLeft))
    plainLeft -= cellWidth(l) + 1

    return plain + s.dim(l.slice(plain.length))
  })
  const gap = Math.max(1, width - 1 - textAt - cellWidth(lines[0] ?? '') - (age ? cellWidth(age) : 0))

  return [
    `${' '.repeat(indent)}${mark} ${painted[0] ?? ''}${age ? ' '.repeat(gap) + agePaint(age) : ''}`,
    ...painted.slice(1).map(l => ' '.repeat(textAt) + l),
  ]
}

/** A row's lines with the tree line at `PAGE_MARK_AT`: `first` on its first line when given, and `rest` on each line after. */
function withTree(lines: string[], first: string | null, rest: string, s: Style): string[] {
  const drawn = (line: string, glyph: string) =>
    glyph.trim() === '' ? line : line.slice(0, PAGE_MARK_AT) + s.dim(glyph) + line.slice(PAGE_MARK_AT + glyph.length)

  return lines.map((l, n) => (n === 0 ? (first ? drawn(l, first) : l) : drawn(l, rest)))
}

/** A line on the Overview page, laid out as the shared row says. */
function drawPageRow(row: OverviewRow, d: Draw): string[] {
  const { width, now, style: s } = d
  if (row.kind === 'subject') {
    const glyph = row.isRunning ? runningMark(now) : row.mark
    const mark = row.tone ? s.tone(row.tone, glyph) : s.dim(glyph)
    const text = row.text ? `${row.name}: ${row.text}` : row.name
    const out = pageLine(d, PAGE_MARK_AT, mark, text, row.age, {
      plainCells: cellWidth(row.name),
      maxLines: row.maxLines,
    })
    if (row.was) out.push(...indented(`${WAS_PREFIX}${row.was}`, PAGE_TEXT_AT, width, row.maxLines, s.dim))

    return row.hasChildren ? withTree(out, null, '│', s) : out
  }
  if (row.kind === 'child') {
    const mark = s.dim(row.isRunning ? runningMark(now) : row.mark)
    const tone = row.ageTone
    const agePaint = tone ? (t: string) => s.tone(tone, t) : s.dim
    const out = pageLine(d, row.branch ? PAGE_CHILD_AT : PAGE_MARK_AT, mark, row.name, row.age, {
      agePaint,
      maxLines: row.maxLines,
    })

    return row.branch ? withTree(out, TREE_ARMS[row.branch].first, TREE_ARMS[row.branch].rest, s) : out
  }
  if (row.kind === 'more') {
    const arm = TREE_ARMS[row.branch]

    return withTree([' '.repeat(PAGE_CHILD_AT + 2) + s.dim(row.text)], arm.first, arm.rest, s)
  }
  if (row.kind === 'look') {
    const label = LOOK_RULE_LABEL
    const fill = '─'.repeat(Math.max(2, width - 1 - PAGE_TEXT_AT - cellWidth(label) - cellWidth(row.age) - 1))

    return [`${' '.repeat(PAGE_TEXT_AT)}${s.dim(label + fill)} ${s.dim(row.age)}`]
  }
  const mark = row.tone ? s.tone(row.tone, row.mark) : s.dim(row.mark)

  return pageLine(d, PAGE_MARK_AT, mark, row.text, row.age, {})
}

type TabCell = {
  id: ShownTab
  hotkey: string
  label: string
  symbol: string
  tone: ToneName | null
  /** What follows the name: a count, or the Overview's news dot. */
  badge: string | null
  isShown: boolean
}

/** One layout of the tab line. Each later layout is narrower. */
type TabForm = { isBracketed: boolean; hasNewsDot: boolean }

/** The narrowest form, tried only with the symbols, drops the Overview's news dot so a row tab's count still fits. */
const TAB_FORMS: readonly TabForm[] = [
  { isBracketed: true, hasNewsDot: true },
  { isBracketed: false, hasNewsDot: true },
  { isBracketed: false, hasNewsDot: false },
]

function tabCell(t: TabCell, name: string, form: TabForm, s: Style): string {
  const key = form.isBracketed ? `[${t.hotkey}]` : t.hotkey
  const badge = form.hasNewsDot || isRowTab(t.id) ? t.badge : null
  if (t.isShown) return s.inverse(s.bold(` ${key} ${name}${badge === null ? '' : ` ${badge}`} `))
  const badgeText = badge === null ? '' : ` ${t.tone ? s.tone(t.tone, badge) : badge}`

  return ` ${s.dim(`${key} ${name}`)}${badgeText} `
}

/**
 * The tab line. As the panel narrows, it drops the `[n]` brackets, then names the tabs by their symbols, with and then
 * without brackets. Narrower still, the final `fit()` in `drawPanel` cuts the line's end.
 */
function tabBar(d: Draw): string {
  const { screen, ui, width, style: s } = d
  const counts: Record<Tab, number> = {
    needsYou: screen.view.needsYou.count,
    findings: screen.view.findings.count,
    prs: screen.view.prs.count,
  }
  const tabs: TabCell[] = shownTabs(screen.isNextBuild === true).map(t => ({
    ...t,
    tone: isRowTab(t.id) ? t.id : null,
    badge: tabBadge(t.id, counts, screen.view.overviewPage.hasNews),
    isShown: t.id === ui.tab,
  }))
  const lineOf = (naming: TabNaming, form: TabForm) =>
    ` ${tabs.map(t => tabCell(t, tabName(t, naming), form, s)).join(' ')}`
  const { naming, layout } = fitTabs(TAB_FORMS, (naming, form) => {
    const isDotDroppedEarly = naming === 'words' && !form.hasNewsDot

    return !isDotDroppedEarly && visibleLength(lineOf(naming, form)) <= width
  })

  return spread(lineOf(naming, layout), s.dim('esc to close '), width)
}

function footer(d: Draw, isPageScrolling: boolean): string[] {
  const { screen, ui, width, now, style: s } = d
  const out: string[] = [s.dim('─'.repeat(width))]
  const status = footerStatus(ui.tab, screen.view.status, {
    isFetching: screen.isFetchingPrs,
    hasPrs: screen.view.prs.drawn.length > 0,
  })
  if (screen.isDemo) out.push(fit(` ${s.dim(DEMO_NOTICE)}`, width))
  if (status.text) out.push(` ${s.dim(status.text)}`)
  if (status.error) out.push(...indented(status.error, 1, width, 2, t => s.tone('error', t)))
  if (ui.notice && now - ui.notice.at < SETTLED_MS)
    out.push(...indented(ui.notice.text, 1, width, 2, t => s.tone('error', t)))
  const hints =
    ui.typing !== null
      ? [`↵ ${ROW_COPY.send}`, `esc ${ROW_COPY.cancel}`]
      : isRowTab(ui.tab)
        ? ['←→ pick', '↵ press', '↑↓ move', 'tab switch']
        : isPageScrolling
          ? ['↑↓ scroll', 'tab switch']
          : ['tab switch']
  const model = `${screen.modelName ? `inbox model ${screen.modelName}` : 'no inbox model: set @inbox'}  ${versionLabel(version, screen.isNextBuild === true)} `
  const hintLine = ` ${hints.map(h => s.dim(h)).join(` ${s.tone('sep', '·')} `)}`
  const fitsBesideHints = width - visibleLength(hintLine) - visibleLength(model) >= 2
  if (fitsBesideHints) out.push(spread(hintLine, s.dim(model), width))
  else out.push(fit(hintLine, width), fit(` ${s.dim(model.trimEnd())}`, width))

  return out
}

/** The panel's lines for `width`. With `height`, the rows scroll inside it and keep the selected row in view. */
export function render(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
): string[] {
  return drawPanel(screen, ui, width, now, style, height).lines
}

/**
 * The panel's lines, and the Overview page's scroll clamped to what the panel can show. With `minHeight`, blank lines
 * above the footer make the panel at least that tall.
 */
export function drawPanel(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
  minHeight = 0,
): { lines: string[]; pageTop: number } {
  const d: Draw = { screen, ui, width, now, style }
  const entries = entriesOf(screen, ui, ui.tab, now)
  const selected = resolveSelected(linesOf(entries), ui.selectedId)
  const rule = style.dim('─'.repeat(width))
  const head = [rule, tabBar(d), rule]
  const pageRule = `${' '.repeat(PAGE_TEXT_AT)}${style.dim('─'.repeat(Math.max(0, width - PAGE_TEXT_AT - 1)))}`
  const body: string[] = []
  let selectedAt = [0, 0]
  for (const e of entries) {
    if (e.kind === 'heading') body.push(` ${style.bold(e.text)}${e.count ? style.dim(` · ${e.count}`) : ''}`)
    else if (e.kind === 'page') body.push(...(e.row.isRuledAbove ? [pageRule] : []), ...drawPageRow(e.row, d))
    else if (e.kind === 'note')
      body.push(
        ...indented(e.text, e.indent ?? 1, width, e.isWhole ? Infinity : 3, e.isStrong ? style.bold : style.dim),
      )
    else {
      const isSelected = e.line.id === selected?.id
      const start = body.length
      body.push(...drawLine(e.line, isSelected, d))
      if (isSelected) selectedAt = [start, body.length - 1]
    }
  }
  const roomBeside = (foot: string[]) =>
    height === undefined ? Infinity : Math.max(6, height - head.length - foot.length)
  const isPage = !isRowTab(ui.tab)
  const isPageTaller = isPage && body.length > roomBeside(footer(d, false))
  const foot = footer(d, isPageTaller)
  const room = roomBeside(foot)
  const blanks = (shown: string[]) =>
    Array<string>(Math.max(0, minHeight - head.length - shown.length - foot.length)).fill('')
  const isOverflowing = body.length > room
  const pageTop = isPage ? Math.min(Math.max(0, ui.pageTop), isOverflowing ? body.length - room + 1 : 0) : ui.pageTop
  const shown = !isOverflowing
    ? body
    : isPage
      ? pageWindow(body, pageTop, room, style)
      : scrolled(body, selectedAt, room, style)

  return { lines: [...head, ...shown, ...blanks(shown), ...foot].map(l => fit(l, width)), pageTop }
}

/** The most lines a shown tab draws, each tab as switching to it would show it. */
export function tallestTabHeight(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
): number {
  const heights = shownTabs(screen.isNextBuild === true).map(
    t => drawPanel(screen, t.id === ui.tab ? ui : withTab(ui, t.id), width, now, style, height).lines.length,
  )

  return Math.max(...heights)
}

const moreLines = (arrow: string, n: number, s: Style) => s.dim(`  ${arrow} ${n} more line${n === 1 ? '' : 's'}`)

/**
 * `room` lines of the page, `top` presses past its first screen. Each press shows one more line at the bottom, so the
 * first press also hides the line the "↑" line takes, and the press before the end leaves "↓ 1 more line".
 */
function pageWindow(body: string[], top: number, room: number, s: Style): string[] {
  const end = Math.min(body.length, room - 1 + top)
  const below = body.length - end
  const start = end - (room - (top > 0 ? 1 : 0) - (below > 0 ? 1 : 0))

  return [
    ...(top > 0 ? [moreLines('↑', start, s)] : []),
    ...body.slice(start, end),
    ...(below > 0 ? [moreLines('↓', below, s)] : []),
  ]
}

function scrolled(body: string[], selectedAt: number[], room: number, s: Style): string[] {
  const [first = 0, last = 0] = selectedAt
  let start = Math.min(Math.max(0, first - 1), body.length - room)
  if (last > start + room - 2) start = Math.min(Math.max(first, last - room + 2), body.length - room)
  const end = start + room
  const clip = body.slice(start, end)
  if (start > 0) clip[0] = s.dim(`  ↑ ${start} more lines`)
  if (end < body.length) clip[clip.length - 1] = s.dim(`  ↓ ${body.length - end} more lines`)

  return clip
}

/** The band above the prompt: the two counts, and under them why the last turn stopped. */
export function bandLines(screen: PanelScreen, width: number, now: number, style: Style): string[] {
  const { needsYou, findings } = screen.view
  const counts = LISTED_TABS.map(t => ({ t, count: t.id === 'needsYou' ? needsYou.count : findings.count }))
    .filter(x => x.count > 0)
    .map(x => `${style.dim(x.t.label)} ${style.tone(x.t.id, String(x.count))}`)
  const left = ` ${counts.length > 0 ? counts.join(` ${style.tone('sep', '·')} `) : style.dim('Nothing needed')}`
  const countLine = spread(left, style.dim('/inbox to open '), width)
  const { stop } = screen
  if (!stop) return [countLine]
  const stopLine = ` ${style.tone('error', `Stopped ${ago(now - stop.at)}:`)} ${stopText(stop)}. ${style.dim(stopFix(stop))}`

  return [countLine, fit(stopLine, width)]
}
