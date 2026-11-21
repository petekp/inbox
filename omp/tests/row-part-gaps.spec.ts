import { expect, test } from 'bun:test'
import { rowKeyPlan } from '../../core/view/action-plan'
import { partPairs, partRows, rowParts } from '../../core/view/row-parts'
import type { AnswersForm } from '../../core/view/row-parts'
import type { RowView } from '../../core/view/rows'
import { caseName, caseRow, rowCases } from '../../tests/row-part-cases'
import type { RowCase } from '../../tests/row-part-cases'
import { drawLine } from '../src/panel-draw'
import { entriesOf } from '../src/panel-entries'
import { INITIAL_UI } from '../src/panel'
import { linesOf } from '../src/panel-lines'
import { NOW, screenOf, style, withCursorOn } from './panel-harness'

const WIDE = 200
const NARROW = 40
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const

function answersOf(row: RowView, isWide: boolean): AnswersForm | null {
  const { options, answerRow } = rowKeyPlan(row, true)
  if (options.length === 0) return null
  if (answerRow && isWide) return { is: 'side by side', hasReason: answerRow.recLine !== null }

  return { is: 'stacked', hasNotes: options.map(o => o.note !== null) }
}

function drawnBlankRows(c: RowCase, row: RowView): number {
  const screen = screenOf()
  const list = { question: 'questions', task: 'tasks', finding: null }[c.kind]
  const view = list
    ? { ...screen.view, needsYou: { ...screen.view.needsYou, questions: [], tasks: [], [list]: [row] } }
    : { ...screen.view, findings: { ...screen.view.findings, rows: [row] } }
  const tab = c.kind === 'finding' ? 'findings' : 'needsYou'
  const ui = withCursorOn({ ...INITIAL_UI, tab, typing: c.typing ? row.id : null }, row.id)
  const shown = { ...screen, view }
  const line = linesOf(entriesOf(shown, ui, tab, NOW)).find(l => l.id === row.id)!
  const width = c.isWide ? WIDE : NARROW

  return drawLine(line, true, { screen: shown, ui, width, now: NOW, style })
    .slice(1)
    .filter(l => l.trim() === '').length
}

function expectedBlankRows(c: RowCase, row: RowView): number {
  const parts = rowParts(row, {
    answers: answersOf(row, c.isWide),
    hasTitleStatus: c.feedback === 'above',
    hasStatus: false,
    hasButtons: true,
    isTyping: c.typing,
    hasResult: c.feedback === 'under',
    hasCopy: false,
  })

  return partPairs(parts).reduce((n, [above, below]) => n + partRows(above, below, false), 0)
}

test('the omp panel puts partRows blank rows between the parts of an open question, task and finding, wide and narrow', () => {
  const screen = screenOf()
  const bases = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks, ...screen.view.findings.rows]
  const cases = rowCases().map(c => ({
    c,
    row: caseRow(
      c,
      bases.find(r => r.id === BASE_ID[c.kind])!,
      NOW,
    ),
  }))

  expect(cases.map(({ c, row }) => ({ name: caseName(c), blankRows: drawnBlankRows(c, row) }))).toEqual(
    cases.map(({ c, row }) => ({ name: caseName(c), blankRows: expectedBlankRows(c, row) })),
  )
})
