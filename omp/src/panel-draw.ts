import type { BannerTone } from '../../hooks/tones'
import { ago } from '../../hooks/text'
import {
  actionLabel,
  actionLines,
  isStatusUnderActions,
  replyHint,
  resultGlyph,
  runningMark,
  HELD_MARK,
} from '../../hooks/view'
import type { BannerView, ResultMark } from '../../hooks/view'
import { focusOf } from './panel-keys'
import { AGENT, INDENT, UNLED_INDENT, isShut } from './panel-lines'
import type { ButtonFace, Lead, Line } from './panel-lines'
import { cutTitle, fit, indented, spread, visibleLength, wrapText } from './panel-text'
import type { PanelScreen, PanelUi, Style, Tone } from './panel'

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

const LEAD_TONES: Record<BannerTone, Tone | null> = { error: 'error', warning: 'needsYou', notice: null }

/** A banner's lines: its lead in bold, in the tone's color, then its body, wrapped inside the box. */
export function bannerLines(b: BannerView, width: number, s: Style): string[] {
  const text = b.body ? `${b.lead} ${b.body}` : b.lead
  const leadTone = LEAD_TONES[b.tone]
  const lead = (w: string) => (leadTone ? s.tone(leadTone, s.bold(w)) : s.bold(w))
  let leadWords = b.lead.split(/\s+/).length
  const lines = wrapText(text, width - 4).map(line =>
    line
      .split(' ')
      .map(w => (leadWords-- > 0 ? lead(w) : w))
      .join(' '),
  )

  return boxed(lines, b.tone, width, s)
}

function buttonCell(b: ButtonFace, isFocused: boolean, s: Style, mark = ''): string {
  if (isFocused) return s.inverse(b.isOut ? s.dim(` ↵ ${b.label}${mark} `) : s.bold(` ↵ ${b.label}${mark} `))
  if (b.isOut && !b.isFollowUp) return s.dim(b.key ? ` ${b.key} ${b.label}${mark} ` : ` ${b.label}${mark} `)
  if (b.isFollowUp) return s.dim(b.key ? ` ${b.key} ${b.label} ` : ` ${b.label} `)
  const label = (b.isRecommended ? s.underline(b.label) : b.label) + mark

  return b.key ? ` ${s.bold(b.key)} ${label} ` : ` ${label} `
}

/** What `actionLabel` adds to the label, measured on the focused cell, the widest form, alone on a line. */
function labelMark(b: ButtonFace, room: number, s: Style): string {
  const fits = (label: string) => visibleLength(buttonCell({ ...b, label }, true, s)) <= room

  return actionLabel({ label: b.label, isPrimary: b.isRecommended }, fits).slice(b.label.length)
}

function buttonLines(line: Line, ui: PanelUi, indent: number, width: number, s: Style): string[] {
  return faceLines(line.buttons, focusOf(line, ui), indent, width, s)
}

/** Buttons laid out in lines from `indent`, the one at `focused` drawn focused. -1 focuses none. */
export function faceLines(buttons: ButtonFace[], focused: number, indent: number, width: number, s: Style): string[] {
  const cells = buttons.map((b, i) => buttonCell(b, i === focused, s, labelMark(b, width - indent, s)))
  const sizes = cells.map(visibleLength)
  const firstFollowUp = buttons.findIndex(b => b.isFollowUp)
  const keyCount = firstFollowUp < 0 ? cells.length : firstFollowUp
  const { lines } = actionLines(sizes.slice(0, keyCount), sizes.slice(keyCount), {
    width: width - indent,
    gap: 0,
    separator: 0,
  })

  return lines.map(at => ' '.repeat(indent) + at.map(i => cells[i]).join(''))
}

/** A lead and the space after it, or nothing for a line with no lead. */
function leadText(lead: Lead | null, s: Style): string {
  if (lead === null) return ''
  const padded = lead.text.padEnd(2)

  return `${lead.tone ? s.tone(lead.tone, padded) : padded} `
}

/** A result mark and the space after it. */
function markText(mark: ResultMark | null, now: number, s: Style): string {
  if (mark === null) return ''

  return `${feedbackPaint(mark.tone ?? null, s)(resultGlyph(mark, now))} `
}

export function feedbackPaint(tone: Tone | null, s: Style) {
  return (text: string) => (tone ? s.tone(tone, text) : s.dim(text))
}

/** A Status row's or legend entry's mark. A running mark draws the frame at `now`. */
export function paintMark(m: { mark: string; tone: Tone | null; isRunning: boolean }, now: number, s: Style): string {
  return feedbackPaint(m.tone, s)(m.isRunning ? runningMark(now) : m.mark)
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
  const mark = markText(line.mark, now, s)
  const after = line.settled
    ? `  ${mark}${line.settled.tone === 'done' ? s.tone('done', line.settled.label) : s.dim(line.settled.label)}${line.settled.undo ? `  ${s.dim('u Undo')}` : ''}`
    : line.feedback && !statusUnder
      ? `  ${mark}${feedbackPaint(line.feedback.tone, s)(line.feedback.text)}`
      : ''
  // omp marks a selected item with ❯, its `nav.cursor` symbol, and keeps ▸ and ▾ for expand and collapse.
  const cursor = isSelected ? s.tone('accent', '❯') : ' '
  const head = ` ${' '.repeat(pad)}${cursor} ${line.rank ? s.dim(line.rank) : ''}${leadText(line.lead, s)}`
  const shownTitle = line.mark
    ? cutTitle(line.title, width - visibleLength(head) - visibleLength(status) - visibleLength(after))
    : line.title
  const title = line.isDim ? s.dim(shownTitle) : isSelected ? s.bold(shownTitle) : shownTitle
  const age = line.age !== null && line.settled === null ? s.dim(ago(now - line.age)) : ''
  out.push(spread(`${head}${title}${status}${after}`, `${age} `, width))
  if (line.settled || isShut(line, ui)) return out
  const indent = (line.lead === null ? UNLED_INDENT : INDENT) + pad
  // A next build draws the Status, so only it names the subject an ask holds up.
  const holdsUp = d.screen.isNextBuild === true ? line.row?.holdsUpLine : null
  if (holdsUp) out.push(fit(`${' '.repeat(indent)}${s.tone(HELD_MARK.tone, HELD_MARK.mark)} ${s.dim(holdsUp)}`, width))
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
  if (statusUnder) {
    const markCells = mark ? 2 : 0
    const [first, ...rest] = indented(
      statusUnder.text,
      indent + markCells,
      width,
      4,
      feedbackPaint(statusUnder.tone, s),
    )
    if (first !== undefined) out.push(' '.repeat(indent) + mark + first.slice(indent + markCells), ...rest)
  }

  return out
}
