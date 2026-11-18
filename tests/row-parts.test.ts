import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { rowKeyPlan } from '../hooks/action-plan'
import { demoSession } from '../hooks/demo'
import { BETWEEN_STEPS, GROUP_STEPS, ROW_PARTS, rowParts } from '../hooks/row-parts'
import type { RowView } from '../hooks/rows'
import { sessionView } from '../hooks/session-view'
import { SETTLED_MS } from '../hooks/timing'
import { caseRow, rowCases } from './row-part-cases'

const NOW = 1_000_000
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const

test('every step that joins two parts into a group is smaller than every step between groups', () => {
  expect(Math.max(...Object.values(GROUP_STEPS))).toBeLessThan(Math.min(...Object.values(BETWEEN_STEPS)))
})

test('the row cases, with the title status and the copy box on and off, draw every part the table names', () => {
  const demo = sessionView(demoSession(NOW, 'Claude'), NOW, SETTLED_MS)
  const bases: RowView[] = [...demo.needsYou.questions, ...demo.needsYou.tasks, ...demo.findings.rows]
  const drawn = rowCases().flatMap(c => {
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

    return [false, true].flatMap(isOn =>
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

  expect([...new Set(drawn)].sort()).toEqual([...ROW_PARTS].sort())
})
