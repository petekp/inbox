import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { statusKeyRows } from '../core/view/status-keys'
import { after, askItem, page } from './status-helpers'

const START = 'NEW: working | CSV import | bad rows skipped\nNEW: working | Dark mode | toggle drawn'
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained'
const LINKS = 'SERVES: s1 | m2\nLINK: i1 | m2\nLINK: i2 | m2\nLINK: i1 | s1\nLINK: i2 | s1'

test('the View button under a mark opens the ask that sets it: a question before an older task, on a milestone and on a subject', () => {
  const asks = [
    { ...askItem('i1'), kind: 'task' as const, at: 1 },
    { ...askItem('i2'), at: 2 },
  ]
  const started = after(after(null, START, 10), GOAL, 20)
  const held = after(started, LINKS, 30, new Set(['i1', 'i2']))
  const p = page(held, 40, {}, asks)
  const milestone = p.goal?.milestones.find(m => m.id === 'm2')
  const subject = milestone?.rows.find(r => r.id === 's1')

  expect(milestone).toMatchObject({ mark: '◆', ask: { id: 'i2', kind: 'question' } })
  expect(subject).toMatchObject({ mark: '◆', ask: { id: 'i2', kind: 'question' } })
  expect(
    statusKeyRows(p)
      .find(k => k.id === 'm2')
      ?.keys.map(k => k.label),
  ).toEqual(['View question', 'Fold'])
})
