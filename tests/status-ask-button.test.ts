import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { statusKeyRows } from '../core/view/status-keys'
import { after, askItem, page } from './status-helpers'

const START = 'NEW: working | CSV import | bad rows skipped\nNEW: working | Dark mode | toggle drawn'
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained'
const LINKS = 'SERVES: s1 | m2\nLINK: i1 | m2\nLINK: i2 | m2\nLINK: i1 | s1\nLINK: i2 | s1'

test('the View button on an ask row opens the ask that sets the mark above it: a question before an older task, under a subject serving a milestone', () => {
  const asks = [
    { ...askItem('i1'), kind: 'task' as const, at: 1 },
    { ...askItem('i2'), at: 2 },
  ]
  const started = after(after(null, START, 10), GOAL, 20)
  const held = after(started, LINKS, 30, new Set(['i1', 'i2']))
  const p = page(held, 40, {}, asks)
  const milestone = p.goal?.milestones.find(m => m.id === 'm2')
  const subject = milestone?.rows.find(r => r.id === 's1')
  const askRow = milestone?.rows.find(r => r.id === 's1-ask')
  const keysOf = (id: string) =>
    statusKeyRows(p)
      .find(k => k.id === id)
      ?.keys.map(k => k.label)

  expect(milestone).toMatchObject({ mark: '●', tone: 'needsYou' })
  expect(subject).toMatchObject({ mark: '◐', tone: 'needsYou' })
  expect(askRow).toMatchObject({ kind: 'ask', mark: '?', ask: { id: 'i2', kind: 'question' } })
  expect(keysOf('s1-ask')).toEqual(['View question'])
  expect(keysOf('s1')).not.toContain('View question')
  expect(keysOf('m2')).toEqual(['Fold'])
})
