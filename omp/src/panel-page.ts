import { cellWidth, cutForEllipsis } from '../../hooks/text'
import {
  statusKeyPlan,
  mergedLine,
  nameBeforeStall,
  STATUS_TEXT_LINES,
  STALL_GAP,
  WAS_PREFIX,
  LOOK_DASH,
} from '../../hooks/view'
import type { StatusBranch, StatusRow, StatusStall } from '../../hooks/view'
import { faceLines, feedbackPaint, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import { PAGE_CHILD_AT, PAGE_MARK_AT, PAGE_TEXT_AT } from './panel-entries'
import { pageFocus } from './panel-keys'
import type { ButtonFace } from './panel-lines'
import { indented, wrapText } from './panel-text'
import type { Style } from './panel'

const TREE_ARMS: Record<StatusBranch, { first: string; rest: string }> = {
  mid: { first: '├─', rest: '│' },
  last: { first: '└─', rest: ' ' },
}

/** The room for a Status text after a mark at `indent`. */
const pageRoom = (indent: number, width: number) => Math.max(10, width - indent - 2 - 1)

/** `text` wrapped to `room` cells, at most `maxLines` lines and cut with an ellipsis past them, each line painted. */
function pageText(text: string, room: number, maxLines: number, paint: (t: string) => string): string[] {
  const wrapped = wrapText(text, room)
  const lines = wrapped.slice(0, maxLines)
  if (wrapped.length > lines.length)
    lines[lines.length - 1] = `${cutForEllipsis(lines.at(-1)!, t => cellWidth(t) <= room)}…`

  return lines.map(paint)
}

/** Stands in for each space that joins a name's last word, `STALL_GAP` and the stall word, so a wrap never splits them. */
const GLUE = '\uE000'

/**
 * One row of the Status's list: a mark and its name wrapped after it, with its stall word after `STALL_GAP` in the
 * stall's tone on the line of the name's last word. Then where it stands, dim.
 */
function pageLine(
  d: Draw,
  indent: number,
  mark: string,
  name: string,
  namePaint: (t: string) => string,
  { stall = null, text = null }: { stall?: StatusStall | null; text?: string | null } = {},
): string[] {
  const { width, style: s } = d
  const textAt = indent + 2
  const room = pageRoom(indent, width)
  const names = stall
    ? stalledName(name, stall, room, namePaint, s)
    : pageText(name, room, STATUS_TEXT_LINES, namePaint)
  const seconds = text ? pageText(text, room, STATUS_TEXT_LINES, s.dim) : []

  return [
    `${' '.repeat(indent)}${mark} ${names[0] ?? ''}`,
    ...[...names.slice(1), ...seconds].map(l => ' '.repeat(textAt) + l),
  ]
}

/** A name and its stall word wrapped to `room` cells, the name cut by `nameBeforeStall`, each part painted. */
function stalledName(
  name: string,
  stall: StatusStall,
  room: number,
  namePaint: (t: string) => string,
  s: Style,
): string[] {
  const tail = `${STALL_GAP}${stall.text}`.replaceAll(' ', GLUE)
  const wrapped = (shown: string) => wrapText(`${shown}${tail}`, room)
  const lines = wrapped(nameBeforeStall(name, shown => wrapped(shown).length <= STATUS_TEXT_LINES))
  const words = s.tone(stall.tone, stall.text)

  return lines.map(l =>
    l.endsWith(tail)
      ? namePaint(l.slice(0, -tail.length)) + s.dim(STALL_GAP) + words
      : namePaint(l.replaceAll(GLUE, ' ')),
  )
}

/** A row's lines with the tree line at `PAGE_MARK_AT`: `first` on its first line when given, and `rest` on each line after. */
function withTree(lines: string[], first: string | null, rest: string, s: Style): string[] {
  const drawn = (line: string, glyph: string) =>
    glyph.trim() === '' ? line : line.slice(0, PAGE_MARK_AT) + s.dim(glyph) + line.slice(PAGE_MARK_AT + glyph.length)

  return lines.map((l, n) => (n === 0 ? (first ? drawn(l, first) : l) : drawn(l, rest)))
}

/** The cells a Status rule spans: from the text column to the end of the row. */
function pageRuleCells(width: number): number {
  return Math.max(0, width - PAGE_TEXT_AT - 1)
}

/** The rule above a Status row that starts an item. */
export function pageRule(width: number, s: Style): string {
  return `${' '.repeat(PAGE_TEXT_AT)}${s.dim('─'.repeat(pageRuleCells(width)))}`
}

/**
 * The look line: "Last seen" in the middle of a dashed rule that spans what `pageRule` spans, with a blank line above
 * it, and below it unless it ends the list.
 */
function lookLines(row: StatusRow & { kind: 'look' }, width: number, s: Style): string[] {
  const text = ` ${row.text} `
  const fill = Math.max(4, pageRuleCells(width) - cellWidth(text))
  const before = Math.floor(fill / 2)
  const rule = `${' '.repeat(PAGE_TEXT_AT)}${s.dim(`${LOOK_DASH.repeat(before)}${text}${LOOK_DASH.repeat(fill - before)}`)}`

  return ['', rule, ...(row.isLast ? [] : [''])]
}

/** A line on the Status page, laid out as the shared row says. */
/**
 * A Status row's buttons from its plan, under its text. The selected row's focused button takes Enter, and its other
 * buttons their keys, so only that row draws them focused or with keys.
 */
function pageButtonLines(row: StatusRow, d: Draw, isSelected: boolean): string[] {
  const faces = statusKeyPlan(row).map((k): ButtonFace => ({
    label: k.label,
    key: isSelected ? k.hotkey : null,
    isRecommended: false,
    isFollowUp: false,
  }))
  const focused = isSelected ? pageFocus(row, d.ui) : -1

  return faces.length > 0 ? faceLines(faces, focused, PAGE_TEXT_AT - 1, d.width, d.style) : []
}

export function drawPageRow(row: StatusRow, d: Draw, isSelected = false): string[] {
  const { width, now, style: s } = d
  if (row.kind === 'subject') {
    const mark = paintMark(row, now, s)
    const out = pageLine(d, PAGE_MARK_AT, mark, row.name, t => t, { stall: row.stall, text: row.text })
    const room = pageRoom(PAGE_MARK_AT, width)
    if (row.merged)
      out.push(
        ...indented(
          mergedLine(row.merged, t => cellWidth(t) <= room),
          PAGE_TEXT_AT,
          width,
          STATUS_TEXT_LINES,
          s.dim,
        ),
      )
    if (row.was) out.push(...indented(`${WAS_PREFIX}${row.was}`, PAGE_TEXT_AT, width, STATUS_TEXT_LINES, s.dim))
    out.push(...pageButtonLines(row, d, isSelected))

    return row.hasChildren ? withTree(out, null, '│', s) : out
  }
  if (row.kind === 'child') {
    const mark = paintMark(row, now, s)
    const out = pageLine(d, row.branch ? PAGE_CHILD_AT : PAGE_MARK_AT, mark, row.name, s.dim, { stall: row.stall })

    return row.branch ? withTree(out, TREE_ARMS[row.branch].first, TREE_ARMS[row.branch].rest, s) : out
  }
  if (row.kind === 'more') {
    const arm = TREE_ARMS[row.branch]

    return withTree([' '.repeat(PAGE_CHILD_AT + 2) + s.dim(row.text)], arm.first, arm.rest, s)
  }
  if (row.kind === 'look') return lookLines(row, width, s)
  return pageLine(d, PAGE_MARK_AT, feedbackPaint(row.tone, s)(row.mark), row.text, s.dim)
}
