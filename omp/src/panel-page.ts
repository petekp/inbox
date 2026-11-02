import { cellWidth, cutForEllipsis } from '../../hooks/text'
import { statusKeyPlan } from '../../hooks/status-keys'
import type { StatusKeyTarget } from '../../hooks/status-keys'
import {
  mergedLine,
  nameBeforeStall,
  STATUS_TEXT_LINES,
  STALL_GAP,
  WAS_PREFIX,
  LOOK_DASH,
} from '../../hooks/status-page'
import type { StatusBranch, StatusRow, StatusStall } from '../../hooks/status-page'
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
export const GLUE = '\uE000'

/**
 * One row of the Status's list: a mark and its name wrapped after it, with its stall word after `STALL_GAP` in the
 * stall's tone on the line of the name's last word. Then where it stands, dim.
 */
export function pageLine(
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

/**
 * Where a row `depth` steps in draws its mark. Each step is a mark and its space, so a row sits under the text of the
 * row it hangs from.
 */
const markAt = (depth: number) => PAGE_MARK_AT + (PAGE_TEXT_AT - PAGE_MARK_AT) * depth

/** Where a child under a subject at `depth` draws its mark: after the tree's arm, which starts under the subject's mark. */
const childAt = (subjectDepth: number) => markAt(subjectDepth) + (PAGE_CHILD_AT - PAGE_MARK_AT)

/**
 * A row's lines with the tree line at column `at`: `first` on its first line when given, and `rest` on each line
 * after.
 */
function withTree(lines: string[], at: number, first: string | null, rest: string, s: Style): string[] {
  const drawn = (line: string, glyph: string) =>
    glyph.trim() === '' ? line : line.slice(0, at) + s.dim(glyph) + line.slice(at + glyph.length)

  return lines.map((l, n) => (n === 0 ? (first ? drawn(l, first) : l) : drawn(l, rest)))
}

/** The cells a Status rule spans: from the text column to the end of the row. */
function pageRuleCells(width: number, textAt = PAGE_TEXT_AT): number {
  return Math.max(0, width - textAt - 1)
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
  const at = markAt(row.depth) + PAGE_TEXT_AT - PAGE_MARK_AT
  const fill = Math.max(4, pageRuleCells(width, at) - cellWidth(text))
  const before = Math.floor(fill / 2)
  const rule = `${' '.repeat(at)}${s.dim(`${LOOK_DASH.repeat(before)}${text}${LOOK_DASH.repeat(fill - before)}`)}`

  return ['', rule, ...(row.isLast ? [] : [''])]
}

/**
 * A Status target's buttons from its plan, with their text at `textAt`. The selected target's focused button takes
 * Enter, and its other buttons their keys, so only that target draws them focused or with keys.
 */
export function pageButtonLines(
  target: StatusKeyTarget,
  d: Draw,
  isSelected: boolean,
  textAt = PAGE_TEXT_AT,
): string[] {
  const faces = target.keys.map((k): ButtonFace => ({
    label: k.label,
    key: isSelected ? k.hotkey : null,
    isRecommended: false,
    isFollowUp: false,
    ...(k.emphasis === 'quiet' ? { isQuiet: true } : {}),
  }))
  const focused = isSelected ? pageFocus(target, d.ui) : -1

  return faces.length > 0 ? faceLines(faces, focused, textAt - 1, d.width, d.style) : []
}

/** A line on the Status page, laid out as the shared row says. */
export function drawPageRow(row: StatusRow, d: Draw, isSelected = false): string[] {
  const { width, now, style: s } = d
  const at = markAt(row.depth)
  const textAt = at + PAGE_TEXT_AT - PAGE_MARK_AT
  if (row.kind === 'subject') {
    const mark = paintMark(row, now, s)
    const out = pageLine(d, at, mark, row.name, t => t, { stall: row.stall, text: row.text })
    const room = pageRoom(at, width)
    if (row.merged)
      out.push(
        ...indented(
          mergedLine(row.merged, t => cellWidth(t) <= room),
          textAt,
          width,
          STATUS_TEXT_LINES,
          s.dim,
        ),
      )
    if (row.was) out.push(...indented(`${WAS_PREFIX}${row.was}`, textAt, width, STATUS_TEXT_LINES, s.dim))
    out.push(...pageButtonLines({ id: row.id, keys: statusKeyPlan(row) }, d, isSelected, textAt))

    return row.hasChildren ? withTree(out, at, null, '│', s) : out
  }
  if (row.kind === 'child') {
    const mark = paintMark(row, now, s)
    if (!row.branch) return pageLine(d, at, mark, row.name, s.dim, { stall: row.stall })
    const out = pageLine(d, childAt(row.depth - 1), mark, row.name, s.dim, { stall: row.stall })

    return withTree(out, markAt(row.depth - 1), TREE_ARMS[row.branch].first, TREE_ARMS[row.branch].rest, s)
  }
  if (row.kind === 'more') {
    const arm = TREE_ARMS[row.branch]
    const line = ' '.repeat(childAt(row.depth - 1) + 2) + s.dim(row.text)

    return withTree([line], markAt(row.depth - 1), arm.first, arm.rest, s)
  }
  if (row.kind === 'look') return lookLines(row, width, s)
  if (row.kind === 'part') {
    const label = `${row.text} `

    return [
      `${' '.repeat(PAGE_TEXT_AT)}${s.dim(label + '─'.repeat(Math.max(4, pageRuleCells(width) - cellWidth(label))))}`,
    ]
  }
  if (row.kind === 'counts')
    return [
      ' '.repeat(textAt) +
        row.counts.map(c => feedbackPaint(c.tone, s)(c.mark) + s.dim(` ${c.text}`)).join(s.dim(STALL_GAP)),
    ]
  return pageLine(d, at, feedbackPaint(row.tone, s)(row.mark), row.text, s.dim)
}
