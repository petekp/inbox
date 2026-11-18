import { answersFitLine } from '../../hooks/action-plan'
import { earlierLineText } from '../../hooks/earlier-answers'
import type { RowPart } from '../../hooks/row-parts'
import type { Button, Line } from './panel-lines'
import { visibleLength, wrapText } from './panel-text'
import type { Style } from './panel'

/** The three cells before a tree line's text: its trunk or arm under the ◆, then the gap to the title's column. */
const TRUNK = '│  '
const TEE = '├─ '
const LAST = '└─ '
const NONE = '   '

/** The lines of one part of an ask's tree. */
export type TreePart = {
  part: Extract<RowPart, 'holdsUp' | 'context' | 'earlier' | 'answer' | 'note' | 'answers' | 'reason'>
  lines: string[]
}

/**
 * An open ask's Holds up line, context, earlier answer and answers' lines, in that order, as a tree that hangs from the ◆
 * before its title. The arms start under the ◆ and the text starts in the title's column. With no answer line or Holds
 * up, the context draws alone with no tree. Answers the line's `answerRow` lets sit side by side, and that fit the
 * room, share one arm, with the recommendation's reason under them. `pad` is the row's extra indent. Each part's lines
 * come apart, so the row can space them by `partRows`.
 */
export function askTreeLines(
  line: Line,
  pad: number,
  width: number,
  s: Style,
  /** An answer's button as the lines of its cell, given its index among the line's buttons and the room it has. */
  cell: (b: Button, index: number, room: number) => string[],
  /** Cells an answer's label starts in from its button's edge, where the answer's note starts. */
  labelCells: (b: Button) => number,
): TreePart[] {
  const row = line.row
  if (!row || row.state.is !== 'open') return []
  const margin = ' '.repeat(3 + pad)
  const room = Math.max(10, width - margin.length - TRUNK.length - 1)
  const branches = line.buttons.flatMap((b, index) => (b.option ? [{ b, index, note: b.option.note }] : []))
  const holdsUp = row.holdsUpLine
  const draw = (arm: string, text: string, rest: string, indent = 0): string[] =>
    wrapText(text, room - indent).map((l, i) => s.dim(margin + (i === 0 ? arm : rest) + ' '.repeat(indent)) + s.dim(l))
  const heads = holdsUp ? [{ text: holdsUp }] : []
  const answerRow = line.answerRow ?? null
  const oneLine = branches.map(a => cell(a.b, a.index, Infinity)[0]!)
  const isSideBySide = answerRow !== null && answersFitLine(oneLine.map(visibleLength), 0, room)
  const lastBranch = heads.length + (isSideBySide ? 1 : branches.length) - 1
  const drawHead = (text: string, n: number): TreePart => {
    const isLast = n === lastBranch

    return { part: 'holdsUp', lines: draw(isLast ? LAST : TEE, text, isLast ? NONE : TRUNK) }
  }
  const drawAnswer = (a: (typeof branches)[number], n: number): TreePart[] => {
    const isLast = n === lastBranch
    const rest = isLast ? NONE : TRUNK

    const [first, ...more] = cell(a.b, a.index, room)

    return [
      {
        part: 'answer',
        lines: [s.dim(margin + (isLast ? LAST : TEE)) + first, ...more.map(l => s.dim(margin + rest) + l)],
      },
      ...(a.note ? [{ part: 'note' as const, lines: draw(rest, a.note, rest, labelCells(a.b)) }] : []),
    ]
  }
  const contextArm = branches.length > 0 ? TRUNK : NONE
  const out: TreePart[] = heads.map((b, n) => drawHead(b.text, n))
  if (row.contextLine) out.push({ part: 'context', lines: draw(contextArm, row.contextLine, contextArm) })
  const earlier = row.earlierLine
  if (earlier) {
    const head = earlier.lead + earlier.answer
    const arms = s.dim(margin + contextArm)
    const lines = wrapText(earlierLineText(earlier), room).map((l, i) =>
      i === 0 && l.startsWith(head)
        ? arms + s.dim(earlier.lead) + s.bold(earlier.answer) + s.dim(l.slice(head.length))
        : arms + s.dim(l),
    )
    out.push({ part: 'earlier', lines })
  }
  if (answerRow && isSideBySide && branches[0]) {
    out.push({ part: 'answers', lines: [s.dim(margin + LAST) + oneLine.join('')] })
    if (answerRow.recLine)
      out.push({ part: 'reason', lines: draw(NONE, answerRow.recLine, NONE, labelCells(branches[0].b)) })
  } else branches.forEach((b, n) => out.push(...drawAnswer(b, heads.length + n)))

  return out
}
