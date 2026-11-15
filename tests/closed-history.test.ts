import { expect, test } from 'claude-code/testing'

import { isRowTabRunning } from '../hooks/arrivals'
import type { InboxView } from '../hooks/view'
import { closedHistoryPlan } from '../hooks/rows'
import { EMPTY } from '../hooks/ledger'
import { addFinding } from '../hooks/ledger-update'
import { emptySession } from '../hooks/session-files'
import { sessionView } from '../hooks/session-view'
import { NO_HOLDS } from '../hooks/timing'

test('the shared closed plan lists every record newest first after more than 12 closes', () => {
  const records = Array.from({ length: 14 }, (_, n) => ({ id: `i${14 - n}`, at: 14 - n }))
  const history = closedHistoryPlan(records, new Set())

  expect(history).toEqual({ rows: records, total: 14 })
})

test('a running mark anywhere in the closed list keeps the text look drawing while the group is expanded', () => {
  const closed = Array.from({ length: 4 }, (_, n) => ({ id: `i${n + 1}`, mark: { text: '', isRunning: n === 3 } }))
  const view = {
    needsYou: { questions: [], tasks: [], closed: { questions: closed, tasks: [] } },
    findings: { rows: [], closed: [] },
  } as unknown as InboxView

  expect(isRowTabRunning(view, 'needsYou', kind => kind === 'question')).toBe(true)
  expect(isRowTabRunning(view, 'needsYou', () => true)).toBe(true)
  expect(isRowTabRunning(view, 'needsYou', () => false)).toBe(false)
})

test('a finding closed as list full stays in the shared history plan', () => {
  const finding = { kind: 'issue' as const, title: '', detail: 'detail', path: null, at: 1 }
  const full = Array.from({ length: 31 }, (_, n) => n).reduce(
    (ledger, n) => addFinding(ledger, { ...finding, title: `Problem ${n + 1}`, at: n + 1 }).ledger,
    EMPTY,
  )
  const view = sessionView({ ...emptySession(), ledger: full }, 100, 1000, NO_HOLDS)
  const history = closedHistoryPlan(view.findings.closed, new Set())

  expect(history.rows.map(f => [f.title, f.outcome])).toContainEqual(['Problem 1', 'list full'])
})
