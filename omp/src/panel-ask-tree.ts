import { earlierLineText } from '../../hooks/earlier-answers'
import type { Button, Line } from './panel-lines'
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
export function askTreeLines(
  line: Line,
  pad: number,
  width: number,
  s: Style,
  /** An answer's button as a cell, given its index among the line's buttons and the room it has. */
  cell: (b: Button, index: number, room: number) => string,
): string[] {
  const row = line.row
  if (!row || row.state.is !== 'open') return []
  const margin = ' '.repeat(3 + pad)
  const room = Math.max(10, width - margin.length - TRUNK.length - 1)
  const branches = line.buttons.flatMap((b, index) => (b.option ? [{ b, index, note: b.option.note }] : []))
  const holdsUp = row.holdsUpLine
  const draw = (arm: string, text: string, rest: string): string[] =>
    wrapText(text, room).map((l, i) => s.dim(margin + (i === 0 ? arm : rest)) + s.dim(l))
  const heads = holdsUp ? [{ text: holdsUp }] : []
  const lastBranch = heads.length + branches.length - 1
  const drawHead = (text: string, n: number): string[] => {
    const isLast = n === lastBranch

    return draw(isLast ? LAST : TEE, text, isLast ? NONE : TRUNK)
  }
  const drawAnswer = (a: (typeof branches)[number], n: number): string[] => {
    const isLast = n === lastBranch
    const rest = isLast ? NONE : TRUNK

    return [
      s.dim(margin + (isLast ? LAST : TEE)) + cell(a.b, a.index, room),
      ...(a.note ? draw(rest, a.note, rest) : []),
    ]
  }
  const contextArm = branches.length > 0 ? TRUNK : NONE
  const out: string[] = heads.flatMap((b, n) => drawHead(b.text, n))
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
  branches.forEach((b, n) => out.push(...drawAnswer(b, heads.length + n)))

  return out
}
