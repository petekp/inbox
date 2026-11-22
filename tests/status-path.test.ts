import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { lastProgressAt } from '../core/domain/status-goal-gate'
import { setTypedGoal } from '../core/domain/status-goal-ops'
import { statusKeyRows } from '../core/view/status-keys'
import { statusListRows } from '../core/view/status-folds'
import type { StatusRow } from '../core/view/status-page'
import { milestoneRows } from '../core/view/status-folds'
import { workJoints } from '../core/view/status-path'
import { goalBlocks } from '../core/domain/status-prompt-goal'
import { MILESTONE_SUBJECTS } from '../core/domain/status-limits'
import type { SessionStatus } from '../types'
import { after, opsOf, page, shape } from './status-helpers'

const START = [
  'HEAD: Import | Making CSV import ready to demo',
  'NEW: working | CSV import | bad rows skipped',
  'NEW: queued | Error copy | not started',
  'NEW: queued | Logo refresh | not started',
].join('\n')
const GOAL =
  'GOAL: Import ready to demo | done Parsing works; working Errors explained; queued Demo script; queued Docs page; queued Release notes'

const planned = (): SessionStatus =>
  after(after(after(null, START, 10), GOAL, 20), 'SERVES: s1 | m2\nSERVES: s2 | m4\nSERVES: s3 | m4', 30)

const path = (o: SessionStatus, now: number) =>
  page(o, now).goal?.milestones.map(m => [m.name, m.place, m.line, m.startsLater])

test('a goal draws its milestones as one path: done, the one under way, the first queued one next, then the rest under Later with no line', () => {
  expect(path(planned(), 40)).toEqual([
    ['Parsing works', 'done', 'continues', false],
    ['Errors explained', 'now', 'to-next', false],
    ['Demo script', 'next', null, false],
    ['Docs page', 'later', null, true],
    ['Release notes', 'later', null, false],
  ])
  expect(page(planned(), 40).goal?.milestones.map(m => m.isMuted)).toEqual([true, false, false, true, true])
  expect(page(planned(), 40).goal?.milestones.map(m => m.isBold)).toEqual([false, true, true, true, true])
})

test('NEXT moves a queued milestone ahead of the other queued ones, so it reads next and the one it passed sits under Later, and every milestone not done draws bold', () => {
  const replanned = after({ ...planned(), lastLookAt: 35 }, 'NEXT: m5', 40)
  const p = page(replanned, 45)

  expect(path(replanned, 45)?.slice(2)).toEqual([
    ['Release notes', 'next', null, false],
    ['Demo script', 'later', null, true],
    ['Docs page', 'later', null, false],
  ])
  expect(p.goal?.milestones.map(m => [m.name, m.isBold])).toEqual([
    ['Parsing works', false],
    ['Errors explained', true],
    ['Release notes', true],
    ['Demo script', true],
    ['Docs page', true],
  ])
  expect(after(replanned, 'NEXT: m2', 50).milestones).toEqual(replanned.milestones)
})

test('NEXT marks the milestone it moves changed, but counts as no progress on the goal and brings back no was line the person has seen', () => {
  const seen = { ...after(planned(), 'WAS: m5 | after the docs', 40), lastLookAt: 45 }
  const moved = after(seen, 'NEXT: m5', 50)

  expect(page(moved, 55).goal?.milestones.find(m => m.name === 'Release notes')).toMatchObject({
    place: 'next',
    isBold: true,
    was: null,
  })
  expect(lastProgressAt(moved, moved.goal!)).toBe(lastProgressAt(seen, seen.goal!))
})

test('with nothing under Later, a dropped milestone follows the path with no Later label', () => {
  const dropped = after({ ...planned(), lastLookAt: 35 }, 'DROP: m4 | not needed\nDROP: m5 | not needed', 40)

  expect(path(dropped, 45)?.slice(3)).toEqual([
    ['Docs page', 'dropped', null, false],
    ['Release notes', 'dropped', null, false],
  ])
})

test('the goal leaves out its Now line when it only names the milestone that reads now, and keeps it when it says more', () => {
  const named = after(planned(), 'HEAD: Errors | Explaining errors', 40)
  const more = after(planned(), 'HEAD: Errors | Explaining errors in the import dialog', 40)

  expect(page(named, 45).goal?.now).toBeNull()
  expect(page(more, 45).goal?.now).toBe('Now: Explaining errors in the import dialog')
  expect(page(setTypedGoal(named, 'Demo on Friday', 50), 55).goal?.now).toBe('Now: Explaining errors')
})

test('a done milestone the person has seen, with its work seen and finished, folds to its name with its work behind the fold', () => {
  const finished = after(after(planned(), 'SERVES: s3 | m1', 40), 'DONE: s3 | swapped', 50)
  const fresh = page({ ...finished, lastLookAt: 45 }, 60).goal?.milestones[0]
  const seen = page({ ...finished, lastLookAt: 70 }, 80)
  const m1 = seen.goal?.milestones[0]

  expect(fresh).toMatchObject({ foldId: null, isMuted: true, isBold: false })
  expect(m1).toMatchObject({ name: 'Parsing works', foldId: 'm1-done', text: null, isMuted: true })
  expect(milestoneRows(m1!, () => false)).toEqual([])
  expect(shape(milestoneRows(m1!, () => true))).toEqual(['✓ Logo refresh'])
  expect(statusListRows(seen).some(r => r.id === 's3')).toBe(false)
  expect(
    statusKeyRows(seen)
      .find(t => t.id === 'm1')
      ?.keys.map(k => k.press),
  ).toEqual([{ action: 'toggle-fold', foldId: 'm1-done' }])
})

test('a milestone under Later shows only the work that cannot fold, and counts the rest, which take none of the open rows the page shows', () => {
  const p = page({ ...planned(), lastLookAt: 40 }, 50)
  const docs = p.goal?.milestones.find(m => m.name === 'Docs page')
  const tasks = ['a', 'b', 'c', 'd', 'e'].map(
    n => `NEW: working | Task ${n} | going\nSERVES: s${n.charCodeAt(0) - 93} | m2`,
  )
  const busy = after(planned(), tasks.join('\n'), 40)
  const later = after(busy, ['x', 'y', 'z'].map(n => `NEW: queued | Later ${n} | not started`).join('\n'), 50)
  const linked = after(later, 'SERVES: s9 | m4\nSERVES: s10 | m4\nSERVES: s11 | m4', 60)
  const errors = page({ ...linked, lastLookAt: 70 }, 80).goal?.milestones.find(m => m.name === 'Errors explained')

  expect(docs?.rows.map(r => r.kind)).toEqual(['fold'])
  expect(docs?.rows[0]).toMatchObject({ text: '2 more' })
  expect(errors?.rows.map(r => r.kind)).toEqual(Array(6).fill('subject'))
})

test('NEXT names a milestone by id or by name, and the call reads the queued milestone that comes next, except while a typed goal waits for its milestones', () => {
  const blocks = goalBlocks(planned(), 40).join('\n')

  expect(opsOf('NEXT: m5\nNEXT: Release notes')).toEqual([
    { kind: 'next', ref: 'm5' },
    { kind: 'next', ref: 'Release notes' },
  ])
  expect(path(after(planned(), 'NEXT: Release notes', 40), 45)?.[2]?.[0]).toBe('Release notes')
  expect(blocks).toMatch(/m3 \| queued \| Demo script \| - \| next \| no work linked\n/)
  expect(blocks).toMatch(/m4 \| queued \| Docs page \| -\n/)
  expect(goalBlocks(setTypedGoal(planned(), 'Demo on Friday', 40), 45).join('\n')).not.toMatch(/\| next/)
})

test('a milestone more than MILESTONE_SUBJECTS subjects serve, two or more open, reads too big while the goal has room, and MILESTONE, SERVES and DONE lines split it, moving its open work and keeping its done work', () => {
  const names = [
    'Help indent',
    'Mark colors',
    'Help icon',
    'Row bar',
    'Desktop margin',
    'Goal row',
    'Fold count',
    'Sidebar line',
  ]
  const work = names.map(n => `NEW: working | ${n} | going`).join('\n')
  const goal = 'GOAL: Inbox 2.0 shipped | working Fixes merged; queued Release built'
  const linked = after(
    after(null, work, 10),
    `${goal}\n${names.map((_, n) => `SERVES: s${n + 1} | m1`).join('\n')}`,
    20,
  )
  const busy = after(linked, ['s1', 's2', 's3', 's4', 's5'].map(id => `DONE: ${id} | merged`).join('\n'), 30)
  const split = [
    'MILESTONE: working | Status page polish | going',
    'MILESTONE: queued | Herdr drawing fixed | not started',
    'SERVES: s6 | Status page polish',
    'SERVES: s7 | Status page polish',
    'SERVES: s8 | Herdr drawing fixed',
    'DONE: m1 | first fixes merged',
  ].join('\n')
  const done = after(busy, split, 40)

  expect(names.length).toBeGreaterThan(MILESTONE_SUBJECTS)
  const marks = (o: SessionStatus) => goalBlocks(o, 45).join('\n')
  const oneOpen = after(busy, 'DONE: s6 | merged\nDONE: s7 | merged', 35)
  const full = after(busy, ['A', 'B', 'C'].map(n => `MILESTONE: queued | Part ${n} | not started`).join('\n'), 35)
  const waiting = { ...busy, goal: { ...busy.goal!, isAwaitingMilestones: true } }

  expect(marks(busy)).toMatch(/m1 \| working \| Fixes merged \| - \| too big, 8 subjects, room for 3\n/)
  expect([oneOpen, full, waiting].map(o => marks(o).includes('too big'))).toEqual([false, false, false])
  expect(done.milestones.map(m => [m.name, m.status])).toEqual([
    ['Fixes merged', 'done'],
    ['Release built', 'queued'],
    ['Status page polish', 'working'],
    ['Herdr drawing fixed', 'working'],
  ])
  expect(done.serves).toEqual({ s1: 'm1', s2: 'm1', s3: 'm1', s4: 'm1', s5: 'm1', s6: 'm3', s7: 'm3', s8: 'm4' })
  expect(goalBlocks(done, 45).join('\n')).not.toMatch(/too big/)
})

test('the answer that reads a typed goal orders its milestones as its MILESTONE lines name them, then as its NEXT line says', () => {
  const typed = setTypedGoal(planned(), 'Demo on Friday', 40)
  const named = 'MILESTONE: queued | Demo script | not started\nMILESTONE: done | Parsing works | parsed'
  const withNext = `${named}\nMILESTONE: queued | Room booked | not started\nNEXT: Room booked`
  const withSet = 'MILESTONE: queued | Room booked | not started\nSET: m3 | queued | script drafted'

  expect(after(typed, named, 50).milestones.map(m => m.name)).toEqual(['Demo script', 'Parsing works'])
  expect(after(typed, withNext, 50).milestones.map(m => m.name)).toEqual([
    'Room booked',
    'Demo script',
    'Parsing works',
  ])
  expect(after(typed, withSet, 50).milestones.map(m => m.name)).toEqual(['Room booked', 'Demo script'])
})

test('a milestone’s work joins its mark column: the connector runs past each row to an elbow at its last row one step in, and where the path’s line runs on, every row one step in branches off it', () => {
  const rows = [1, 2, 2, 1, 2].map(depth => ({ depth }) as StatusRow)
  expect(workJoints(rows, null)).toEqual([
    { arm: 'tee', beside: 'connector' },
    { arm: null, beside: 'connector' },
    { arm: null, beside: 'connector' },
    { arm: 'elbow', beside: null },
    { arm: null, beside: null },
  ])
  expect(workJoints(rows, 'to-next')).toEqual([
    { arm: 'tee', beside: 'to-next' },
    { arm: null, beside: 'to-next' },
    { arm: null, beside: 'to-next' },
    { arm: 'tee', beside: 'to-next' },
    { arm: null, beside: 'to-next' },
  ])
})
