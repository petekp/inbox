import type { FoldKind } from '../../types'
import type { PrAction } from '../../hooks/pr-press'
import {
  canUndoRefused,
  settledTone,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  isWaitingRow,
  waitingCount,
  rowTitle,
  rowResultMark,
  settledLabel,
} from '../../hooks/rows'
import { feedbackOf, markedFeedbackText, isFailure, rowFeedbackText } from '../../hooks/feedback'
import { groupEmptyText } from '../../hooks/banners'
import { rowKeyPlan } from '../../hooks/action-plan'
import type { BannerView } from '../../hooks/banners'
import type { ClosedDelivery, RowView, ResultMark } from '../../hooks/rows'
import type { Feedback } from '../../hooks/feedback'
import type { StatusRow } from '../../hooks/status-page'
import type { HelpKey, LegendEntry } from '../../hooks/help'
import type { PanelPress, PanelScreen, PanelUi, Tone } from './panel'

export const AGENT = 'omp'
const REPLY_KEY = 'r'
export const INDENT = 7
/** Where a line with no lead indents its detail and buttons: one cell in from its title. */
export const UNLED_INDENT = INDENT - 3
export const STOP_ID = 'stop'

export type Button = {
  label: string
  key: string | null
  press: PanelPress
  isRecommended: boolean
  isFollowUp: boolean
  /** Its press is out, so it draws dim and its key does nothing. */
  isOut?: boolean
}

/** What a button draws. A Status button presses nothing the host runs, so it has a face and no `press`. */
export type ButtonFace = Omit<Button, 'press'>

export type Lead = { text: string; tone: Tone | null }

export type Line = {
  id: string
  /** Extra indent, for the rows under a PR. */
  depth: number
  /** The mark before the title. An Asks or Finds row has none, so its title starts in the mark's place. */
  lead: Lead | null
  /** A ranked PR's number in the agent's order, drawn dim before the lead. */
  rank: string | null
  /** The mark before the result: the settled label, a Closed line's outcome, or a handed-off row's feedback. */
  mark: ResultMark | null
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
  /**
   * The PRs tab's own buttons, drawn on one line after the line's title, if any, with their press status after them,
   * or under them when it does not fit. Their keys work from any row of the tab.
   */
  isTabButtons: boolean
}

export type Entry =
  /** A Finds group's heading leads with its kind's mark, since its rows draw none. */
  | { kind: 'heading'; text: string; count?: number; mark?: Lead }
  /** A note stops at 3 lines. One with `isWhole`, such as an empty page's hint, is the page's content and wraps in full. */
  | { kind: 'note'; text: string; isStrong?: boolean; isPlain?: boolean; indent?: number; isWhole?: boolean }
  | { kind: 'row'; line: Line }
  | { kind: 'page'; row: StatusRow }
  | { kind: 'banner'; banner: BannerView }
  /** A key Help lists, its keys padded to `column`. */
  | { kind: 'key'; key: HelpKey; column: number }
  | { kind: 'legend'; entry: LegendEntry }

export const blankLine = (id: string): Line => ({
  id,
  depth: 0,
  lead: { text: '', tone: null },
  rank: null,
  mark: null,
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
  isTabButtons: false,
})

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

export function prButtons(actions: PrAction[]): Button[] {
  return actions.map(a => ({
    label: a.label,
    key: a.hotkey ?? null,
    press: a.press,
    isRecommended: false,
    isFollowUp: a.isFollowUp === true,
    isOut: a.isOut,
  }))
}

function lineOfRow(row: RowView): Line {
  const feedbackLabel = rowFeedbackText(row, AGENT)
  const f = row.feedback
  const state = row.state
  const undo = row.actions.find(a => a.press.action === 'undo')

  return {
    ...blankLine(row.id),
    lead: null,
    mark: rowResultMark(row),
    title: rowTitle(row, AGENT),
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
  outcomeLabel: string
  delivery: ClosedDelivery
  mark: ResultMark
}

export type Group = { kind: FoldKind; title: string; mark?: Lead; rows: RowView[]; closed: ClosedLine[] }

const settledIn = (g: Group) => new Set(g.rows.filter(r => r.state.is === 'settled').map(r => r.id))
export const isGroupEmpty = (g: Group) => g.rows.length === 0 && closedTotal(g.closed, settledIn(g)) === 0

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
    lead: null,
    mark: d.mark,
    title: d.title,
    isDim: true,
    age: d.at,
    feedback: { text: settledLabel(d.outcomeLabel, d.delivery), tone: null, source: null },
    buttons: canUndo ? [undo] : [],
    isStatic: !canUndo,
    isWaiting: false,
  }
}

export function groupEntries(g: Group, unfolded: readonly FoldKind[]): Entry[] {
  const settled = settledIn(g)
  const total = closedTotal(g.closed, settled)
  const out: Entry[] = [
    { kind: 'heading', text: g.title, count: waitingCount(g.rows), ...(g.mark ? { mark: g.mark } : {}) },
  ]
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
  if (earlier) out.push({ kind: 'note', text: earlier, indent: 5 })

  return out
}

export function pressFeedback(screen: PanelScreen, id: string, now: number, isMarkDone = false): Line['feedback'] {
  const f = feedbackOf(id, screen.view.lastActions[id], undefined, screen.view.turns, now)

  return f ? { text: markedFeedbackText(f, isMarkDone, AGENT), tone: feedbackTone(f), source: f } : null
}

export const doneAt = (f: Line['feedback']): number | null => (f?.source?.is === 'done' ? f.source.at : null)

export const linesOf = (entries: Entry[]): Line[] => entries.flatMap(e => (e.kind === 'row' ? [e.line] : []))
export const waitsOf = (lines: Line[]) => lines.map(l => ({ id: l.id, isWaiting: isSelectable(l) && l.isWaiting }))
export const isSelectable = (line: Line) => line.settled === null && !line.isStatic
/** A folded line the person has not opened: it draws one line and takes only Enter. */
export const isShut = (line: Line, ui: Pick<PanelUi, 'opened'>) => line.isFolded && ui.opened !== line.id
