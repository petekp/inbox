import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { rowKeyPlan } from '../../core/view/action-plan'
import { partPairs, partPt, rowParts } from '../../core/view/row-parts'
import type { AnswersForm } from '../../core/view/row-parts'
import { DOT } from '../../core/view/rows'
import type { RowView } from '../../core/view/rows'
import { caseName, caseRow, rowCases } from '../../tests/row-part-cases'
import type { RowCase } from '../../tests/row-part-cases'
import type { Painted } from './gpui-stand-in'
import { demoScreen, uiOn } from './fixtures'

const { layoutAtRest } = await import('./frames')
const { tabBlocks } = await import('../src/draw')

const ANSWER_W = 60
const WIDE_ROOM = 1000
const NARROW_ROOM = 100
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const

function answersOf(row: RowView, isWide: boolean): AnswersForm | null {
  const { options, answerRow } = rowKeyPlan(row, false)
  if (options.length === 0) return null
  if (answerRow && isWide) return { is: 'side by side', hasReason: answerRow.recLine !== null }

  return { is: 'stacked', hasNotes: options.map(o => o.note !== null) }
}

function drawnGaps(c: RowCase): number[] {
  const screen = demoScreen()
  const all = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks, ...screen.view.findings.rows]
  const row = caseRow(
    c,
    all.find(r => r.id === BASE_ID[c.kind])!,
    screen.now,
  )
  const list = { question: 'questions', task: 'tasks', finding: null }[c.kind]
  const view = list
    ? { ...screen.view, needsYou: { ...screen.view.needsYou, questions: [], tasks: [], [list]: [row] } }
    : { ...screen.view, findings: { ...screen.view.findings, rows: [row] } }
  const tab = c.kind === 'finding' ? 'findings' : 'needsYou'
  const ui = uiOn(tab, { selected: row.id, typing: c.typing ? row.id : null })
  const widths = Object.fromEntries(rowKeyPlan(row, false).options.map((_, n) => [`answer ${row.id} ${n}`, ANSWER_W]))
  const { placed } = layoutAtRest(tabBlocks({ ...screen, view }, ui), widths, c.isWide ? WIDE_ROOM : NARROW_ROOM)
  const nodes = [...placed.keys()]
  const flow = (n: Painted) => n.kids.filter(k => !k.style.isAbsolute)
  const panel = nodes.find(n => n.id === `panel ${row.id}`)
  const rest = nodes.find(n => panel !== undefined && n.kids.includes(panel))
  const parts = [
    nodes.find(n => n.id === `title ${row.id}`)!,
    ...(rest ? flow(rest).flatMap(n => (n === panel ? flow(n) : [n])) : []),
  ]
  const top = (n: Painted) => placed.get(n)!.top + (n.style.pt ?? 0)
  const bottom = (n: Painted) => placed.get(n)!.top + placed.get(n)!.height - (n.style.pb ?? 0)

  return parts.slice(1).map((n, i) => top(n) - bottom(parts[i]!))
}

function expectedGaps(c: RowCase): number[] {
  const screen = demoScreen()
  const all = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks, ...screen.view.findings.rows]
  const row = caseRow(
    c,
    all.find(r => r.id === BASE_ID[c.kind])!,
    screen.now,
  )
  const parts = rowParts(row, {
    answers: answersOf(row, c.isWide),
    hasTitleStatus: c.feedback === 'above',
    hasStatus: false,
    hasButtons: true,
    isTyping: c.typing,
    hasResult: c.feedback === 'under',
    hasCopy: false,
  })

  return partPairs(parts).map(([above, below]) => partPt(above, below))
}

test('each part of an open question, task and finding sits partGap under the part above, wide and narrow', () => {
  const cases = rowCases()

  expect(cases.map(c => ({ name: caseName(c), gaps: drawnGaps(c) }))).toEqual(
    cases.map(c => ({ name: caseName(c), gaps: expectedGaps(c) })),
  )
})

test('a review thread’s fold note draws each of its parts on its own, so its lines break between parts and never at a dot', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('prs'))
  const note = blocks.flatMap(b => (b.kind === 'row' && b.feedback?.text.includes(DOT) ? [b.feedback.text] : []))[0]!
  const texts = [...layoutAtRest(blocks).placed.keys()].map(n => n.text)

  expect(texts).not.toContain(note)
  expect(texts).toEqual(expect.arrayContaining(note.split(DOT)))
})
