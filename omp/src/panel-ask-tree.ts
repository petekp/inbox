import { optionBody, optionReasonLine, shownOptionDescriptions } from '../../hooks/rows'
import { earlierLineText } from '../../hooks/earlier-answers'
import type { Line } from './panel-lines'
import { wrapText } from './panel-text'
import type { Style } from './panel'

/** The three cells before a tree line's text: its trunk or arm under the ◆, then the gap to the title's column. */
const TRUNK = '│  '
const TEE = '├─ '
const LAST = '└─ '
const NONE = '   '

/**
 * An open ask's context, its earlier answer, its answers' lines and its Holds up line, as a tree that hangs from the ◆ before its title.
 * The arms start under the ◆ and the text starts in the title's column. With no answer line or Holds up, the context
 * draws alone with no tree. `pad` is the row's extra indent.
 */
export function askTreeLines(line: Line, pad: number, width: number, s: Style, isAllShown = false): string[] {
  const row = line.row
  if (!row || row.state.is !== 'open') return []
  const margin = ' '.repeat(3 + pad)
  const room = Math.max(10, width - margin.length - TRUNK.length - 1)
  const branches = shownOptionDescriptions(row, isAllShown).map(o => {
    const body = optionBody(o)

    return { label: o.label, text: body === null ? o.label : `${o.label}: ${body}`, reason: optionReasonLine(o) }
  })
  const holdsUp = row.holdsUpLine
  const hasTree = branches.length > 0 || holdsUp !== null
  const draw = (arm: string, text: string, rest: string, label = ''): string[] =>
    wrapText(text, room).map((l, i) => {
      const arms = s.dim(margin + (i === 0 ? arm : rest))

      return i === 0 && label && l.startsWith(label) ? arms + label + s.dim(l.slice(label.length)) : arms + s.dim(l)
    })
  const out: string[] = []
  if (row.contextLine) out.push(...draw(hasTree ? TRUNK : NONE, row.contextLine, hasTree ? TRUNK : NONE))
  const earlier = row.earlierLine
  if (earlier) {
    const arm = hasTree ? TRUNK : NONE
    const head = earlier.lead + earlier.answer
    wrapText(earlierLineText(earlier), room).forEach((l, i) => {
      const arms = s.dim(margin + arm)
      const isAnswerWhole = i === 0 && l.startsWith(head)
      out.push(
        isAnswerWhole
          ? arms + s.dim(earlier.lead) + s.bold(earlier.answer) + s.dim(l.slice(head.length))
          : arms + s.dim(l),
      )
    })
  }
  const all = [...branches, ...(holdsUp ? [{ label: '', text: holdsUp, reason: null }] : [])]
  all.forEach((b, n) => {
    const isLast = n === all.length - 1
    const rest = isLast ? NONE : TRUNK
    out.push(...draw(isLast ? LAST : TEE, b.text, rest, b.label))
    if (b.reason) out.push(...draw(rest, b.reason, rest))
  })

  return out
}
