import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { withChild } from '../core/domain/status-children'
import { statusListRows } from '../core/view/status-folds'
import type { SessionStatus } from '../types'
import { after, askItem, MIN, page } from './status-helpers'

const START = [
  'HEAD: Import | Making CSV import ready to demo',
  'NEW: working | CSV import | bad rows skipped',
  'NEW: queued | Demo script | outline not started',
  'NEW: working | Dark mode | toggle drawn',
].join('\n')
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained; queued Demo script'

const started = (): SessionStatus => after(null, START, 10)
const withGoal = (): SessionStatus => after(started(), GOAL, 20)
const headPart = (o: SessionStatus) => page(o, 40).rows.find(r => r.kind === 'part' && r.id === 'head')

test('under a goal, the Now line hides while it holds every key word of a working subject’s name, and shows while it says more', () => {
  expect(page(withGoal(), 40).goal?.now).toBeNull()
  expect(page(after(withGoal(), 'HEAD: Import | Making the CSV ready to demo', 30), 40).goal?.now).toBe(
    'Now: Making the CSV ready to demo',
  )
  expect(page(after(withGoal(), 'HEAD: Import | Writing the demo script', 30), 40).goal?.now).toBe(
    'Now: Writing the demo script',
  )
})

test('under a goal, the Now line stays while the working subject it repeats is behind the open fold', () => {
  const more = ['Billing', 'Search', 'Exports', 'Onboarding', 'Settings']
  const grown = after(withGoal(), more.map(n => `NEW: working | ${n} | under way`).join('\n'), 30)
  const o: SessionStatus = {
    ...grown,
    lastLookAt: 50,
    subjects: grown.subjects.map(x => (x.id === 's1' ? { ...x, changedAt: 5 } : x)),
  }
  const p = page(o, 60)

  expect(statusListRows(p).map(r => r.id)).not.toContain('s1')
  expect(p.goal?.now).toBe('Now: Making CSV import ready to demo')
})

test('under a goal, the Now line hides while it repeats a working subject drawn in its milestone’s place', () => {
  const started = after(
    null,
    'HEAD: Architecture plan | Sorting hooks code into layered folders\nNEW: working | Hooks layers | moving files',
    10,
  )
  const goal = after(
    started,
    'GOAL: Architecture cleaned up | working Hooks layers moved; queued Session data split',
    20,
  )
  const p = page(after(goal, 'SERVES: s1 | m1', 30), 40)

  expect(p.goal?.milestones.find(m => m.subject !== null)).toMatchObject({ id: 's1', name: 'Hooks layers' })
  expect(p.goal?.now).toBeNull()
})

test('a milestone whose only subject is named alike, with no ask naming the milestone, draws the subject in its place with its name, text, ask and rows, and lists the subject among the page’s rows', () => {
  const linked = after(withGoal(), 'SERVES: s2 | m3\nLINK: i1 | s2', 30, new Set(['i1']))
  const child = {
    ref: 'draft',
    kind: 'subagent' as const,
    name: 'Draft script',
    startedAt: 32,
    endedAt: null,
    lastActivityAt: 10 * MIN,
  }
  const o = after(withChild(linked, child, 10 * MIN), 'LINK: c1 | s2', 33, new Set(['i1']))
  const p = page(o, 10 * MIN, {}, [askItem('i1')])
  const merged = p.goal?.milestones.find(m => m.subject !== null)

  expect(p.goal?.milestones.map(m => m.id)).toEqual(['m1', 'm2', 's2'])
  expect(merged).toMatchObject({
    id: 's2',
    name: 'Demo script',
    text: 'outline not started',
    ask: { id: 'i1', kind: 'question' },
    place: 'next',
    subject: { kind: 'subject', id: 's2' },
  })
  expect(merged?.rows).toMatchObject([{ kind: 'child', name: 'Draft script', branch: null }])
  expect(statusListRows(p).map(r => r.id)).toContain('s2')
})

test('a milestone keeps its own row when an ask names it, when two subjects serve it, a dropped one included, when its one subject is named otherwise, or when it is done while its subject is open', () => {
  const merges = (o: SessionStatus, asks: string[] = []) =>
    page(o, 40, {}, asks.map(askItem)).goal?.milestones.some(m => m.subject !== null)

  expect(merges(after(withGoal(), 'SERVES: s2 | m3', 30))).toBe(true)
  expect(merges(after(withGoal(), 'SERVES: s2 | m3\nLINK: i1 | m3', 30, new Set(['i1'])), ['i1'])).toBe(false)
  expect(merges(after(withGoal(), 'SERVES: s2 | m3\nSERVES: s3 | m3', 30))).toBe(false)
  expect(merges(after(withGoal(), 'SERVES: s2 | m3\nSERVES: s3 | m3\nDROP: s3 | not needed', 30))).toBe(false)
  expect(merges(after(withGoal(), 'SERVES: s3 | m3', 30))).toBe(false)
  expect(merges(after(withGoal(), 'SERVES: s2 | m3\nDONE: m3 | script approved', 30))).toBe(false)
  expect(merges(after(withGoal(), 'SERVES: s2 | m3\nDONE: s2 | script recorded', 30))).toBe(true)
})

test('with no goal and one open subject, named alike, the head drops its title and keeps its description, and keeps its title beside a second open subject or with a title named otherwise', () => {
  const alone = after(
    null,
    'HEAD: Import | Making CSV import ready to demo\nNEW: working | CSV import | bad rows skipped',
    10,
  )

  expect(headPart(alone)).toMatchObject({ text: null, description: 'Making CSV import ready to demo' })
  expect(headPart(after(alone, 'NEW: queued | Demo script | not started', 20))).toMatchObject({ text: 'Import' })
  expect(headPart(after(alone, 'HEAD: CSV export | Writing rows out', 20))).toMatchObject({ text: 'CSV export' })
})

test('with no goal and no other open subject, the head drops a title that names a finished subject drawn as a row, and keeps it once that subject folds', () => {
  const finished = after(
    after(null, 'HEAD: Import | Making CSV import ready\nNEW: working | CSV import | bad rows skipped', 10),
    'DONE: s1 | bad rows skipped',
    20,
  )
  const second = after(
    after(finished, 'HEAD: Dark mode | Drawing the toggle\nNEW: working | Dark mode | toggle drawn', 30),
    'DONE: s2 | toggle drawn',
    40,
  )
  const working = after(second, 'NEW: working | Search | index built', 50)

  const title = (o: SessionStatus) => {
    const row = headPart(o)
    return row?.kind === 'part' ? row.text : null
  }

  expect([finished, second, working].map(title)).toEqual(['Import', null, null])
  expect(title({ ...second, lastLookAt: 45 })).toBe('Dark mode')
})
