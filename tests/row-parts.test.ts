import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { rowKeyPlan } from '../hooks/action-plan'
import { demoSession } from '../hooks/demo'
import { BETWEEN_STEPS, GROUP_STEPS, partGap, partPairs, partPt, ROW_PARTS, rowParts } from '../hooks/row-parts'
import type { RowPart } from '../hooks/row-parts'
import type { RowView } from '../hooks/rows'
import { sessionView } from '../hooks/session-view'
import { SETTLED_MS } from '../hooks/timing'
import { caseRow, rowCases } from './row-part-cases'

const NOW = 1_000_000
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const

test('every step that joins two parts into a group is smaller than every step between groups', () => {
  expect(Math.max(...Object.values(GROUP_STEPS))).toBeLessThan(Math.min(...Object.values(BETWEEN_STEPS)))
})

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
  'answer → answer': { herdr: 12, codex: 14, desktopCard: 12, desktopFrame: 12, rows: 0 },
  'answer → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'answer → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'answer → note': { herdr: 4, codex: 4, desktopCard: 4, desktopFrame: 4, rows: 0 },
  'answer → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'answers → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'answers → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'answers → reason': { herdr: 4, codex: 4, desktopCard: 4, desktopFrame: 4, rows: 0 },
  'answers → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'buttons → copy': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'buttons → result': { herdr: 8, codex: 8, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'context → answer': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'context → answers': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'context → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'context → earlier': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 0, rows: 0 },
  'context → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'context → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'detail → buttons': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'detail → field': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'detail → file': { herdr: 0, codex: 4, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'detail → status': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'earlier → answer': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'earlier → answers': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'field → copy': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'field → result': { herdr: 8, codex: 8, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'file → buttons': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'file → field': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'file → status': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'holdsUp → answer': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'holdsUp → answers': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'holdsUp → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'holdsUp → context': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'holdsUp → earlier': { herdr: 8, codex: 10, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'holdsUp → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'holdsUp → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'note → answer': { herdr: 12, codex: 14, desktopCard: 12, desktopFrame: 12, rows: 0 },
  'note → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'note → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'note → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'reason → buttons': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'reason → field': { herdr: 8, codex: 9, desktopCard: 6, desktopFrame: 9.5, rows: 1 },
  'reason → status': { herdr: 8, codex: 9, desktopCard: 15.5, desktopFrame: 9.5, rows: 1 },
  'result → copy': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'status → buttons': { herdr: 8, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'status → field': { herdr: 8, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'title → answer': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'title → answers': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'title → buttons': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'title → context': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'title → detail': { herdr: 0, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'title → earlier': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'title → field': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'title → holdsUp': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'title → status': { herdr: 0, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'title → titleStatus': { herdr: 0, codex: 0, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'titleStatus → answer': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'titleStatus → answers': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 8, rows: 0 },
  'titleStatus → buttons': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'titleStatus → context': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'titleStatus → detail': { herdr: 0, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
  'titleStatus → earlier': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'titleStatus → field': { herdr: 8, codex: 8, desktopCard: 8, desktopFrame: 9.5, rows: 1 },
  'titleStatus → holdsUp': { herdr: 0, codex: 1, desktopCard: 0, desktopFrame: 0, rows: 0 },
  'titleStatus → status': { herdr: 0, codex: 8, desktopCard: 0, desktopFrame: 9.5, rows: 1 },
}

test('the row cases, with the title status and the copy box on and off, draw every part the table names', () => {
  expect([...new Set(casePartLists().flat())].sort()).toEqual([...ROW_PARTS].sort())
})

test('each pair of neighboring parts in the row cases draws the gap listed for it in every look', () => {
  const drawn = Object.fromEntries(
    casePartLists()
      .flatMap(partPairs)
      .map(([above, below]) => [
        `${above} → ${below}`,
        {
          herdr: partPt(above, below, 'herdr'),
          codex: partPt(above, below, 'codex'),
          desktopCard: partPt(above, below, 'desktopCard'),
          desktopFrame: partPt(above, below, 'desktopFrame'),
          rows: partGap(above, below).rows,
        },
      ]),
  )

  expect(drawn).toEqual(DRAWN)
})
