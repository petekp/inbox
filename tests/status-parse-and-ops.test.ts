import { expect, test } from 'claude-code/testing'

import { parseStatus } from '../hooks/status'
import { lookEnded, lookStarted, LOOK_MIN_MS, withChild } from '../hooks/status-children'
import { applyOps, applyStatus } from '../hooks/status-ops'
import { opsOf, NO_ASKS, after, page } from './status-helpers'

test('NO CHANGE keeps the list, an answer with no operation cannot be read, and a mixed answer keeps its operations', () => {
  const last = after(null, 'NEW: working | Offline mode | sync queue built', 0)

  expect(applyStatus(last, parseStatus('NO CHANGE')!, 5, NO_ASKS)).toBe(last)
  expect(parseStatus('UNCHANGED')).toEqual({ kind: 'unchanged' })
  expect(parseStatus(null)).toBeNull()
  expect(parseStatus('')).toBeNull()
  expect(parseStatus('SET: s1 | finished | built')).toBeNull()
  expect(parseStatus('Here are the changes:\nNothing else.')).toBeNull()
  expect(
    opsOf('Here are the changes:\nSET: s1 | queued | next up\nSET: s1 | finished | built\nDONE: s2 | shipped'),
  ).toEqual([
    { kind: 'set', ref: 's1', status: 'queued', text: 'next up' },
    { kind: 'done', ref: 's2', text: 'shipped' },
  ])
})

test('a NEW that names a subject finished since the last look reopens it, and one finished before the look is new work', () => {
  const done = after(null, 'NEW: working | Retry button | built\nDONE: s1 | merged', 100)
  const reopened = after(done, 'NEW: working | retry button | fails on web', 200)

  expect(reopened.subjects).toEqual([
    expect.objectContaining({ id: 's1', status: 'working', text: 'fails on web', closedAt: null, changedAt: 200 }),
  ])
  const seen = after({ ...done, lastLookAt: 150 }, 'NEW: working | Retry button | fails on web', 200)
  expect(seen.subjects.map(s => `${s.id} ${s.status}`)).toEqual(['s1 done', 's2 working'])
})

test('a NEW or a HEAD named only by a PR or issue number changes nothing, and a name that also names the work is kept', () => {
  const last = after(null, 'HEAD: Offline sync | Adding offline sync', 100)
  const o = after(
    last,
    'NEW: working | #3655 | fixes pushed\nNEW: working | PR3655 | review\nNEW: queued | issue 12 | -\nHEAD: PR #3655 | Fixing the PR\nNEW: working | 2.5 release | notes drafted\nNEW: working | 502 | gateway errors',
    200,
  )

  expect(o.subjects.map(s => s.name)).toEqual(['2.5 release', '502'])
  expect(o.head).toEqual(last.head)
})

test('reads each operation, tolerating bullets, and takes SET with done as DONE', () => {
  expect(
    opsOf(
      [
        '- NEW: working | Offline mode | sync queue built',
        '* SET: s2 | waits-on-other | needs a review',
        'SET: s3 | done | ships',
        'DONE: s4 | merged in',
        'DROP: s5 | not needed',
        'DROP: s6 | moved | INTO s1',
        'WAS: s1 | sync on launch',
        'LINK: c1 | Offline mode',
        'LINK: i3 | s1',
        'HEAD: Work offline | Letting the app work without a connection',
      ].join('\n'),
    ),
  ).toEqual([
    { kind: 'new', status: 'working', name: 'Offline mode', text: 'sync queue built' },
    { kind: 'set', ref: 's2', status: 'waits-on-other', text: 'needs a review' },
    { kind: 'done', ref: 's3', text: 'ships' },
    { kind: 'done', ref: 's4', text: 'merged in' },
    { kind: 'drop', ref: 's5', why: 'not needed', into: null },
    { kind: 'drop', ref: 's6', why: 'moved', into: 's1' },
    { kind: 'was', ref: 's1', text: 'sync on launch' },
    { kind: 'link', ref: 'c1', subject: 'Offline mode' },
    { kind: 'link', ref: 'i3', subject: 's1' },
    { kind: 'head', title: 'Work offline', description: 'Letting the app work without a connection' },
  ])
  expect(opsOf('HEAD: Work offline')).toEqual([{ kind: 'head', title: 'Work offline', description: '' }])
  expect(opsOf('HEAD: Work offline |')).toEqual([{ kind: 'head', title: 'Work offline', description: '' }])
})

test('code dates each change, and a NEW for an open subject changes that subject instead', () => {
  const one = after(
    null,
    'HEAD: Work offline | Letting the app work without a connection\nNEW: working | Offline mode | sync queue built',
    100,
  )
  const two = applyOps(one, opsOf('NEW: waits-on-other | offline mode | needs a sync review'), 200, NO_ASKS)

  expect(two.subjects).toHaveLength(1)
  expect(two.subjects[0]).toMatchObject({ status: 'waits-on-other', text: 'needs a sync review', changedAt: 200 })
  expect(two.head?.title).toBe('Work offline')
})

test('a LINK ties a running child or an open ask to a subject, even one the same answer adds, and an ask that is not open to none', () => {
  const withChildRunning = withChild(
    null,
    { ref: 't1', kind: 'subagent', name: 'Review sync', startedAt: 50, endedAt: null, lastActivityAt: 50 },
    50,
  )
  const linked = applyOps(
    withChildRunning,
    opsOf('LINK: c1 | Offline mode\nLINK: i1 | Offline mode\nLINK: i2 | s1\nNEW: working | Offline mode | in review'),
    100,
    new Set(['i1']),
  )

  expect(linked.children[0]?.subjectId).toBe('s1')
  expect(linked.askSubjects).toEqual({ i1: ['s1'] })
  expect(after(linked, 'NEW: queued | Docs | outline', 200).askSubjects).toEqual({})
})

test('a subject folded into another passes its linked asks to it', () => {
  const two = after(
    null,
    'NEW: working | Offline mode | queue built\nNEW: working | Sync retry | backoff drafted\nLINK: i1 | s2\nLINK: i2 | s1\nLINK: i2 | s2',
    100,
    new Set(['i1', 'i2']),
  )

  expect(after(two, 'DROP: s2 | part of offline | INTO s1', 200, new Set(['i1', 'i2'])).askSubjects).toEqual({
    i1: ['s1'],
    i2: ['s1'],
  })
})

test('a DONE may name a subject the same answer adds, even a name longer than the list keeps', () => {
  const name = 'Week start follows the locale in the date picker everywhere'
  const done = applyOps(
    null,
    opsOf(`NEW: working | ${name} | fixed\nDONE: ${name} | starts on the locale day`),
    100,
    NO_ASKS,
  )

  expect(done.subjects).toHaveLength(1)
  expect(done.subjects[0]).toMatchObject({ status: 'done', closedAt: 100 })
})

test('a DROP INTO folds a subject into another, which names it, and a WAS keeps the replaced plan until the person has seen it', () => {
  const three = after(
    null,
    'NEW: working | Offline mode | queue built\nNEW: working | Sync retry | backoff drafted\nNEW: queued | Cache size | not started',
    100,
  )
  const folded = after(three, 'DROP: s2 | part of offline | INTO s1\nWAS: s1 | retry on its own', 200)
  const twice = after(folded, 'DROP: s3 | part of offline | INTO s1', 250)
  const finishedUnseen = after(twice, 'DONE: s1 | works offline', 300)
  const seen = lookEnded(lookStarted(twice, 260), 260 + LOOK_MIN_MS, 'all')
  const foldedAfterLook = after(
    after(seen, 'NEW: working | Retry limit | drafted', 300 + LOOK_MIN_MS),
    'DROP: s4 | part of offline | INTO s1',
    400 + LOOK_MIN_MS,
  )

  expect(folded.subjects.find(s => s.id === 's2')).toMatchObject({ status: 'dropped', into: 's1', closedAt: 200 })
  expect(folded.subjects.find(s => s.id === 's1')).toMatchObject({ merged: 'Sync retry', was: 'retry on its own' })
  expect(twice.subjects.find(s => s.id === 's1')?.merged).toBe('Sync retry, Cache size')
  expect(finishedUnseen.subjects[0]).toMatchObject({
    status: 'done',
    merged: 'Sync retry, Cache size',
    was: 'retry on its own',
  })
  expect(after(seen, 'SET: s1 | waits-on-other | waits on review', 300 + LOOK_MIN_MS).subjects[0]).toMatchObject({
    merged: null,
    was: null,
  })
  expect(foldedAfterLook.subjects[0]).toMatchObject({ merged: 'Retry limit', was: null })
})

test('a trailing period is not part of a word, so a SET that adds one rewords and a NEW that names a subject with one changes it', () => {
  const one = after(null, 'NEW: working | Login form | tests pass', 1000)
  const named = after(one, 'NEW: waits-on-other | Login form. | needs a review', 3000)

  expect(after(one, 'SET: s1 | working | tests pass.', 3000).subjects[0]).toMatchObject({
    text: 'tests pass',
    changedAt: 1000,
  })
  expect(named.subjects).toHaveLength(1)
  expect(named.subjects[0]).toMatchObject({ status: 'waits-on-other', changedAt: 3000 })
  expect(after(one, 'SET: s1 | working | tests pass on 1.4.2', 3000).subjects[0]!.text).toBe('tests pass on 1.4.2')
})

test('a SET, a DONE or another DROP takes a folded subject out of its target, and a DONE on a done subject changes nothing', () => {
  const two = after(null, 'NEW: working | Login form | drafted\nNEW: working | Auth flow | drafted', 100)
  const reopened = after(after(two, 'DROP: s1 | part of auth | INTO s2', 200), 'SET: s1 | working | split out', 300)
  const done = after(two, 'DONE: s1 | shipped', 200)
  const seen = lookEnded(lookStarted(done, 300), 300 + LOOK_MIN_MS, 'all')
  const folded = after(two, 'DROP: s1 | part of auth | INTO s2', 200)

  expect(reopened.subjects[0]).toMatchObject({ status: 'working', closedAt: null, into: null })
  expect(reopened.subjects[1]!.merged).toBeNull()
  expect(after(folded, 'DONE: s1 | shipped', 300).subjects[1]!.merged).toBeNull()
  expect(page(reopened, 400).rows.flatMap(r => (r.kind === 'subject' ? [r.name] : []))).toContain('Login form')
  expect(after(seen, 'DONE: s1 | shipped', 1000 + LOOK_MIN_MS).subjects[0]).toMatchObject({
    closedAt: 200,
    changedAt: 200,
  })
  expect(after(folded, 'DONE: s1 | shipped', 300).subjects[0]).toMatchObject({ status: 'done', into: null })

  const three = after(folded, 'NEW: working | Session store | drafted', 250)
  const refolded = after(three, 'DROP: s1 | part of sessions | INTO s3', 300)
  const dropped = after(refolded, 'DROP: s1 | not needed', 400)

  expect(refolded.subjects.map(s => s.merged)).toEqual([null, null, 'Login form'])
  expect(refolded.subjects[0]!.into).toBe('s3')
  expect(dropped.subjects.map(s => s.merged)).toEqual([null, null, null])
  expect(dropped.subjects[0]).toMatchObject({ status: 'dropped', into: null })
})
