import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { allRows } from '../hooks/rows'
import { emptySession } from '../hooks/session-files'
import { sessionView } from '../hooks/session-view'
import { withChild } from '../hooks/status-children'
import { setTypedGoal } from '../hooks/status-goal-ops'
import { statusKeyRows } from '../hooks/status-keys'
import { unfoldedRows } from '../hooks/status-page-parts'
import { NO_HOLDS } from '../hooks/timing'
import type { StatusRow } from '../hooks/status-page'
import type { SessionStatus } from '../types'
import { after, askItem, page, shape } from './status-helpers'

const START = [
  'HEAD: Import | Making CSV import ready to demo',
  'NEW: working | CSV import | bad rows skipped',
  'NEW: queued | Error copy | not started',
  'NEW: working | Dark mode | toggle drawn',
  'NEW: queued | Logo refresh | not started',
].join('\n')
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained; queued Demo script'

const withGoal = (): SessionStatus => after(after(null, START, 10), GOAL, 20)

const linked = (): SessionStatus =>
  after(
    withGoal(),
    'SERVES: s1 | m2\nSERVES: s2 | m2\nSERVES: s3 | -\nSERVES: s4 | -\nLINK: i1 | s2',
    30,
    new Set(['i1']),
  )

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
    ['goal', ['Edit', 'Remove']],
    ['m2', ['View question']],
    ['s2', ['View question']],
  ])
})

test('work that serves a milestone draws under it one step in, and work the goal does not need sits under Other work, where seen rows fold into a count of working and waiting work and seen queued work gets none', () => {
  const seen = { ...linked(), lastLookAt: 35 }
  const changed = after(seen, 'SET: s4 | working | new logo drawn', 50, new Set(['i1']))
  const p = page(seen, 40, {}, [askItem('i1')])

  expect(p.goal?.milestones.map(m => shape(m.rows))).toEqual([
    [],
    ['◆ Error copy: not started · waiting', '◐ CSV import: bad rows skipped'],
    [],
  ])
  expect(shape(p.rows)).toEqual(['== Other work', '● 1 working'])
  expect(shape(page(changed, 60, {}, [askItem('i1')]).rows)).toEqual([
    '== Other work',
    '◐ Logo refresh: new logo drawn',
    '● 1 working',
  ])
})

test('finished work under a milestone shows as a row until the person looks, then folds into the milestone’s count', () => {
  const finished = after({ ...linked(), lastLookAt: 35 }, 'DONE: s1 | import ships', 50, new Set(['i1']))
  const rowsOf = (o: SessionStatus) => page(o, 80, {}, [askItem('i1')]).goal?.milestones[1]?.rows ?? []

  expect(shape(rowsOf(finished))).toEqual(['◆ Error copy: not started · waiting', '✓ CSV import: import ships'])
  expect(shape(rowsOf({ ...finished, lastLookAt: 70 }))).toEqual(['◆ Error copy: not started · waiting', '▸ 1 done'])
  expect(shape(unfoldedRows(rowsOf({ ...finished, lastLookAt: 70 }), () => true))).toEqual([
    '◆ Error copy: not started · waiting',
    '▸ 1 done',
    '✓ CSV import',
  ])
  expect(unfoldedRows(rowsOf({ ...finished, lastLookAt: 70 }), () => true).map(r => r.depth)).toEqual([1, 1, 2])
  expect(
    page({ ...finished, lastLookAt: 70 }, 80, {}, [askItem('i1')]).rows.some(
      r => r.kind === 'fold' || r.kind === 'done-fold',
    ),
  ).toBe(false)
})

test('under a milestone and under Other work, closed work past two rows that the person has not seen is named in a fold after them', () => {
  const more = after(
    { ...linked(), lastLookAt: 35 },
    [
      'NEW: working | Parser | x',
      'NEW: working | Sniffer | x',
      'NEW: working | Fonts | x',
      'NEW: working | Icons | x',
      'SERVES: s5 | m2',
      'SERVES: s6 | m2',
      'SERVES: s7 | -',
      'SERVES: s8 | -',
    ].join('\n'),
    40,
    new Set(['i1']),
  )
  const closed = [
    'DROP: s8 | not needed',
    'DONE: s1 | import ships',
    'DONE: s5 | parses',
    'DONE: s6 | sniffs',
    'DONE: s3 | toggle ships',
    'DONE: s4 | logo ships',
    'DONE: s7 | fonts ship',
  ].reduce((o, line, n) => after(o, line, 46 + 2 * n, new Set(['i1'])), more)
  const p = page(closed, 80, {}, [askItem('i1')])

  expect(shape(p.goal?.milestones[1]?.rows ?? [])).toEqual([
    '◆ Error copy: not started · waiting',
    '✓ Sniffer: sniffs',
    '✓ Parser: parses',
    '✓ Also done: CSV import',
  ])
  expect(shape(p.rows)).toEqual([
    '== Other work',
    '✓ Fonts: fonts ship',
    '✓ Logo refresh: logo ships',
    '✓ Also done: Dark mode',
    '✗ Also dropped: Icons',
  ])
})

test('while the goal shows milestones, a subject linked to none of them draws under Other work; while it shows none, the subject stays above Other work; and without a goal nothing splits', () => {
  const unlinked = { ...after(withGoal(), 'SERVES: s1 | m2', 30), lastLookAt: 5 }
  const typed = { ...setTypedGoal(after(null, START, 10), 'Ship 2.6', 15), serves: { s3: 'none' }, lastLookAt: 5 }
  const noGoal = { ...after(null, START, 10), serves: { s3: 'none' }, lastLookAt: 25 }
  const subjectIds = (rows: StatusRow[]) => rows.flatMap(r => (r.kind === 'subject' ? [r.id] : []))

  expect(subjectIds(page(unlinked, 40).goal!.milestones[1]!.rows)).toEqual(['s1'])
  expect(page(unlinked, 40).rows[0]!.kind).toBe('part')
  expect(subjectIds(page(unlinked, 40).rows).sort()).toEqual(['s2', 's3', 's4'])
  expect(shape(page(typed, 20).rows).filter(l => !l.startsWith('▸'))).toEqual([
    '◐ CSV import: bad rows skipped',
    '○ Error copy: not started',
    '○ Logo refresh: not started',
    '== Other work',
    '◐ Dark mode: toggle drawn',
  ])
  expect(page(noGoal, 30).rows.some(r => r.kind === 'part')).toBe(false)
})

test('under Other work, a queued subject an ask holds up stays a row, seen queued work the goal needs folds as it did above Other work, and seen queued work the goal does not need leaves the page with no count', () => {
  const held = after(
    after(
      withGoal(),
      'SERVES: s1 | m2\nSERVES: s3 | m2\nSERVES: s4 | -\nLINK: i1 | s4\nLINK: i2 | s2',
      30,
      new Set(['i1', 'i2']),
    ),
    'NEW: queued | Release notes | not started\nNEW: queued | Sticker sheet | not started\nSERVES: s6 | -',
    32,
    new Set(['i1', 'i2']),
  )
  const asks = [askItem('i1'), askItem('i2')]

  expect(shape(page({ ...held, lastLookAt: 40 }, 45, {}, asks).rows)).toEqual([
    '== Other work',
    '◆ Error copy: not started · waiting',
    '◆ Logo refresh: not started · waiting',
    '○ Release notes: not started',
  ])
  expect(shape(page({ ...held, lastLookAt: 40 }, 45).rows)).toEqual([
    '== Other work',
    '○ Release notes: not started',
    '○ Error copy: not started',
  ])
})

test('running work draws with the milestone its subject serves, also when the subject sits in its done fold, and running work linked to no subject starts Other work', () => {
  const MIN = 60_000
  let o = after(after(withGoal(), 'SERVES: s1 | m2', 30), 'DONE: s1 | bad rows skipped', 31)
  for (const ref of ['review', 'loose'])
    o = withChild(
      o,
      { ref, kind: 'subagent', name: `Check ${ref}`, startedAt: 32, endedAt: null, lastActivityAt: 10 * MIN },
      10 * MIN,
    )
  const p = page({ ...after(o, 'LINK: c1 | s1', 33), lastLookAt: 40 }, 10 * MIN)
  const m2 = p.goal?.milestones.find(m => m.id === 'm2')

  expect(m2?.rows[0]).toMatchObject({ kind: 'child', name: 'Check review', depth: 1, branch: null })
  expect(m2?.rows.map(r => r.kind)).toEqual(['child', 'done-fold'])
  expect(p.rows.slice(0, 2)).toMatchObject([
    { kind: 'part', text: 'Other work' },
    { kind: 'child', name: 'Check loose', depth: 0, branch: null },
  ])
  expect(p.rows.filter(r => r.kind === 'child')).toHaveLength(1)
})

test('a typed goal waits for its milestones, and a goal whose milestones are all done reads met', () => {
  const typed = setTypedGoal(linked(), 'Ship 2.6 with import', 45)
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
  ).toEqual(['New', 'Remove'])
})

test('an ask linked to a milestone names it as what it holds up, and a milestone shows its was line only once it changed after the goal was set and since the last look', () => {
  const o = { ...after(withGoal(), 'LINK: i1 | m3', 30, new Set(['i1'])), lastLookAt: 15 }
  const held = { ...emptySession(), ledger: { ...EMPTY, items: [askItem('i1')], overview: o } }
  const view = sessionView(held, 40, 0, NO_HOLDS)
  const wasOf = (x: SessionStatus) => page(x, 60, {}, [askItem('i1')]).goal?.milestones.map(m => m.was)

  expect(allRows(view).find(r => r.id === 'i1')?.holdsUpLine).toBe('Holds up Demo script')
  expect(wasOf({ ...after(withGoal(), 'WAS: m2 | demo by hand', 20), lastLookAt: 15 })).toEqual([null, null, null])
  const changed = after(o, 'WAS: m2 | demo by hand', 50, new Set(['i1']))
  expect(wasOf(changed)).toEqual([null, 'demo by hand', null])
  expect(wasOf({ ...changed, lastLookAt: 55 })).toEqual([null, null, null])
})
