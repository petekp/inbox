import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import type { SessionStatus } from '../types'
import { after, page } from './status-helpers'

const WORK = [
  'HEAD: Import | Making CSV import ready to demo',
  'NEW: working | CSV import | bad rows skipped',
  'NEW: queued | Error copy | not started',
  'NEW: working | Dark mode | toggle drawn',
].join('\n')
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained; queued Demo script'
const withGoal = (): SessionStatus => after(after(null, WORK, 10), GOAL, 20)

test('a GOAL line gives each milestone where it stands after a colon', () => {
  const told = after(
    after(null, WORK, 10),
    'GOAL: Import ready to demo | done Parsing works: CSV parsed; working Errors explained: bad rows named',
    20,
  )

  expect(told.milestones.map(m => [m.name, m.status, m.text])).toEqual([
    ['Parsing works', 'done', 'CSV parsed'],
    ['Errors explained', 'working', 'bad rows named'],
  ])
})

test('an open milestone that open work serves and the call has said nothing about reads how much of that work is done, until the call says where it stands', () => {
  const served = after(withGoal(), 'SERVES: s1 | m2\nSERVES: s2 | m2\nSERVES: s3 | -', 30)
  const errors = (o: SessionStatus) => page(o, 60).goal?.milestones.find(m => m.id === 'm2')?.text

  expect(errors(served)).toBe('0 of 2 done')
  expect(errors(after(served, 'DONE: s1 | imports clean', 40))).toBe('1 of 2 done')
  expect(errors(after(served, 'SET: m2 | working | bad rows named', 40))).toBe('bad rows named')
  expect(page(served, 60).goal?.milestones.find(m => m.id === 'm3')?.text).toBeNull()
})
