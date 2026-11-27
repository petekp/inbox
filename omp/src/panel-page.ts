import { cellWidth, cutForEllipsis } from '../../core/domain/text'
import { statusKeyPlan } from '../../core/view/status-keys'
import type { StatusKeyTarget } from '../../core/view/status-keys'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../core/view/status-page'
import { mergedLine, nameBeforeStall, nameLevelOf, STALL_GAP } from '../../core/view/status-page-parts'
import type { StatusBranch, StatusRow, StatusStall } from '../../core/view/status-page'
import { faceLines, feedbackPaint, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import { pageFocus } from './panel-lines'
import type { ButtonFace } from './panel-lines'
import { collapsedIn, indented, wrapText } from './panel-text'
import { foldGlyph } from '../../core/view/fold-chevron'
import { COUNTS_LABEL, hasTreeDown, isParentCollapsed, parentChevron } from '../../core/view/status-folds'
import type { Style } from './panel'

/** Where a Status row's mark sits: in the head's column, so the list lines up with it. A subject's text starts at `PAGE_TEXT_AT`. */
export const PAGE_MARK_AT = 1
export const PAGE_TEXT_AT = PAGE_MARK_AT + 2
/** Where the mark of a child under a subject sits: after the tree's arm, which starts under the subject's mark. */
const PAGE_CHILD_AT = PAGE_MARK_AT + 3

const TREE_ARMS: Record<StatusBranch, { first: string; rest: string }> = {
  mid: { first: '├─', rest: '│' },
  last: { first: '└─', rest: ' ' },
}

/** The room for a Status text after a mark at `indent`. */
export const pageRoom = (indent: number, width: number) => Math.max(10, width - indent - 2 - 1)

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
 * muted on the line of the name's last word, then a parent's fold chevron. Then where it stands, dim.
 */
export function pageLine(
  d: Draw,
  indent: number,
  mark: string,
  name: string,
  namePaint: (t: string) => string,
  {
    stall = null,
    text = null,
    chevron = null,
  }: {
    stall?: StatusStall | null
    text?: string | null
    chevron?: { text: string; paint: (t: string) => string } | null
  } = {},
): string[] {
  const { width, style: s } = d
  const textAt = indent + 2
  const full = pageRoom(indent, width)
  const room = chevron ? Math.max(10, full - cellWidth(chevron.text) - 1) : full
  const names = stall
    ? stalledName(name, stall, room, namePaint, s)
    : pageText(name, room, STATUS_TEXT_LINES, namePaint)
  if (chevron) names[Math.max(0, names.length - 1)] = `${names.at(-1) ?? ''} ${chevron.paint(chevron.text)}`
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
  const words = s.dim(stall.text)

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
export function pageRuleCells(width: number, textAt = PAGE_TEXT_AT): number {
  return Math.max(0, width - textAt - 1)
}

/**
 * A section's heading, such as Goal, Later or Other work: its name at `at`, the mark column, then a solid rule. With no
 * text, the rule alone.
 */
export function partHeading(text: string | null, width: number, s: Style, at = PAGE_MARK_AT, isTitle = false): string {
  const label = text === null ? '' : `${text} `
  const rule = '─'.repeat(Math.max(4, pageRuleCells(width, at) - cellWidth(label)))

  return `${' '.repeat(at)}${isTitle ? s.bold(label) + s.dim(rule) : s.dim(label + rule)}`
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
  between = '',
  focusAmong: StatusKeyTarget = target,
): string[] {
  const faces = target.keys.map((k): ButtonFace => ({
    label: k.label,
    key: isSelected ? k.hotkey : null,
    isRecommended: false,
    isFollowUp: false,
    ...(k.emphasis === 'quiet' ? { isQuiet: true } : {}),
  }))
  const focus = isSelected ? pageFocus(focusAmong, d.ui) : -1
  const focused = focus < target.keys.length ? focus : -1

  return faces.length > 0 ? faceLines(faces, focused, textAt - 1, d.width, d.style, between) : []
}

/** A parent's fold chevron, dim, or in the accent while its name is selected. */
export function foldChevron(
  p: { id: string; foldCount: number },
  d: Draw,
  isSelected: boolean,
): { text: string; paint: (t: string) => string } | null {
  if (p.foldCount === 0) return null
  const { screen, style: s } = d

  return {
    text: parentChevron(isParentCollapsed(p, collapsedIn(screen.view)), p.foldCount),
    paint: isSelected ? t => s.tone('accent', t) : s.dim,
  }
}

/** A line on the Status page, laid out as the shared row says. */
export function drawPageRow(row: StatusRow, d: Draw, isSelected = false): string[] {
  const { width, now, style: s } = d
  const at = markAt(row.depth)
  const textAt = at + PAGE_TEXT_AT - PAGE_MARK_AT
  if (row.kind === 'subject') {
    const mark = paintMark(row, now, s)
    const chevron = foldChevron(row, d, isSelected)
    const quiet = nameLevelOf(row, 'plain') === 'plain' ? (t: string) => t : s.dim
    const out = pageLine(d, at, mark, row.name, t => quiet(chevron && isSelected ? s.bold(t) : t), {
      stall: row.stall,
      text: row.text,
      chevron,
    })
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

    return hasTreeDown(row, collapsedIn(d.screen.view)) ? withTree(out, at, null, '│', s) : out
  }
  if (row.kind === 'ask') {
    const mark = paintMark({ ...row, isRunning: false }, now, s)
    const askAt = row.branch ? childAt(row.depth - 1) : at
    const out = [
      ...pageLine(d, askAt, mark, row.text, t => s.tone(row.tone, t)),
      ...pageButtonLines({ id: row.id, keys: statusKeyPlan(row) }, d, isSelected, askAt + PAGE_TEXT_AT - PAGE_MARK_AT),
    ]
    if (!row.branch) return out
    const arm = TREE_ARMS[row.branch]

    return withTree(out, markAt(row.depth - 1), arm.first, arm.rest, s)
  }
  if (row.kind === 'child') {
    const mark = paintMark(row, now, s)
    if (!row.branch) return pageLine(d, at, mark, row.name, s.dim, { text: row.text })
    const out = pageLine(d, childAt(row.depth - 1), mark, row.name, s.dim, { text: row.text })

    return withTree(out, markAt(row.depth - 1), TREE_ARMS[row.branch].first, TREE_ARMS[row.branch].rest, s)
  }
  if (row.kind === 'more') {
    if (!row.branch) return [' '.repeat(textAt) + s.dim(row.text)]
    const arm = TREE_ARMS[row.branch]
    const line = ' '.repeat(childAt(row.depth - 1) + 2) + s.dim(row.text)

    return withTree([line], markAt(row.depth - 1), arm.first, arm.rest, s)
  }
  if (row.kind === 'counts')
    return countsFoldLines(row.counts, d.ui.statusUnfolded.includes(row.id), isSelected, textAt, width, s)
  if (row.kind === 'done-fold') {
    const chevron = foldGlyph(d.ui.statusUnfolded.includes(row.id))

    return pageLine(d, at, ' ', row.text, isSelected ? s.bold : s.dim, {
      chevron: { text: chevron, paint: isSelected ? t => s.tone('accent', t) : s.dim },
    })
  }
  if (row.kind === 'part')
    return [
      '',
      partHeading(row.text, width, s, PAGE_MARK_AT, row.isTitle),
      ...(row.description ? indented(row.description, PAGE_MARK_AT, width, STATUS_TEXT_LINES, s.dim) : []),
    ]
  return pageLine(d, at, feedbackPaint(row.tone, s)(row.mark), row.text, s.dim)
}

/**
 * Other work's counts fold: its label, then each mark in its tone with its count, joined by `STALL_GAP`, then the
 * chevron. A count that does not fit starts the next line without the gap, so a count stays with its mark, and the
 * chevron stays with the last count.
 */
function countsFoldLines(
  counts: (StatusRow & { kind: 'counts' })['counts'],
  isUnfolded: boolean,
  isSelected: boolean,
  textAt: number,
  width: number,
  s: Style,
): string[] {
  const room = Math.max(1, width - textAt)
  const gap = { cells: cellWidth(STALL_GAP), text: s.dim(STALL_GAP) }
  const chevron = foldGlyph(isUnfolded)
  const parts = counts.map((c, n) => {
    const tail = n === counts.length - 1 ? ` ${chevron}` : ''
    const chevronPaint = isSelected ? s.tone('accent', tail) : s.dim(tail)

    return {
      cells: cellWidth(`${c.mark} ${c.text}${tail}`),
      text: feedbackPaint(c.tone, s)(c.mark) + s.dim(` ${c.text}`) + chevronPaint,
    }
  })
  const lines: { cells: number; text: string }[] = [
    { cells: cellWidth(COUNTS_LABEL), text: (isSelected ? s.bold : s.dim)(COUNTS_LABEL) },
  ]
  for (const [n, part] of parts.entries()) {
    const line = lines.at(-1)!
    const joiner = n === 0 ? { cells: 0, text: '' } : gap
    if (line.cells + joiner.cells + part.cells <= room) {
      line.cells += joiner.cells + part.cells
      line.text += joiner.text + part.text
    } else lines.push(part)
  }

  return lines.map(l => ' '.repeat(textAt) + l.text)
}
