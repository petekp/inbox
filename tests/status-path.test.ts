import { expect, test } from 'claude-code/testing'

import { setTypedGoal } from '../hooks/status-goal-ops'
import { statusKeyRows } from '../hooks/status-keys'
import { statusListRows } from '../hooks/status-page'
import type { StatusRow } from '../hooks/status-page'
import { milestoneRows, workJoints } from '../hooks/status-path'
import { goalBlocks } from '../hooks/status-prompt-goal'
import type { SessionStatus } from '../types'
import { after, MIN, opsOf, page, shape } from './status-helpers'

const HOUR = 60 * MIN
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
  page(o, now).goal?.milestones.map(m => [m.name, m.place, m.word, m.line, m.startsLater])

test('a goal draws its milestones as one path: done, the one under way reading now, the first queued reading next, then the rest under Later with no line', () => {
  expect(path(planned(), 40)).toEqual([
    ['Parsing works', 'done', null, 'continues', false],
    ['Errors explained', 'now', 'now', 'to-next', false],
    ['Demo script', 'next', 'next', null, false],
    ['Docs page', 'later', null, null, true],
    ['Release notes', 'later', null, null, false],
  ])
  expect(page(planned(), 40).goal?.milestones.map(m => m.isMuted)).toEqual([false, false, false, true, true])
})

test('NEXT moves a queued milestone ahead of the other queued ones, so it reads next and the one it passed sits under Later, and its name draws bold until the person looks', () => {
  const replanned = after({ ...planned(), lastLookAt: 35 }, 'NEXT: m5', 40)
  const p = page(replanned, 45)

  expect(path(replanned, 45)?.slice(2)).toEqual([
    ['Release notes', 'next', 'next', null, false],
    ['Demo script', 'later', null, null, true],
    ['Docs page', 'later', null, null, false],
  ])
  expect(p.goal?.milestones.filter(m => m.isChanged).map(m => m.name)).toEqual(['Release notes'])
  expect(after(replanned, 'NEXT: m2', 50).milestones).toEqual(replanned.milestones)
})

test('a working milestone reads how long it has run once it has run an hour, in hours, then in days past two', () => {
  const word = (now: number) => page(planned(), now).goal?.milestones[1]?.word

  expect(word(20 + 59 * MIN)).toBe('now')
  expect(word(20 + 3 * HOUR)).toBe('now · 3h')
  expect(word(20 + 50 * HOUR)).toBe('now · 2d')
})

test('the goal leaves out its Now line when it only names the milestone that reads now, and keeps it when it says more', () => {
  const named = after(planned(), 'HEAD: Errors | Explaining errors', 40)
  const more = after(planned(), 'HEAD: Errors | Explaining errors in the import dialog', 40)

  expect(page(named, 45).goal?.now).toBeNull()
  expect(page(more, 45).goal?.now).toBe('Now: Explaining errors in the import dialog')
})

test('a done milestone the person has seen, with its work seen and finished, folds to its name with its work behind the fold', () => {
  const finished = after(after(planned(), 'SERVES: s3 | m1', 40), 'DONE: s3 | swapped', 50)
  const fresh = page({ ...finished, lastLookAt: 45 }, 60).goal?.milestones[0]
  const seen = page({ ...finished, lastLookAt: 70 }, 80)
  const m1 = seen.goal?.milestones[0]

  expect(fresh).toMatchObject({ foldId: null, isMuted: false })
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

test('a milestone under Later shows only the work that cannot fold, and counts the rest', () => {
  const p = page({ ...planned(), lastLookAt: 40 }, 50)
  const docs = p.goal?.milestones.find(m => m.name === 'Docs page')

  expect(docs?.rows.map(r => r.kind)).toEqual(['fold'])
  expect(docs?.rows[0]).toMatchObject({ text: '2 more' })
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

test('the answer that reads a typed goal orders its milestones as its MILESTONE lines name them, then as its NEXT line says', () => {
  const typed = setTypedGoal(planned(), 'Demo on Friday', 40)
  const named = 'MILESTONE: queued | Demo script | not started\nMILESTONE: done | Parsing works | parsed'
  const withNext = `${named}\nMILESTONE: queued | Room booked | not started\nNEXT: Room booked`

  expect(after(typed, named, 50).milestones.map(m => m.name)).toEqual(['Demo script', 'Parsing works'])
  expect(after(typed, withNext, 50).milestones.map(m => m.name)).toEqual([
    'Room booked',
    'Demo script',
    'Parsing works',
  ])
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
