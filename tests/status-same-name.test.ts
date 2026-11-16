import { expect, test } from 'claude-code/testing'

import type { Child } from '../types'
import { MIN, after, askItem, page } from './status-helpers'

const sameNamedDelegate = (name: string, state: Child['delegateState'], endedAt: number | null): Child => ({
  id: 'c1',
  ref: 'herdr:help',
  kind: 'delegate',
  name,
  subjectId: 's1',
  startedAt: 10 * MIN,
  endedAt,
  lastActivityAt: 20 * MIN,
  delegateState: state,
})

const withSoleChild = (c: Child, now = 30 * MIN) => ({
  ...after(null, 'NEW: working | Help icon | drawn', 10 * MIN),
  lastLookAt: 5 * MIN,
  children: [c],
  lastCallReadAt: now,
})

test('a sole child named like its subject draws no row, and its state shows on the subject: moving, needs-you mark, finished', () => {
  const now = 30 * MIN
  const working = page(withSoleChild(sameNamedDelegate('help_icon', null, null)), now).rows
  expect(working).toMatchObject([{ kind: 'subject', mark: '●', isRunning: true, hasChildren: false, stall: null }])
  expect(working).toHaveLength(1)

  const blocked = page(withSoleChild(sameNamedDelegate('Help  icon', 'blocked', null)), now).rows
  expect(blocked).toMatchObject([{ kind: 'subject', mark: '◆', tone: 'needsYou', isRunning: false, stall: null }])

  const finished = page(withSoleChild(sameNamedDelegate('help-icon', 'finished', 25 * MIN)), now).rows
  expect(finished).toMatchObject([{ kind: 'subject', mark: '✓', tone: 'done', isRunning: false, hasChildren: false }])

  const held = page(
    after(
      withSoleChild(sameNamedDelegate('help icon', 'finished', 25 * MIN)),
      'LINK: i1 | s1',
      28 * MIN,
      new Set(['i1']),
    ),
    now,
    {},
    [askItem('i1')],
  ).rows
  expect(held).toMatchObject([{ kind: 'subject', mark: '◆', stall: null, waitsOn: 'Ask i1?', hasChildren: false }])
})

test('a child with another name, or one of several children, keeps its row', () => {
  const now = 30 * MIN
  expect(page(withSoleChild(sameNamedDelegate('draw it', null, null)), now).rows.map(r => r.kind)).toEqual([
    'subject',
    'child',
  ])
  const two = { ...withSoleChild(sameNamedDelegate('help icon', null, null)) }
  two.children = [...two.children, { ...two.children[0]!, id: 'c2', ref: 'herdr:other' }]
  expect(page(two, now).rows.map(r => r.kind)).toEqual(['subject', 'child', 'child'])
})

test('a subject an open ask holds up says what it waits on, in the ask own words on one line, and keeps its ask button target', () => {
  const o = after(
    after(null, 'NEW: working | Release | cut 0.2.0', 10 * MIN),
    'LINK: i1 | s1\nLINK: i2 | s1',
    11 * MIN,
    new Set(['i1', 'i2']),
  )
  const items = [
    { ...askItem('i2'), ask: 'later one', at: 300 },
    { ...askItem('i1'), kind: 'task' as const, ask: 'Approve\n  the   store listing', at: 200 },
  ]
  const [row] = page(o, 20 * MIN, {}, items).rows

  expect(row).toMatchObject({ waitsOn: 'Approve the store listing', stall: null, ask: { id: 'i1', kind: 'task' } })
})
