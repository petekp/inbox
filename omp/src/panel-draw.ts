import type { BannerTone } from '../../hooks/tones'
import { ago, cellWidth } from '../../hooks/text'
import { actionLabel, replyHint } from '../../hooks/rows'
import { actionLines } from '../../hooks/action-plan'
import { isStatusUnderActions } from '../../hooks/feedback'
import { resultGlyph, runningMark } from '../../hooks/timing'
import { closedTitleClock, newRowIn, steppedTitleTint } from '../../hooks/arrivals'
import { UNDO_KEY } from '../../hooks/help'
import { textMark } from '../../hooks/marks'
import { COLLAPSED_TITLE_LINES } from '../../hooks/row-parts'
import type { BannerView } from '../../hooks/banners'
import type { ResultMark } from '../../hooks/rows'
import { askTreeLines } from './panel-ask-tree'
import { focusOf } from './panel-keys'
import { AGENT, LEAD_CELLS, isShut } from './panel-lines'
import type { ButtonFace, Lead, Line } from './panel-lines'
import { cutTitle, fit, indented, spread, titleLines, visibleLength, wrapText } from './panel-text'
import type { PanelScreen, PanelUi, Style, Tone } from './panel'

/** The tint a row's title, lead and mark take, at its strength now. */
type Tint = { tone: 'key' | 'done' | 'muted' | 'error'; share: number }

export type Draw = { screen: PanelScreen; ui: PanelUi; width: number; now: number; style: Style }

/** `inner` in a rounded box in the tone, filled with its tint. Each inner line fits `width - 4` cells. */
export function boxed(inner: string[], tone: BannerTone, width: number, s: Style): string[] {
  const room = width - 4
  const fill = (l: string) => s.banner(tone, 'fill', ` ${l}${' '.repeat(Math.max(0, room - visibleLength(l)))} `)
  const side = s.banner(tone, 'line', '│')

  return [
    s.banner(tone, 'line', `╭${'─'.repeat(width - 2)}╮`),
    ...inner.map(l => `${side}${fill(l)}${side}`),
    s.banner(tone, 'line', `╰${'─'.repeat(width - 2)}╯`),
  ]
}

/** The most lines a selected review thread's comment takes. */
const BODY_LINES = 8

const LEAD_TONES: Record<BannerTone, Tone> = { error: 'error', warning: 'needsYou', notice: 'key', ask: 'key' }

/** A banner's lines: its lead in bold, in the tone's color, then its body, wrapped inside the box. */
export function bannerLines(b: BannerView, width: number, s: Style): string[] {
  const text = b.body ? `${b.lead} ${b.body}` : b.lead
  const lead = (w: string) => s.tone(LEAD_TONES[b.tone], s.bold(w))
  let leadWords = b.lead.split(/\s+/).length
  const lines = wrapText(text, width - 4).map(line =>
    line
      .split(' ')
      .map(w => (leadWords-- > 0 ? lead(w) : w))
      .join(' '),
  )

  return boxed(lines, b.tone, width, s)
}

/** Cells an unfocused button's label starts in from its cell's edge: a space, then its key and a space if it has one. */
const buttonLabelCells = (b: ButtonFace) => (b.key ? b.key.length + 2 : 1)

function buttonCell(b: ButtonFace, isFocused: boolean, s: Style, mark = ''): string {
  return buttonCellLines(b, isFocused, s, mark, Infinity)[0]!
}

/** A button's cell as lines no wider than `room`. A label too long for one line wraps, each line after the first starting under the first. */
function buttonCellLines(b: ButtonFace, isFocused: boolean, s: Style, mark: string, room: number): string[] {
  const head = isFocused ? ' ↵ ' : b.key ? ` ${b.key} ` : ' '
  const isQuiet = !isFocused && (b.isFollowUp || b.isQuiet)
  const text = isQuiet ? b.label : `${b.label}${mark}`
  const labelRoom = room - head.length - 1
  const lines = cellWidth(text) <= labelRoom ? [text] : wrapText(text, Math.max(1, labelRoom))
  const widest = Math.max(...lines.map(cellWidth))

  return lines.map((l, n) => {
    const lead = n === 0 ? head : ' '.repeat(head.length)
    const padded = `${l}${' '.repeat(widest - cellWidth(l))} `
    if (isFocused) return s.inverse(b.isOut ? s.dim(lead + padded) : s.bold(lead + padded))
    if (isQuiet || b.isOut) return s.dim(lead + padded)
    const markPart = n === lines.length - 1 && mark && l.endsWith(mark.trim()) ? mark.trim() : ''
    const labelPart = l.slice(0, l.length - markPart.length).trimEnd()
    const label = (b.isRecommended ? s.underline(labelPart) : labelPart) + l.slice(labelPart.length)
    const key = n === 0 && b.key ? ` ${s.bold(b.key)} ` : lead

    return `${key}${label}${' '.repeat(widest - cellWidth(l))} `
  })
}

/** What `actionLabel` adds to the label, measured on the focused cell, the widest form, alone on a line. */
function labelMark(b: ButtonFace, room: number, s: Style): string {
  const fits = (label: string) => visibleLength(buttonCell({ ...b, label }, true, s)) <= room

  return actionLabel({ label: b.label, isPrimary: b.isRecommended }, fits).slice(b.label.length)
}

/** The buttons under the tree: all but the answers, which the tree draws. */
function buttonLines(line: Line, ui: PanelUi, indent: number, width: number, s: Style): string[] {
  const answers = line.buttons.filter(b => b.option).length
  const focused = focusOf(line, ui)

  return faceLines(line.buttons.slice(answers), focused < answers ? -1 : focused - answers, indent, width, s)
}

/** Buttons laid out in lines from `indent`, the one at `focused` drawn focused. -1 focuses none. */
export function faceLines(
  buttons: ButtonFace[],
  focused: number,
  indent: number,
  width: number,
  s: Style,
  between = '',
): string[] {
  const room = width - indent
  const cells = buttons.map((b, i) => buttonCellLines(b, i === focused, s, labelMark(b, Infinity, s), room))
  const sizes = cells.map(c => (c.length > 1 ? room : visibleLength(c[0]!)))
  const firstFollowUp = buttons.findIndex(b => b.isFollowUp)
  const keyCount = firstFollowUp < 0 ? cells.length : firstFollowUp
  const { lines } = actionLines(sizes.slice(0, keyCount), sizes.slice(keyCount), {
    width: room,
    gap: visibleLength(between),
    separator: 0,
  })

  return lines.flatMap(at =>
    at.length === 1 && cells[at[0]!]!.length > 1
      ? cells[at[0]!]!.map(l => ' '.repeat(indent) + l)
      : [' '.repeat(indent) + at.map(i => cells[i]![0]).join(between)],
  )
}

/** `text` in a lead's tone. */
export function leadPaint(lead: Lead, text: string, s: Style): string {
  return lead.tone === 'dim' ? s.dim(text) : lead.tone ? s.tone(lead.tone, text) : text
}

/** A lead and the space after it, or nothing for a line with no lead. */
function leadText(lead: Lead | null, s: Style, tint?: Tint): string {
  if (lead === null) return ''
  const text = lead.text.padEnd(2)

  return `${tint ? s.tint(tint.tone, tint.share, text, lead.tone) : leadPaint(lead, text, s)} `
}

/** A result mark and the space after it. */
function markText(mark: ResultMark | null, now: number, s: Style, tint?: Tint): string {
  if (mark === null) return ''
  if (tint) return `${s.tint(tint.tone, tint.share, resultGlyph(mark, now), mark.tone ?? 'dim')} `

  return `${feedbackPaint(mark.tone ?? null, s)(resultGlyph(mark, now))} `
}

export function feedbackPaint(tone: Tone | null, s: Style) {
  return (text: string) => (tone ? s.tone(tone, text) : s.dim(text))
}

/** A Status row's or legend entry's mark. A running mark draws the frame at `now`. */
export function paintMark(m: { mark: string; tone: Tone | null; isRunning: boolean }, now: number, s: Style): string {
  return feedbackPaint(m.tone, s)(m.isRunning ? runningMark(now) : textMark(m.mark))
}

/** A collapsed row's feedback whole on its own lines at `indent`, its mark leading the first. */
function wholeStatus(line: Line, mark: string, indent: number, room: number, s: Style): string[] {
  if (!line.feedback) return []
  const markCells = visibleLength(mark)
  const paint = feedbackPaint(line.feedback.tone, s)

  return wrapText(line.feedback.text, Math.max(10, room - indent - markCells - 1)).map(
    (l, n) => ' '.repeat(indent) + (n === 0 ? mark : ' '.repeat(markCells)) + paint(l),
  )
}

export function drawLine(line: Line, isSelected: boolean, d: Draw): string[] {
  const { ui, width, now, style: s } = d
  if (line.isTabButtons) {
    const cursor = isSelected ? s.tone('accent', '❯') : ' '
    const cells = line.buttons.map((b, i) => buttonCell(b, isSelected && i === focusOf(line, ui), s))
    const title = line.title ? `${line.title}  ` : ''
    const head = ` ${cursor} `
    const buttons = `${head}${title}${cells.join('')}`
    const status = line.feedback ? `  ${feedbackPaint(line.feedback.tone, s)(line.feedback.text)}` : ''
    if (!status) return [fit(buttons, width)]
    const together = `${buttons}${status}`

    return visibleLength(together) <= width
      ? [together]
      : [fit(buttons, width), fit(`${' '.repeat(visibleLength(head))}${status}`, width)]
  }
  const isOpen = isSelected && line.isCollapsed !== true
  const isOnTree = line.tree === 'mid' || line.tree === 'last'
  const pad = isOnTree ? 0 : line.depth * 2
  const status = line.status
    ? `  ${line.status.tone ? s.tone(line.status.tone, line.status.text) : s.dim(line.status.text)}${s.dim(line.status.rest)}`
    : ''
  const statusUnder =
    line.feedback && line.settled === null && !isShut(line, ui) && isStatusUnderActions(line.feedback.source, isOpen)
      ? line.feedback
      : null
  const clock = line.settled
    ? closedTitleClock(ui.closedSeen, line.id, line.settled.at, now)
    : line.isPrHead
      ? undefined
      : newRowIn(ui.newRows, line.id, ui.tab)
  const tintTone = line.settled ? line.settled.tint : 'key'
  const tintShare = steppedTitleTint(clock, now)
  const tint: Tint | undefined = tintTone && tintShare > 0 ? { tone: tintTone, share: tintShare } : undefined
  const mark = markText(line.mark, now, s, line.settled ? tint : undefined)
  const after = line.settled
    ? `  ${mark}${line.settled.tone === 'done' ? s.tone('done', line.settled.label) : s.dim(line.settled.label)}${line.settled.undo ? `  ${s.dim(`${UNDO_KEY} Undo`)}` : ''}`
    : line.feedback && !statusUnder
      ? `  ${mark}${feedbackPaint(line.feedback.tone, s)(line.feedback.text)}`
      : ''
  // omp marks a selected item with ❯, its `nav.cursor` symbol, and draws a fold's chevron as › and v.
  const cursor = isSelected ? s.tone('accent', '❯') : ' '
  // A row on its group's tree puts its arm under the heading's mark, in the column the cursor takes on other lines, so
  // its cursor moves one cell left. The group's other lines move one cell right, to keep their place under its titles.
  const lead = leadText(line.lead, s, tint)
  const head = isOnTree
    ? `${cursor}${s.dim(line.tree === 'mid' ? '├─' : '└─')} ${lead}`
    : `${line.tree === 'off' ? ' ' : ''} ${' '.repeat(pad)}${cursor} ${lead}`
  const age = line.age !== null && line.settled === null ? s.dim(ago(now - line.age)) : ''
  const besideAge = age ? width - visibleLength(`  ${age} `) : width
  const paintTitle = (text: string) => {
    const own = line.isDim
      ? s.dim(text)
      : line.titleTone
        ? s.tone(line.titleTone, s.bold(text))
        : isOpen
          ? s.bold(text)
          : text
    return tint ? s.tint(tint.tone, tint.share, own) : own
  }
  // The lines under a row on the tree draw in the room right of its trunk, or of the space left of a last row's arm.
  const gutter = line.tree === 'mid' ? ` ${s.dim('│')} ` : line.tree === 'last' ? '   ' : ''
  const room = width - visibleLength(gutter)
  const leadAt = (isOnTree ? 4 : line.tree === 'off' ? 4 + pad : 3 + pad) - visibleLength(gutter)
  const indent = leadAt + (line.lead === null ? 0 : LEAD_CELLS)
  const titleRoom = besideAge - visibleLength(head)
  const isRowLine = line.row !== null && !isOpen && line.settled === null && status === ''
  const wrapped =
    isRowLine && cellWidth(line.title) + visibleLength(after) > titleRoom
      ? titleLines(line.title, titleRoom, room - indent - 1, COLLAPSED_TITLE_LINES)
      : null
  const shownTitle = line.mark
    ? cutTitle(line.title, titleRoom - visibleLength(status) - visibleLength(after))
    : line.title
  const first = wrapped
    ? spread(`${head}${paintTitle(wrapped[0]!)}`, `${age} `, width)
    : spread(fit(`${head}${paintTitle(shownTitle)}${status}${after}`, besideAge), `${age} `, width)
  const underTitle = wrapped
    ? [...wrapped.slice(1).map(t => ' '.repeat(indent) + paintTitle(t)), ...wholeStatus(line, mark, indent, room, s)]
    : []
  const lines = (rest: string[]) => [first, ...[...underTitle, ...rest].map(l => gutter + l)]
  if (line.settled || isShut(line, ui)) return lines([])
  const out: string[] = []
  const holdsUp = line.row?.holdsUpLine
  const focused = ui.typing === line.id ? -1 : focusOf(line, ui)
  const answerCell = (b: ButtonFace, n: number, cellRoom: number) =>
    buttonCellLines(b, n === focused, s, labelMark(b, Infinity, s), cellRoom)
  const tree = isOpen ? askTreeLines(line, leadAt, room, s, answerCell, buttonLabelCells) : []
  if (tree.length > 0) out.push(...tree)
  else if (holdsUp) out.push(fit(`${' '.repeat(indent)}${s.dim(holdsUp)}`, room))
  if (line.body && isOpen) out.push(...indented(line.body, indent, room, BODY_LINES, t => t))
  if (line.detail && (isOpen || line.isDetailShown)) out.push(...indented(line.detail, indent, room, 4, s.dim))
  if (!isOpen) return lines(out)
  if (line.file) out.push(' '.repeat(indent) + s.tone('accent', line.file))
  // As in the terminal, an open reply field replaces the row's buttons: Enter sends, so no button reads as focused.
  if (line.buttons.some(b => !b.option) && ui.typing !== line.id)
    out.push(...buttonLines(line, ui, indent - 1, room, s))
  if (ui.typing === line.id) {
    const hint = line.row ? replyHint(line.row, AGENT) : 'Your reply'
    const text = ui.drafts[line.id]?.text ?? ''
    out.push(' '.repeat(indent) + s.dim(`${hint}:`))
    const field = wrapText(`${text}\u0000`, Math.max(10, room - indent - 1))
    out.push(...field.map(l => ' '.repeat(indent) + l.replace('\u0000', s.inverse(' '))))
  }
  if (statusUnder) {
    const markCells = mark ? 2 : 0
    const [top, ...under] = indented(statusUnder.text, indent + markCells, room, 4, feedbackPaint(statusUnder.tone, s))
    if (top !== undefined) out.push(' '.repeat(indent) + mark + top.slice(indent + markCells), ...under)
  }

  return lines(out)
}
