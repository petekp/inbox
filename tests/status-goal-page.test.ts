import { expect, test } from 'claude-code/testing'

import { setTypedGoal, useProposedGoal } from '../hooks/status-goal-ops'
import type { SessionStatus } from '../types'
import { after, askItem, page, shape } from './status-helpers'

const START = [
  'HEAD: Import | Making CSV import ready to demo',
  'NEW: working | CSV import | bad rows skipped',
  'NEW: queued | Error copy | not started',
  'NEW: working | Dark mode | toggle drawn',
  'NEW: queued | Logo refresh | not started',
  'GOAL: Import ready to demo | done Parsing works; working Errors explained; queued Demo script',
].join('\n')

const withGoal = (): SessionStatus => useProposedGoal(after(null, START, 10), 20)

const linked = (): SessionStatus =>
  after(
    withGoal(),
    'SERVES: s1 | m2\nSERVES: s2 | m2\nSERVES: s3 | -\nSERVES: s4 | -\nLINK: i1 | s2',
    30,
    new Set(['i1']),
  )

test('a proposal shows above the head, with its milestones, until the person answers it', () => {
  const p = page(after(null, START, 10), 15)

  expect(p.proposal).toEqual({
    label: 'Proposed goal · from your message',
    text: 'Import ready to demo',
    milestones: [
      { mark: '✓', tone: 'done', name: 'Parsing works' },
      { mark: '○', tone: null, name: 'Errors explained' },
      { mark: '○', tone: null, name: 'Demo script' },
    ].map((m, n) => (n === 1 ? { ...m, mark: '●' } : m)),
  })
  expect(p.goal).toBeNull()
  expect(p.nowLine).toBeNull()
})

test('a goal shows how far the work is, and the head draws as the Now line', () => {
  const p = page(linked(), 40, {}, [askItem('i1')])

  expect(p.goal?.label).toBe('Goal · 1 of 3 done')
  expect(p.goal?.text).toBe('Import ready to demo')
  expect(p.nowLine).toBe('Now: Making CSV import ready to demo')
  expect(p.goal?.milestones.map(m => `${m.mark} ${m.name}${m.stall ? ' · waiting' : ''}`)).toEqual([
    '✓ Parsing works',
    '◆ Errors explained · waiting',
    '○ Demo script',
  ])
  expect(p.goal?.milestones[1]?.ask).toEqual({ id: 'i1', kind: 'question' })
})

test('work the goal does not need sits under Other work, where seen rows fold into a count for each mark', () => {
  const seen = { ...linked(), lastLookAt: 35 }
  const changed = after(seen, 'SET: s4 | working | new logo drawn', 50, new Set(['i1']))

  expect(shape(page(seen, 40, {}, [askItem('i1')]).rows)).toEqual([
    '◆ Error copy: not started · waiting',
    '◐ CSV import: bad rows skipped',
    '== Other work',
    '● 1 working · ○ 1 queued',
  ])
  expect(shape(page(changed, 60, {}, [askItem('i1')]).rows)).toEqual([
    '◆ Error copy: not started · waiting',
    '◐ CSV import: bad rows skipped',
    '== Other work',
    '◐ Logo refresh: new logo drawn',
    '-- Last seen',
    '● 1 working',
  ])
})

test('a subject not linked yet stays in the main list, and nothing splits without a goal', () => {
  const unlinked = { ...withGoal(), lastLookAt: 25 }
  const noGoal = { ...after(null, START, 10), serves: { s3: 'none' }, lastLookAt: 25 }

  expect(page(unlinked, 30).rows.some(r => r.kind === 'part')).toBe(false)
  expect(page(noGoal, 30).rows.some(r => r.kind === 'part')).toBe(false)
})

test('a typed goal waits for its milestones, and a goal whose milestones are all done reads met', () => {
  const typed = setTypedGoal(linked(), 'Ship 2.6 with import', 45).status
  const met = after(linked(), 'DONE: m2 | explained\nDONE: m3 | written', 50)

  expect(page(typed, 46).goal).toMatchObject({
    label: 'Goal',
    was: 'Import ready to demo',
    awaiting: 'Milestones after the next reply',
    milestones: [],
  })
  expect(page(met, 55).goal).toMatchObject({ label: 'Goal met', isMet: true, awaiting: null })
})
