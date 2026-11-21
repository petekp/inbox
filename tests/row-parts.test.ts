import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { rowKeyPlan } from '../core/view/action-plan'
import { demoSession } from '../core/view/demo'
import { GROUP_STEPS, partGap, partPairs, partPt, ROW_PARTS, rowParts } from '../core/view/row-parts'
import type { RowPart } from '../core/view/row-parts'
import type { RowView } from '../core/view/rows'
import { sessionView } from '../core/view/session-view'
import { SETTLED_MS } from '../core/view/timing'
import { caseRow, rowCases } from './row-part-cases'

const NOW = 1_000_000
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const

function casePartLists(): RowPart[][] {
  const demo = sessionView(demoSession(NOW, 'Claude'), NOW, SETTLED_MS)
  const bases: RowView[] = [...demo.needsYou.questions, ...demo.needsYou.tasks, ...demo.findings.rows]

  return rowCases().flatMap(c => {
    const row = caseRow(
      c,
      bases.find(r => r.id === BASE_ID[c.kind])!,
      NOW,
    )
    const { options, answerRow } = rowKeyPlan(row, false)
    const answers =
      options.length === 0
        ? null
        : answerRow && c.isWide
          ? { is: 'side by side' as const, hasReason: answerRow.recLine !== null }
          : { is: 'stacked' as const, hasNotes: options.map(o => o.note !== null) }

    return [false, true].map(isOn =>
      rowParts(row, {
        answers,
        hasTitleStatus: isOn,
        hasStatus: c.feedback === 'above',
        hasButtons: true,
        isTyping: c.typing,
        hasResult: c.feedback === 'under',
        hasCopy: isOn,
      }),
    )
  })
}

const DRAWN = {
  'answer → answer': { pt: 12, rows: 0 },
  'answer → buttons': { pt: 8, rows: 1 },
  'answer → field': { pt: 8, rows: 1 },
  'answer → note': { pt: 4, rows: 0 },
  'answer → status': { pt: 8, rows: 1 },
  'answers → buttons': { pt: 8, rows: 1 },
  'answers → field': { pt: 8, rows: 1 },
  'answers → reason': { pt: 4, rows: 0 },
  'answers → status': { pt: 8, rows: 1 },
  'buttons → copy': { pt: 8, rows: 0 },
  'buttons → result': { pt: 4, rows: 0 },
  'context → answer': { pt: 8, rows: 0 },
  'context → answers': { pt: 8, rows: 0 },
  'context → buttons': { pt: 8, rows: 1 },
  'context → earlier': { pt: 8, rows: 0 },
  'context → field': { pt: 8, rows: 1 },
  'context → status': { pt: 8, rows: 1 },
  'detail → buttons': { pt: 8, rows: 1 },
  'detail → field': { pt: 8, rows: 1 },
  'detail → file': { pt: 4, rows: 0 },
  'detail → status': { pt: 8, rows: 1 },
  'earlier → answer': { pt: 8, rows: 0 },
  'earlier → answers': { pt: 8, rows: 0 },
  'field → copy': { pt: 8, rows: 0 },
  'field → result': { pt: 4, rows: 0 },
  'file → buttons': { pt: 8, rows: 1 },
  'file → field': { pt: 8, rows: 1 },
  'file → status': { pt: 8, rows: 1 },
  'holdsUp → answer': { pt: 8, rows: 0 },
  'holdsUp → answers': { pt: 8, rows: 0 },
  'holdsUp → buttons': { pt: 8, rows: 1 },
  'holdsUp → context': { pt: 8, rows: 0 },
  'holdsUp → earlier': { pt: 8, rows: 0 },
  'holdsUp → field': { pt: 8, rows: 1 },
  'holdsUp → status': { pt: 8, rows: 1 },
  'note → answer': { pt: 12, rows: 0 },
  'note → buttons': { pt: 8, rows: 1 },
  'note → field': { pt: 8, rows: 1 },
  'note → status': { pt: 8, rows: 1 },
  'reason → buttons': { pt: 8, rows: 1 },
  'reason → field': { pt: 8, rows: 1 },
  'reason → status': { pt: 8, rows: 1 },
  'result → copy': { pt: 8, rows: 0 },
  'status → buttons': { pt: 4, rows: 0 },
  'status → field': { pt: 4, rows: 0 },
  'title → answer': { pt: 8, rows: 0 },
  'title → answers': { pt: 8, rows: 0 },
  'title → buttons': { pt: 8, rows: 1 },
  'title → context': { pt: 0, rows: 0 },
  'title → detail': { pt: 0, rows: 0 },
  'title → earlier': { pt: 0, rows: 0 },
  'title → field': { pt: 8, rows: 1 },
  'title → holdsUp': { pt: 0, rows: 0 },
  'title → status': { pt: 8, rows: 1 },
  'title → titleStatus': { pt: 0, rows: 0 },
  'titleStatus → answer': { pt: 8, rows: 0 },
  'titleStatus → answers': { pt: 8, rows: 0 },
  'titleStatus → buttons': { pt: 8, rows: 1 },
  'titleStatus → context': { pt: 0, rows: 0 },
  'titleStatus → detail': { pt: 0, rows: 0 },
  'titleStatus → earlier': { pt: 0, rows: 0 },
  'titleStatus → field': { pt: 8, rows: 1 },
  'titleStatus → holdsUp': { pt: 0, rows: 0 },
  'titleStatus → status': { pt: 8, rows: 1 },
}

test('the row cases, with the title status and the copy box on and off, draw every part the table names', () => {
  expect([...new Set(casePartLists().flat())].sort()).toEqual([...ROW_PARTS].sort())
})

test('each pair of neighboring parts in the row cases draws the gap listed for it in every look', () => {
  const drawn = Object.fromEntries(
    casePartLists()
      .flatMap(partPairs)
      .map(([above, below]) => [`${above} → ${below}`, { pt: partPt(above, below), rows: partGap(above, below).rows }]),
  )

  expect(drawn).toEqual(DRAWN)
})

test('each gap that joins two parts into a group is smaller than each gap between groups', () => {
  const pairs = casePartLists().flatMap(partPairs)
  const isGroup = ([above, below]: [RowPart, Exclude<RowPart, 'title'>]) => partGap(above, below).step in GROUP_STEPS
  const widestGroup = Math.max(...pairs.filter(isGroup).map(([a, b]) => partPt(a, b)))
  const narrowestBetween = Math.min(...pairs.filter(p => !isGroup(p)).map(([a, b]) => partPt(a, b)))

  expect(widestGroup).toBeLessThan(narrowestBetween)
})
