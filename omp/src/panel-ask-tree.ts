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
 * An open ask's Holds up line, context, earlier answer and answers' lines, in that order, as a tree that hangs from the ◆
 * before its title. The arms start under the ◆ and the text starts in the title's column. With no answer line or Holds
 * up, the context draws alone with no tree. `pad` is the row's extra indent.
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
  const draw = (arm: string, text: string, rest: string, label = ''): string[] =>
    wrapText(text, room).map((l, i) => {
      const arms = s.dim(margin + (i === 0 ? arm : rest))

      return i === 0 && label && l.startsWith(label) ? arms + label + s.dim(l.slice(label.length)) : arms + s.dim(l)
    })
  const heads = holdsUp ? [{ label: '', text: holdsUp, reason: null }] : []
  const all = [...heads, ...branches]
  const lastBranch = all.length - 1
  const drawBranch = (b: (typeof all)[number], n: number): string[] => {
    const isLast = n === lastBranch
    const rest = isLast ? NONE : TRUNK

    return [...draw(isLast ? LAST : TEE, b.text, rest, b.label), ...(b.reason ? draw(rest, b.reason, rest) : [])]
  }
  const contextArm = branches.length > 0 ? TRUNK : NONE
  const out: string[] = heads.flatMap((b, n) => drawBranch(b, n))
  if (row.contextLine) out.push(...draw(contextArm, row.contextLine, contextArm))
  const earlier = row.earlierLine
  if (earlier) {
    const head = earlier.lead + earlier.answer
    wrapText(earlierLineText(earlier), room).forEach((l, i) => {
      const arms = s.dim(margin + contextArm)
      const isAnswerWhole = i === 0 && l.startsWith(head)
      out.push(
        isAnswerWhole
          ? arms + s.dim(earlier.lead) + s.bold(earlier.answer) + s.dim(l.slice(head.length))
          : arms + s.dim(l),
      )
    })
  }
  branches.forEach((b, n) => out.push(...drawBranch(b, heads.length + n)))

  return out
}
