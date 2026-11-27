import type { GoalPart } from './panel-goal'
import type { FoldKind, PressKind } from '../../types'
import { foldGlyph } from '../../core/view/fold-chevron'
import type { PrAction } from '../../core/view/pr-press'
import {
  closedTitleTone,
  settledTone,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  isWaitingRow,
  waitingCount,
  rowTitle,
  rowResultMark,
  openMark,
  settledLabel,
} from '../../core/view/rows'
import { feedbackOf, feedbackTone, markedFeedbackText, rowAgeAt, rowFeedbackText } from '../../core/view/feedback'
import { actionId } from '../../core/domain/press-labels'
import { localEffects } from '../../core/domain/help-steps'
import type { RowPress } from '../../core/domain/presses'
import { isPrPress, prPressEffect, pressRowId } from '../../core/view/pr-press'
import type { PrPress } from '../../core/view/pr-press'
import type { Effect } from '../../core/view/press-reducer'
import { unshownPressFeedback, unshownPressOut } from '../../core/view/unshown-press'
import { groupEmptyText } from '../../core/view/banners'
import { rowKeyPlan } from '../../core/view/action-plan'
import type { AnswerRow } from '../../core/view/action-plan'
import type { BannerView } from '../../core/view/banners'
import type { RowView, ResultMark } from '../../core/view/rows'
import type { ClosedLineView } from '../../core/view/closed-line'
import type { Feedback } from '../../core/view/feedback'
import type { StatusKeyTarget } from '../../core/view/status-keys'
import type { StatusRow } from '../../core/view/status-page'
import type { WorkJoint } from '../../core/view/status-path'
import type { HelpKey, LegendEntry } from '../../core/view/help'
import type { PanelPress, PanelScreen, PanelUi, Tone } from './panel'

export const AGENT = 'omp'
/** Cells a lead and the space after it take before a led line's title. */
export const LEAD_CELLS = 3
export const STOP_ID = 'stop'
export const HERDR_ASK_ID = 'herdr-ask'

export type Button = {
  label: string
  key: string | null
  press: PanelPress
  isRecommended: boolean
  isFollowUp: boolean
  kind?: PressKind
  /** Its press is out, so it draws dim and its key does nothing. */
  isOut?: boolean
  /** It holds up nothing, so it draws dim until focused. */
  isQuiet?: boolean
  /** An answer, which the question's tree draws with its note under it. Options come first in a line's buttons. */
  option?: { note: string | null }
}

/** What a button draws. A Status button presses nothing the host runs, so it has a face and no `press`. */
export type ButtonFace = Omit<Button, 'press'>

/**
 * Where a line sits on the tree that hangs from its group heading's mark, as the terminal's group rows do. `mid` and
 * `last` rows draw an arm off the trunk, and the trunk runs beside a `mid` row's other lines. `off` lines, such as the
 * Closed fold, sit in the group under the tree's last row, with no arm.
 */
type TreePlace = 'mid' | 'last' | 'off'

/** `dim` draws the lead as the panel's other muted marks. */
export type Lead = { text: string; tone: Tone | 'dim' | null }

export type Line = {
  id: string
  /** Extra indent, for the rows under a PR. A row on a tree takes none: its arm shows where it hangs. */
  depth: number
  tree?: TreePlace
  /** The mark before the title: ? on an open question, ◆ on an open dialog, □ on an open task. A Finds row has none, so its title starts in the mark's place. */
  lead: Lead | null
  /** The mark before the result: the settled label, a Closed line's outcome, or a handed-off row's feedback. */
  mark: ResultMark | null
  title: string
  /** Draws the title bold in this tone, as the install question's. */
  titleTone: Tone | null
  isDim: boolean
  /** The status words after a PR's title. */
  status: { text: string; tone: Tone | null; rest: string } | null
  age: number | null
  detail: string | null
  file: string | null
  feedback: { text: string; tone: Tone | null; source: Feedback | null } | null
  /** Set once the row has closed and its label shows until it leaves. */
  /** `tint` is the tone the row's title takes while it fades, or null for a PR, which takes none. */
  settled: {
    label: string
    tone: 'done' | 'muted'
    tint: 'done' | 'muted' | 'error' | null
    undo: PanelPress | null
    at: number
  } | null
  buttons: Button[]
  /** Set when a question's answers may sit side by side, as `rowKeyPlan` offers it. */
  answerRow?: AnswerRow
  row: RowView | null
  /** The group a Closed line folds. Enter unfolds or folds it. */
  fold: FoldKind | null
  /** The group whose earlier Closed lines this line lists. Enter lists them. */
  earlierOf: FoldKind | null
  /** Text the selected line shows under its title, as a review comment past its first line. */
  body: string | null
  /** A line the selection skips: a closed row with nothing to press, or a stop with no Resume. */
  isStatic: boolean
  /** Whether the line waits on the person, so a default selection may land on it. */
  isWaiting: boolean
  /** Shows the detail when the line is not selected. */
  isDetailShown: boolean
  /** A handed-off row, drawn as its one line until the person opens it. */
  isFolded: boolean
  /** A row the person collapsed: drawn as its one line, even while selected, until they expand it. */
  isCollapsed?: boolean
  /** A PR's own line, which no look tints as new: its threads and checks get the tint. */
  isPrHead?: boolean
  /**
   * The PRs tab's own buttons, drawn on one line after the line's title, if any, with their press status after them,
   * or under them when it does not fit. Their keys work from any row of the tab.
   */
  isTabButtons: boolean
  /** A press on the line is out and the view does not show it yet, so its age reads `SENDING`, as Codex's side column does. */
  isSending?: boolean
}

export type Entry =
  /** A Finds group's heading leads with its kind's mark, since its rows draw none. */
  | { kind: 'heading'; text: string; count?: number; mark?: Lead; aside?: string }
  /** A note stops at 3 lines. One with `isWhole`, such as an empty page's hint, is the page's content and wraps in full. */
  | { kind: 'note'; text: string; isStrong?: boolean; isPlain?: boolean; indent?: number; isWhole?: boolean }
  | { kind: 'row'; line: Line }
  /** A Status row, with the goal's path line beside it while it is the work of a milestone the path runs on from. */
  | { kind: 'page'; row: StatusRow; joint?: WorkJoint }
  | { kind: 'goal'; part: GoalPart }
  | { kind: 'banner'; banner: BannerView }
  /** A key Help lists, starting at cell `at`, its keys padded to `column`. */
  | { kind: 'key'; key: HelpKey; at: number; column: number }
  /** A mark Help lists, at cell `at`, its words starting at cell `textAt`, where the keys' words start. */
  | { kind: 'legend'; entry: LegendEntry; at: number; textAt: number }

export const blankLine = (id: string): Line => ({
  id,
  depth: 0,
  lead: { text: '', tone: null },
  mark: null,
  title: '',
  titleTone: null,
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
  earlierOf: null,
  body: null,
  isStatic: false,
  isWaiting: true,
  isDetailShown: false,
  isFolded: false,
  isTabButtons: false,
})

function feedbackToneOf(f: Feedback): Tone | null {
  const tone = feedbackTone(f)

  return tone === 'muted' ? null : tone
}

function answerRowOf(row: RowView, isAllShown: boolean): { answerRow?: AnswerRow } {
  const { answerRow } = rowKeyPlan(row, isAllShown)

  return answerRow ? { answerRow } : {}
}

function rowButtons(row: RowView, isAllShown: boolean): Button[] {
  const { options, keys, more } = rowKeyPlan(row, isAllShown)
  const recommended = row.item?.rec
  const answers = options.map((o): Button => ({
    label: o.action.label,
    key: o.hotkey ?? null,
    press: o.action.press,
    isRecommended: o.action.press.option === recommended,
    isFollowUp: false,
    kind: o.action.kind,
    isOut: o.action.isOut,
    option: { note: o.note },
  }))

  return [
    ...answers,
    ...[...keys, ...more].flatMap((k): Button[] => {
      if (k.slot === 'allOptions')
        return [
          {
            label: k.label,
            key: null,
            press: { action: 'all-options', id: row.id },
            isRecommended: false,
            isFollowUp: false,
            isQuiet: true,
          },
        ]
      if (k.slot === 'retry')
        return [{ label: k.label, key: null, press: k.press, isRecommended: false, isFollowUp: false, kind: k.kind }]
      const { press } = k.action
      const key = k.hotkey ?? null

      return [
        {
          label: k.action.label,
          key,
          press,
          isRecommended: false,
          isFollowUp: k.slot === 'action' && k.action.isFollowUp,
          kind: k.action.kind,
          isOut: k.action.isOut,
        },
      ]
    }),
  ]
}

export function prButtons(actions: PrAction[]): Button[] {
  return actions.map(a => ({
    label: a.label,
    key: a.hotkey ?? null,
    press: a.press,
    isRecommended: false,
    isFollowUp: a.isFollowUp === true,
    kind: a.kind,
    isOut: a.isOut,
  }))
}

function lineOfRow(row: RowView, isAllShown: boolean): Line {
  const feedbackLabel = rowFeedbackText(row, AGENT)
  const f = row.feedback
  const state = row.state
  const undo = row.actions.find(a => a.press.action === 'undo')
  const waitsMark = state.is === 'open' ? openMark(row) : null

  return {
    ...blankLine(row.id),
    lead: row.type === 'finding' ? null : { text: waitsMark?.text ?? '', tone: waitsMark?.tone ?? null },
    mark: rowResultMark(row),
    title: rowTitle(row, AGENT),
    isDim: state.is === 'settled',
    age: rowAgeAt(f, row.at),
    detail: row.detail,
    file: row.fileName,
    feedback: feedbackLabel && f ? { text: feedbackLabel, tone: feedbackToneOf(f), source: f } : null,
    settled:
      state.is === 'settled'
        ? {
            label: settledLabel(state.label, state.delivery, state.reply),
            tone: settledTone(state),
            tint: closedTitleTone(state) === 'muted' ? null : closedTitleTone(state),
            undo: undo ? undo.press : null,
            at: state.at,
          }
        : null,
    buttons: state.is === 'settled' ? [] : rowButtons(row, isAllShown),
    ...answerRowOf(row, isAllShown),
    row,
    isWaiting: isWaitingRow(row),
    isFolded: state.is === 'handedOff',
  }
}

/** `isRowLed`: the group's rows draw a lead before their titles, as asks do and findings do not. */
export type Group = {
  kind: FoldKind
  title: string
  mark?: Lead
  isRowLed: boolean
  rows: RowView[]
  closed: ClosedLineView[]
}

const settledIn = (g: Group) => new Set(g.rows.filter(r => r.state.is === 'settled').map(r => r.id))
export const isGroupEmpty = (g: Group) => g.rows.length === 0 && closedTotal(g.closed, settledIn(g)) === 0

const closedId = (id: string) => `closed ${id}`
const foldId = (kind: FoldKind) => `fold ${kind}`

function closedLines(d: ClosedLineView): Line {
  const { action } = d
  const buttons: Button[] = action
    ? [{ label: action.label, key: null, press: action.press, isRecommended: false, isFollowUp: false }]
    : []

  return {
    ...blankLine(closedId(d.id)),
    depth: 1,
    lead: null,
    mark: d.mark,
    title: d.title,
    isDim: true,
    age: d.at,
    feedback: { text: d.outcome, tone: null, source: null },
    buttons,
    isStatic: buttons.length === 0,
    isWaiting: false,
  }
}

/** `entries`' rows hung on their group's tree, each on an arm, the last on └─. */
export function onTree(entries: Entry[]): Entry[] {
  const last = entries.findLastIndex(e => e.kind === 'row')

  return entries.map((e, n) =>
    e.kind === 'row' ? { ...e, line: { ...e.line, tree: n === last ? 'last' : 'mid' } } : e,
  )
}

export function groupEntries(
  g: Group,
  { unfolded, closedAll, optionsShown }: Pick<PanelUi, 'unfolded' | 'closedAll' | 'optionsShown'>,
): Entry[] {
  const settled = settledIn(g)
  const total = closedTotal(g.closed, settled)
  const out: Entry[] = [
    { kind: 'heading', text: g.title, count: waitingCount(g.rows), ...(g.mark ? { mark: g.mark } : {}) },
  ]
  out.push(
    ...onTree(g.rows.map((row): Entry => ({ kind: 'row', line: lineOfRow(row, optionsShown.includes(row.id)) }))),
  )
  if (g.rows.length === 0) out.push({ kind: 'note', text: groupEmptyText(g.title), indent: 4 })
  if (total === 0) return out
  const isUnfolded = unfolded.includes(g.kind)
  out.push({
    kind: 'row',
    line: {
      ...blankLine(foldId(g.kind)),
      tree: 'off',
      lead: g.isRowLed ? { text: '', tone: null } : null,
      title: `${foldLabel(total)} ${foldGlyph(isUnfolded)}`,
      isDim: true,
      fold: g.kind,
      isWaiting: false,
    },
  })
  if (!isUnfolded) return out
  const shown = closedShown(g.closed, settled, closedAll.includes(g.kind))
  out.push(...shown.map((d): Entry => ({ kind: 'row', line: { ...closedLines(d), tree: 'off' } })))
  const earlier = earlierLabel(total, shown.length)
  if (earlier)
    out.push({
      kind: 'row',
      line: {
        ...blankLine(`earlier ${g.kind}`),
        depth: 1,
        tree: 'off',
        title: earlier,
        isDim: true,
        earlierOf: g.kind,
        isWaiting: false,
      },
    })

  return out
}

export function pressFeedback(screen: PanelScreen, id: string, now: number, isMarkDone = false): Line['feedback'] {
  const f = feedbackOf(id, screen.view.lastActions[id], undefined, screen.view.turns, now)

  return f ? { text: markedFeedbackText(f, isMarkDone, AGENT), tone: feedbackToneOf(f), source: f } : null
}

export const doneAt = (f: Line['feedback']): number | null => (f?.source?.is === 'done' ? f.source.at : null)

export const linesOf = (entries: Entry[]): Line[] => entries.flatMap(e => (e.kind === 'row' ? [e.line] : []))
export const waitsOf = (lines: Line[]) =>
  lines.map(l => ({ id: l.id, isWaiting: isSelectable(l) && l.isWaiting, isCollapsed: l.isCollapsed === true }))
export const isSelectable = (line: Line) => line.settled === null && !line.isStatic
/** A folded line the person has not opened: it draws one line and takes only Enter. */
export const isShut = (line: Line, ui: Pick<PanelUi, 'opened'>) => line.isFolded && ui.opened !== line.id

function defaultFocus(line: Line): number {
  return Math.max(
    0,
    line.buttons.findIndex(b => b.isRecommended),
  )
}

export function focusOf(line: Line, ui: PanelUi): number {
  if (ui.focus?.rowId !== line.id) return defaultFocus(line)
  const { index, press } = ui.focus
  if (!press) return Math.min(index, line.buttons.length - 1)
  const kept = line.buttons.findIndex(b => JSON.stringify(b.press) === JSON.stringify(press))

  return kept >= 0 ? kept : defaultFocus(line)
}

export const pageFocus = (target: StatusKeyTarget, ui: PanelUi): number =>
  ui.focus?.rowId === target.id ? Math.min(ui.focus.index, target.keys.length - 1) : 0

const isSentPress = (p: PanelPress): p is RowPress | PrPress =>
  p.action !== 'resume' && p.action !== 'herdr-ask' && p.action !== 'all-options'

/** The opens, copies and reads a press on `line` runs first, which its row reads while they are under way. */
function pressEffects(screen: PanelScreen, line: Line, press: RowPress | PrPress, kind: PressKind | null): Effect[] {
  if (!isPrPress(press)) return kind === 'local' && line.row ? localEffects(line.row, press) : []
  const pr = 'ref' in press ? screen.view.prs.drawn.find(d => d.pr.ref === press.ref)?.pr : undefined
  const effect = prPressEffect(pr ?? null, press)

  return effect ? [effect] : []
}

/**
 * `line` while a press on it is out that the view does not show yet, so the key shows its press in its own draw: the
 * buttons of the press's action draw out, the age reads `SENDING`, and the status reads what `unshownPressFeedback`
 * gives. A line of the PRs tab's own buttons has no age. A settled line's Undo reads `SENDING` in its age's place, and
 * a button with no plan kind, as a Closed line's Undo, keeps the line's status.
 */
export function withUnshownPress(line: Line, screen: PanelScreen, ui: PanelUi): Line {
  const outOf = (p: PanelPress | null | undefined) => {
    if (!p || !isSentPress(p)) return null
    const out = unshownPressOut(ui.pressesOut, screen.view, pressRowId(p))
    return out && actionId(p) === out.action ? out : null
  }
  if (line.settled) return outOf(line.settled.undo) ? { ...line, isSending: true } : line
  const pressed = line.buttons.find(b => outOf(b.press))
  const out = outOf(pressed?.press)
  if (!pressed || !out || !isSentPress(pressed.press)) return line
  const kind = pressed.kind ?? null
  const effects = pressEffects(screen, line, pressed.press, kind)
  const f = pressed.kind === undefined ? null : unshownPressFeedback(kind, effects, out.at)

  return {
    ...line,
    buttons: line.buttons.map(b => (outOf(b.press) ? { ...b, isOut: true } : b)),
    isSending: !line.isTabButtons,
    ...(f ? { feedback: { text: markedFeedbackText(f, false, AGENT), tone: feedbackToneOf(f), source: f } } : {}),
  }
}
