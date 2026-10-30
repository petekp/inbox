import { expect, test } from 'claude-code/testing'

import {
  applyOps,
  childActive,
  childEnded,
  lookEnded,
  lookStarted,
  LOOK_MIN_MS,
  runningText,
  subjectsText,
  withChild,
} from '../hooks/status'
import { delegatesSettled, delegatesStarted } from '../hooks/children'
import type { HerdrStatus } from '../hooks/herdr'
import { CHILD_ROWS } from '../hooks/view'
import type { SessionStatus } from '../types'
import { MIN, opsOf, NO_ASKS, after, askItem, page, shape } from './status-helpers'

test('the call reads open subjects with ids, finished ones by name, and running children with their links', () => {
  const o = withChild(
    after(null, 'NEW: working | Offline mode | queue built\nNEW: queued | Docs | not started', 100),
    { ref: 't1', kind: 'background', name: 'npm test', startedAt: 150, endedAt: null, lastActivityAt: 150 },
    150,
  )
  const closed = after(o, 'DONE: s2 | written', 200)

  expect(subjectsText(closed)).toEqual({
    open: 's1 | working | Offline mode | queue built',
    finished: 's2 | done | Docs',
  })
  expect(subjectsText(null).open).toBe('(none yet)')
  expect(runningText(closed, 300)).toBe('c1 | background | npm test | -')
  expect(runningText(childEnded(closed, 't1', 250), 300)).toBe('')
})

test('a child the host reports again keeps its id and link, and old ended children are let go', () => {
  const report = {
    ref: 'herdr:docs',
    kind: 'delegate' as const,
    name: 'delegate docs',
    startedAt: 10,
    endedAt: null,
    lastActivityAt: null,
  }
  const linked = after(
    after(withChild(null, report, 10), 'NEW: working | Docs | being written', 20),
    'LINK: c1 | s1',
    30,
  )
  const ended = childEnded(linked, 'herdr:docs', 40)!
  const again = withChild(ended, { ...report, startedAt: 50 }, 50)

  expect(again.children).toEqual([{ ...report, id: 'c1', subjectId: 's1', startedAt: 50, delegateState: null }])
  expect(childActive(again, 'herdr:docs', 60)!.children[0]?.lastActivityAt).toBe(60)
  const later = withChild(ended, { ...report, ref: 't9', name: 'npm test' }, 40 + 25 * 60 * MIN)
  expect(later.children.map(c => c.ref)).toEqual(['t9'])
})

test('running children sit under their subject, at most three, each tied to it and the last ending its tree, and one with no recent activity still moves and shows no words, as its subject does', () => {
  const now = 100 * MIN
  let o = after(null, 'NEW: working | Offline mode | queue built', 10 * MIN)
  for (const [n, idle] of [0, 1, 2, 3, 20].entries())
    o = withChild(
      o,
      {
        ref: `t${n}`,
        kind: 'subagent',
        name: `Review ${n}`,
        startedAt: 50 * MIN,
        endedAt: null,
        lastActivityAt: now - idle * MIN,
      },
      now,
    )
  o = after(o, ['c1', 'c2', 'c3', 'c4', 'c5'].map(c => `LINK: ${c} | s1`).join('\n'), 50 * MIN)
  const rows = page(o, now).rows

  expect(shape(rows)).toEqual([
    '● Offline mode: queue built ┐',
    '├ ● Review 0',
    '├ ● Review 1',
    '├ ● Review 2',
    `└ + 2 more running`,
  ])
  const two = ['t2', 't3', 't4'].reduce<SessionStatus | null>((x, ref) => childEnded(x, ref, now - MIN), o)
  expect(shape(page(two, now).rows)).toEqual(['● Offline mode: queue built ┐', '├ ● Review 0', '└ ● Review 1'])
  expect(rows.filter(r => r.kind === 'child')).toHaveLength(CHILD_ROWS)
  expect(rows[0]).toMatchObject({ kind: 'subject', isRunning: true })
  const quiet = withChild(
    after(null, 'NEW: working | Offline mode | queue built', 10 * MIN),
    {
      ref: 'q',
      kind: 'background',
      name: 'Tail the log',
      startedAt: 0,
      endedAt: null,
      lastActivityAt: now - 2 * 60 * MIN,
    },
    now,
  )
  expect(page(quiet, now).rows[0]).toMatchObject({ kind: 'child', branch: null, isRunning: true, stall: null })
  expect(page(after(quiet, 'LINK: c1 | s1', now), now).rows[0]).toMatchObject({
    kind: 'subject',
    isRunning: true,
    hasChildren: true,
  })
})

test('a delegate says what Herdr shows: nothing while it works, waiting while blocked, and finished from when it is ready until the person has looked, its subject moved above the Seen line, and one Herdr no longer lists leaves', () => {
  let o: SessionStatus | null = {
    ...after(null, 'NEW: working | Export | layout next', 10 * MIN),
    lastLookAt: 20 * MIN,
  }
  o = delegatesStarted(o, 'herdr agent prompt pdf "lay out the export"', 30 * MIN)
  o = delegatesStarted(o, 'herdr agent start spare --cmd claude', 30 * MIN)
  o = after(o, 'LINK: c1 | s1\nLINK: c2 | s1', 30 * MIN)
  const herdr = (pdf: HerdrStatus) =>
    new Map<string, HerdrStatus>([
      ['pdf', pdf],
      ['spare', 'idle'],
    ])
  const rows = (x: SessionStatus | null, now: number) => shape(page(x, now).rows)

  expect(rows(delegatesSettled(o, herdr('idle'), 30 * MIN + 10_000), 31 * MIN)).toEqual([
    '● Export: layout next ┐',
    '├ ● pdf',
    '└ ● spare',
  ])
  const working = delegatesSettled(o, herdr('working'), 2 * 60 * MIN)
  expect(rows(working, 2 * 60 * MIN)).toEqual(['● Export: layout next ┐', '└ ● pdf'])
  expect(page(working, 2 * 60 * MIN).rows[1]).toMatchObject({ isRunning: true, stall: null })
  expect(delegatesSettled(working, herdr('unknown'), 3 * 60 * MIN)).toBe(working)
  const blocked = delegatesSettled(working, herdr('blocked'), 3 * 60 * MIN)
  expect(page(blocked, 3 * 60 * MIN).rows[1]).toMatchObject({
    mark: '◆',
    tone: 'needsYou',
    isRunning: false,
    stall: { text: 'waiting', tone: 'needsYou' },
  })
  const finished = delegatesSettled(blocked, herdr('done'), 4 * 60 * MIN)
  expect(page(finished, 4 * 60 * MIN).rows).toMatchObject([
    { kind: 'subject', isRunning: false },
    { kind: 'child', mark: '✓', tone: 'done', stall: { text: 'finished', tone: 'done' }, isLast: false },
    { kind: 'look', isLast: true },
  ])
  const looked = lookEnded(lookStarted(finished, 5 * 60 * MIN), 5 * 60 * MIN + LOOK_MIN_MS)
  expect(rows(looked, 6 * 60 * MIN)).toEqual(['● Export: layout next'])
  const gone = delegatesSettled(blocked, new Map(), 4 * 60 * MIN)
  expect(rows(gone, 4 * 60 * MIN)).toEqual(['● Export: layout next'])
})

test('a rule sets each item on the page apart: a subject and the rows under it are one item, and the look line takes none beside it', () => {
  const now = 100 * MIN
  let o = after(after(null, 'NEW: working | Fade-out | glances fade', 0), 'DONE: s1 | glances fade', 5 * MIN)
  o = after(o, 'NEW: queued | Docs | outline ready', 10 * MIN)
  o = after(o, 'NEW: working | Offline mode | queue built', 60 * MIN)
  o = after(o, 'NEW: working | Sync | needs a pick\nLINK: i1 | Sync', 70 * MIN, new Set(['i1']))
  for (const ref of ['r1', 'r2', 'loose'])
    o = withChild(
      o,
      { ref, kind: 'subagent', name: `Review ${ref}`, startedAt: 80 * MIN, endedAt: null, lastActivityAt: now - MIN },
      now,
    )
  o = after(o, 'LINK: c1 | s3\nLINK: c2 | s3', 80 * MIN, new Set(['i1']))
  const rows = page({ ...o, lastLookAt: 50 * MIN }, now, {}, [askItem('i1')]).rows

  expect(rows.map(r => `${r.isRuledAbove ? '── ' : ''}${shape([r])[0]}`)).toEqual([
    '● Review loose',
    '── ◆ Sync: needs a pick · waiting',
    '── ● Offline mode: queue built ┐',
    '├ ● Review r1',
    '└ ● Review r2',
    '-- Last seen',
    '○ Docs: outline ready',
    '── ✓ 1 done',
  ])
})

test('a child whose host reports no activity moves and shows no words for as long as it runs', () => {
  const now = 100 * MIN
  const o = withChild(
    null,
    { ref: 'bg', kind: 'background', name: 'npm test', startedAt: 40 * MIN, endedAt: null, lastActivityAt: null },
    now,
  )

  expect(page(o, 50 * MIN).rows[0]).toMatchObject({ kind: 'child', stall: null, isRunning: true })
  expect(page(o, now).rows[0]).toMatchObject({ kind: 'child', stall: null, isRunning: true, branch: null })
})

test('open subjects past seven fold their oldest queued ones into a count', () => {
  const lines = Array.from({ length: 9 }, (_, n) => `NEW: ${n < 3 ? 'queued' : 'working'} | Part ${n} | step ${n}`)
  const o = applyOps(
    null,
    lines.map(l => opsOf(l)[0]!),
    0,
    NO_ASKS,
  )
  const rows = page(o, MIN).rows
  const heldOldest = page(after(o, 'LINK: i1 | s1', 0, new Set(['i1'])), MIN, {}, [askItem('i1')]).rows

  expect(rows.filter(r => r.kind === 'subject')).toHaveLength(7)
  expect(rows.at(-1)).toMatchObject({ kind: 'fold', text: '2 more queued' })
  expect(shape(heldOldest)).toEqual([
    '◆ Part 0: step 0 · waiting',
    ...[3, 4, 5, 6, 7, 8].map(n => `● Part ${n}: step ${n}`),
    '○ 2 more queued',
  ])
})
