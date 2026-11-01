import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { allRows } from '../hooks/rows'
import { emptySession } from '../hooks/session-files'
import { sessionView } from '../hooks/session-view'
import { setTypedGoal, useProposedGoal } from '../hooks/status-goal-ops'
import { statusKeyRows } from '../hooks/status-keys'
import { NO_HOLDS } from '../hooks/timing'
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
    isBelowGoal: false,
    text: 'Import ready to demo',
    milestones: [
      { mark: '✓', tone: 'done', name: 'Parsing works' },
      { mark: '○', tone: null, name: 'Errors explained' },
      { mark: '○', tone: null, name: 'Demo script' },
    ].map((m, n) => (n === 1 ? { ...m, mark: '●' } : m)),
  })
  expect(p.goal).toBeNull()
})

test('a proposal made while a goal is set reads as a new goal, and its buttons come after the goal’s and its milestones’ rows in the order j and k move', () => {
  const p = page(
    after(linked(), 'GOAL: Import shipped | queued Release notes; queued Launch post', 45, new Set(['i1'])),
    50,
    {},
    [askItem('i1')],
  )

  expect(p.proposal).toMatchObject({ label: 'Proposed new goal · from your message', isBelowGoal: true })
  const ids = statusKeyRows(p).map(t => t.id)
  expect(ids.indexOf('m2')).toBeLessThan(ids.indexOf('s2'))
  expect(ids.indexOf('s2')).toBeLessThan(ids.indexOf('proposal'))
})

test('a goal shows how far the work is after its text, its Edit comes before its milestones in the order j and k move, and the head draws as its Now line', () => {
  const p = page(linked(), 40, {}, [askItem('i1')])

  expect(p.goal).toMatchObject({ label: 'Goal', count: '1 of 3 done' })
  expect(p.goal?.text).toBe('Import ready to demo')
  expect(p.goal?.now).toBe('Now: Making CSV import ready to demo')
  expect(p.head).not.toBeNull()
  expect(p.goal?.milestones.map(m => `${m.mark} ${m.name}${m.stall ? ' · waiting' : ''}`)).toEqual([
    '✓ Parsing works',
    '◆ Errors explained · waiting',
    '○ Demo script',
  ])
  expect(p.goal?.milestones[1]?.ask).toEqual({ id: 'i1', kind: 'question' })
  expect(statusKeyRows(p).map(t => [t.id, t.keys.map(k => k.label)])).toEqual([
    ['goal', ['Edit']],
    ['m2', ['View question']],
    ['s2', ['View question']],
  ])
})

test('work that serves a milestone draws under it one step in, and work the goal does not need sits under Other work, where seen rows fold into a count for each mark', () => {
  const seen = { ...linked(), lastLookAt: 35 }
  const changed = after(seen, 'SET: s4 | working | new logo drawn', 50, new Set(['i1']))
  const p = page(seen, 40, {}, [askItem('i1')])

  expect(p.goal?.milestones.map(m => shape(m.rows))).toEqual([
    [],
    ['◆ Error copy: not started · waiting', '◐ CSV import: bad rows skipped'],
    [],
  ])
  expect(p.goal?.milestones[1]?.rows.map(r => [r.depth, r.isRuledAbove])).toEqual([
    [1, false],
    [1, false],
  ])
  expect(shape(p.rows)).toEqual(['== Other work', '● 1 working · ○ 1 queued'])
  expect(shape(page(changed, 60, {}, [askItem('i1')]).rows)).toEqual([
    '== Other work',
    '◐ Logo refresh: new logo drawn',
    '-- Last seen',
    '● 1 working',
  ])
})

test('finished work under a milestone shows as a row until the person looks, then folds into the milestone’s count', () => {
  const finished = after({ ...linked(), lastLookAt: 35 }, 'DONE: s1 | import ships', 50, new Set(['i1']))
  const rowsOf = (o: SessionStatus) => page(o, 80, {}, [askItem('i1')]).goal?.milestones[1]?.rows ?? []

  expect(shape(rowsOf(finished))).toEqual([
    '✓ CSV import: import ships',
    '-- Last seen',
    '◆ Error copy: not started · waiting',
  ])
  expect(shape(rowsOf({ ...finished, lastLookAt: 70 }))).toEqual(['◆ Error copy: not started · waiting', '✓ 1 done'])
  expect(page({ ...finished, lastLookAt: 70 }, 80, {}, [askItem('i1')]).rows.some(r => r.kind === 'fold')).toBe(false)
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
    count: null,
    was: 'Import ready to demo',
    awaiting: 'Milestones after the next reply',
    milestones: [],
  })
  expect(page(met, 55).goal).toMatchObject({ label: 'Goal met', count: null, isMet: true, awaiting: null })
  expect(
    statusKeyRows(page(met, 55))
      .find(t => t.id === 'goal')
      ?.keys.map(k => k.label),
  ).toEqual(['Set next goal'])
})

test('an ask linked to a milestone names it as what it holds up, and milestones made with the goal draw as unchanged', () => {
  const o = { ...after(withGoal(), 'LINK: i1 | m3', 30, new Set(['i1'])), lastLookAt: 15 }
  const held = { ...emptySession(), ledger: { ...EMPTY, items: [askItem('i1')], overview: o } }
  const view = sessionView(held, 40, 0, true, NO_HOLDS)

  expect(allRows(view).find(r => r.id === 'i1')?.holdsUpLine).toBe('Holds up Demo script')
  expect(view.statusPage.goal?.milestones.map(m => m.isChanged)).toEqual([false, false, false])
  expect(
    page(after(o, 'SET: m2 | done | errors named', 50, new Set(['i1'])), 60, {}, [askItem('i1')]).goal?.milestones.map(
      m => m.isChanged,
    ),
  ).toEqual([false, true, false])
})

test('the look line that would end the main list gives way to the Other work rule', () => {
  const seen: SessionStatus = { ...linked(), serves: { s3: 'none', s4: 'none' }, lastLookAt: 35 }
  const changed = after(
    seen,
    'SET: s1 | working | bad rows named\nSET: s2 | queued | outline written',
    50,
    new Set(['i1']),
  )

  expect(shape(page(changed, 60, {}, [askItem('i1')]).rows)).toEqual([
    '◆ Error copy: outline written · waiting',
    '◐ CSV import: bad rows named',
    '== Other work',
    '● 1 working · ○ 1 queued',
  ])
})
