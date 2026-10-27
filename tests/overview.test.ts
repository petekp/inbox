import { expect, test } from 'claude-code/testing'

import {
  applyOps,
  applyOverview,
  asksText,
  childActive,
  childEnded,
  EMPTY_OVERVIEW,
  lookEnded,
  lookStarted,
  LOOK_MIN_MS,
  parseOverview,
  runningText,
  subjectsText,
  upgradeOverview,
  withChild,
} from '../hooks/overview'
import type { Op } from '../hooks/overview'
import { emptySession } from '../hooks/session'
import { CHILD_ROWS, overviewPage, QUIET_MS } from '../hooks/view'
import type { OverviewRow } from '../hooks/view'
import type { Item, Overview, Session } from '../types'

const MIN = 60_000

const opsOf = (text: string): Op[] => {
  const answer = parseOverview(text)
  if (answer?.kind !== 'ops') throw new Error(`not ops: ${text}`)

  return answer.ops
}

const NO_ASKS: ReadonlySet<string> = new Set()

const after = (last: Overview | null, text: string, now: number, askIds = NO_ASKS) =>
  applyOps(last, opsOf(text), now, askIds)

const askItem = (id: string): Item => ({
  id,
  kind: 'question',
  label: null,
  ask: `Ask ${id}?`,
  options: [],
  rec: null,
  helps: [],
  turn: 1,
  at: null,
  from: 'record',
})

const presence = (over: Partial<Session['presence']> = {}): Session['presence'] => ({
  ...emptySession().presence,
  ...over,
})

const page = (
  overview: Overview | null,
  now: number,
  over: Partial<Session['presence']> = {},
  place: Session['place'] = null,
  items: Item[] = [],
) => overviewPage({ ledger: { overview, items }, presence: presence(over), place }, now)

const ARMS = { mid: '├ ', last: '└ ' } as const

const shape = (rows: OverviewRow[]) =>
  rows.map(r =>
    r.kind === 'subject'
      ? `${r.mark} ${r.name}${r.text ? `: ${r.text}` : ''} ${r.age}${r.hasChildren ? ' ┐' : ''}`
      : r.kind === 'child'
        ? `${r.branch ? ARMS[r.branch] : ''}● ${r.name} ${r.age}`
        : r.kind === 'look'
          ? `-- ${r.text}`
          : r.kind === 'more'
            ? `${ARMS[r.branch]}${r.text}`
            : `${r.mark} ${r.text}${r.age ? ` ${r.age}` : ''}`,
  )

test('NO CHANGE keeps the list, and an empty answer or one holding prose cannot be read', () => {
  const last = after(null, 'NEW: working | Offline mode | sync queue built', 0)

  expect(applyOverview(last, parseOverview('NO CHANGE')!, 5, NO_ASKS)).toBe(last)
  expect(parseOverview('UNCHANGED')).toEqual({ kind: 'unchanged' })
  expect(parseOverview(null)).toBeNull()
  expect(parseOverview('')).toBeNull()
  expect(parseOverview('SET: s1 | done | built\nCorrection: the status was wrong.\nDONE: s1 | built')).toBeNull()
  expect(parseOverview('SET: s1 | finished | built')).toBeNull()
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
        'ROLE: coordinator',
        'GOAL: Work offline',
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
    { kind: 'role', role: 'coordinator' },
    { kind: 'goal', text: 'Work offline' },
  ])
})

test('code dates each change, and a NEW for an open subject changes that subject instead', () => {
  const one = after(null, 'GOAL: Work offline\nNEW: working | Offline mode | sync queue built', 100)
  const two = applyOps(one, opsOf('NEW: waits-on-other | offline mode | needs a sync review'), 200, NO_ASKS)

  expect(two.subjects).toHaveLength(1)
  expect(two.subjects[0]).toMatchObject({ status: 'waits-on-other', text: 'needs a sync review', changedAt: 200 })
  expect(two.goal).toBe('Work offline')
})

test('a SET that keeps the status and most words keeps the old text and age', () => {
  const one = after(null, 'NEW: working | Offline mode | sync queue built and tested', 100)
  const reworded = applyOps(one, opsOf('SET: s1 | working | the sync queue is built and tested'), 200, NO_ASKS)

  expect(reworded.subjects[0]).toMatchObject({ text: 'sync queue built and tested', changedAt: 100 })
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
  expect(linked.askSubjects).toEqual({ i1: 's1' })
})

test('a subject folded into another passes its linked asks to it', () => {
  const two = after(
    null,
    'NEW: working | Offline mode | queue built\nNEW: working | Sync retry | backoff drafted\nLINK: i1 | s2',
    100,
    new Set(['i1']),
  )

  expect(after(two, 'DROP: s2 | part of offline | INTO s1', 200).askSubjects).toEqual({ i1: 's1' })
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

test('a DROP INTO folds a subject into another, which notes it, and a WAS keeps the replaced plan until the person has seen it', () => {
  const two = after(null, 'NEW: working | Offline mode | queue built\nNEW: working | Sync retry | backoff drafted', 100)
  const folded = after(two, 'DROP: s2 | part of offline | INTO s1\nWAS: s1 | retry on its own', 200)
  const finishedUnseen = after(folded, 'DONE: s1 | works offline', 300)
  const seen = lookEnded(lookStarted(folded, 250), 250 + LOOK_MIN_MS)

  expect(folded.subjects.find(s => s.id === 's2')).toMatchObject({ status: 'dropped', into: 's1', closedAt: 200 })
  expect(folded.subjects.find(s => s.id === 's1')?.was).toBe('Sync retry folded in; was: retry on its own')
  expect(finishedUnseen.subjects[0]).toMatchObject({
    status: 'done',
    was: 'Sync retry folded in; was: retry on its own',
  })
  expect(after(seen, 'SET: s1 | waits-on-other | waits on review', 300 + LOOK_MIN_MS).subjects[0]?.was).toBeNull()
})

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

  expect(again.children).toEqual([{ ...report, id: 'c1', subjectId: 's1', startedAt: 50 }])
  expect(childActive(again, 'herdr:docs', 60)!.children[0]?.lastActivityAt).toBe(60)
  const later = withChild(ended, { ...report, ref: 't9', name: 'npm test' }, 40 + 25 * 60 * MIN)
  expect(later.children.map(c => c.ref)).toEqual(['t9'])
})

test('a look keeps the look line where it was until the look ends, and counts only once the Overview showed for five seconds', () => {
  const o = { ...after(null, 'NEW: working | Offline mode | queue built', 100), lastLookAt: 50 }
  const looking = lookStarted(o, 200)!

  expect(looking.lastLookAt).toBe(50)
  expect(lookStarted(looking, 300)).toBe(looking)
  expect(lookEnded(looking, 200 + LOOK_MIN_MS)).toMatchObject({ lastLookAt: 200 + LOOK_MIN_MS, look: null })
  expect(lookEnded(looking, 199 + LOOK_MIN_MS)).toMatchObject({ lastLookAt: 50, look: null })
  expect(lookStarted(null, 1)).toBeNull()
})

test('the page lists subjects newest first with code-written ages, and an open row below the look line keeps where it stands but not its was line', () => {
  const now = 100 * MIN
  const o = after(
    after(
      null,
      'GOAL: Work offline\nNEW: queued | Docs | outline ready\nNEW: working | Offline mode | queue built',
      10 * MIN,
    ),
    'SET: s2 | working | needs a sync pick\nLINK: i1 | s2',
    90 * MIN,
    new Set(['i1']),
  )
  const p = page(
    { ...o, lastLookAt: 50 * MIN },
    now,
    { lastReplyAt: now - 2 * MIN },
    { folder: '/code/visor', branch: 'offline' },
    [askItem('i1')],
  )

  expect(p.identity).toBe('visor · offline')
  expect(p.goal).toBe('Work offline')
  expect(p.live).toBe('Idle · last reply 2m ago')
  expect(shape(p.rows)).toEqual(['◆ Offline mode: needs a sync pick 10m', '-- Seen', '○ Docs: outline ready 2h'])
  const seenAt = { ...after(o, 'WAS: s2 | sync on every save', 90 * MIN), lastLookAt: 95 * MIN }
  const seen = page(seenAt, now, {}, null, [askItem('i1')]).rows
  expect(shape(seen)).toEqual(['◆ Offline mode: needs a sync pick 10m', '○ Docs: outline ready 2h'])
  expect(seen[0]).toMatchObject({ kind: 'subject', was: null })
})

test('an open ask linked to an open subject marks it ◆ and stops its running mark until the ask closes, and the call reads each ask with its link', () => {
  const o = after(null, 'NEW: working | Offline mode | queue built\nLINK: i1 | s1\nLINK: i2 | s1', 0, new Set(['i1']))
  const held = page(o, MIN, { isTurnRunning: true }, null, [askItem('i1')]).rows[0]
  const answered = page(o, MIN, { isTurnRunning: true }, null, []).rows[0]

  expect(o.askSubjects).toEqual({ i1: 's1' })
  expect(asksText(o, [askItem('i1'), askItem('i3')])).toBe('i1 | Ask i1? | s1\ni3 | Ask i3? | -')
  expect(held).toMatchObject({ mark: '◆', tone: 'needsYou', isRunning: false })
  expect(answered).toMatchObject({ mark: '●', tone: null, isRunning: true })
  expect(page(after(o, 'DONE: s1 | works offline', MIN), MIN, {}, null, [askItem('i1')]).rows[0]).toMatchObject({
    mark: '✓',
  })
})

test('with no look yet every row is new, so the page draws no look line and shows where each stands', () => {
  const o = after(null, 'NEW: working | Offline mode | queue built', 10 * MIN)

  expect(shape(page(o, 12 * MIN).rows)).toEqual(['● Offline mode: queue built 2m'])
  expect(page(o, 12 * MIN).hasNews).toBe(true)
  expect(page({ ...o, lastLookAt: 11 * MIN }, 12 * MIN).hasNews).toBe(false)
  expect(page({ ...o, look: { startedAt: 11 * MIN } }, 12 * MIN).hasNews).toBe(false)
})

test('the live line reads Working… alone in a turn’s first minute, then for how long', () => {
  expect(page(null, 30_000, { isTurnRunning: true, turnStartedAt: 0 }).live).toBe('Working…')
  expect(page(null, 3 * MIN, { isTurnRunning: true, turnStartedAt: 0 }).live).toBe('Working… for 3m')
  expect(page(null, 3 * MIN, { isTurnRunning: true, turnStartedAt: null }).live).toBe('Working…')
  expect(page(null, 3 * MIN).live).toBeNull()
  expect(page(null, 3 * MIN).isEmpty).toBe(true)
})

test('the first line names the folder and a coordinator, and leaves out a branch it does not know', () => {
  const coordinator = { ...EMPTY_OVERVIEW, role: 'coordinator' as const, goal: 'Ship 0.3' }

  expect(page(coordinator, 0, {}, { folder: '/Users/me/code/inbox/', branch: null }).identity).toBe(
    'inbox · coordinator',
  )
  expect(page(coordinator, 0).identity).toBeNull()
})

test('finished work folds into a count once seen, keeping at most two new finished rows', () => {
  const now = 100 * MIN
  const opened = after(
    null,
    ['NEW: working | One | a', 'NEW: working | Two | b', 'NEW: working | Three | c', 'NEW: working | Four | d'].join(
      '\n',
    ),
    10 * MIN,
  )
  const old = after(opened, 'DONE: s1 | done a', 20 * MIN)
  const fresh = after(
    after(after(old, 'DONE: s2 | done b', 70 * MIN), 'DONE: s3 | done c', 80 * MIN),
    'DONE: s4 | done d',
    90 * MIN,
  )

  expect(shape(page({ ...fresh, lastLookAt: 60 * MIN }, now).rows)).toEqual([
    '✓ Four: done d 10m',
    '✓ Three: done c 20m',
    '-- Seen',
    '✓ 2 more done 30m',
  ])
})

test('running children sit under their subject, at most three, each tied to it and the last ending its tree, a quiet one says so, and a subject whose children are all quiet stops its mark', () => {
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
    '● Offline mode: queue built 2h ┐',
    '├ ● Review 0 now',
    '├ ● Review 1 1m',
    '├ ● Review 2 2m',
    `└ + 2 more running`,
  ])
  const two = ['t2', 't3', 't4'].reduce<Overview | null>((x, ref) => childEnded(x, ref, now - MIN), o)
  expect(shape(page(two, now).rows)).toEqual([
    '● Offline mode: queue built 2h ┐',
    '├ ● Review 0 now',
    '└ ● Review 1 1m',
  ])
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
      lastActivityAt: now - QUIET_MS - 5 * MIN,
    },
    now,
  )
  expect(page(quiet, now).rows[0]).toMatchObject({
    kind: 'child',
    isLoose: true,
    isRunning: false,
    ageTone: 'needsYou',
    age: 'quiet 20m',
  })
  expect(page(after(quiet, 'LINK: c1 | s1', now), now).rows[0]).toMatchObject({
    kind: 'subject',
    isRunning: false,
    hasChildren: true,
  })
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
  o = after(o, 'LINK: c1 | s3\nLINK: c2 | s3', 80 * MIN)
  const rows = page({ ...o, lastLookAt: 50 * MIN }, now, {}, null, [askItem('i1')]).rows

  expect(rows.map(r => `${r.isRuledAbove ? '── ' : ''}${shape([r])[0]}`)).toEqual([
    '● Review loose 1m',
    '── ◆ Sync: needs a pick 30m',
    '── ● Offline mode: queue built 40m ┐',
    '├ ● Review r1 1m',
    '└ ● Review r2 1m',
    '-- Seen',
    '○ Docs: outline ready 2h',
    '── ✓ 1 done 2h',
  ])
})

test('a child whose host reports no activity shows how long it has run and never reads quiet', () => {
  const now = 100 * MIN
  const o = withChild(
    null,
    {
      ref: 'herdr:docs',
      kind: 'delegate',
      name: 'delegate docs',
      startedAt: 40 * MIN,
      endedAt: null,
      lastActivityAt: null,
    },
    now,
  )

  expect(page(o, now).rows[0]).toMatchObject({ kind: 'child', age: '1h', isRunning: true, isLoose: true })
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
  const heldOldest = page(after(o, 'LINK: i1 | s1', 0, new Set(['i1'])), MIN, {}, null, [askItem('i1')]).rows

  expect(rows.filter(r => r.kind === 'subject')).toHaveLength(7)
  expect(rows.at(-1)).toMatchObject({ kind: 'fold', text: '2 more queued' })
  expect(heldOldest.filter(r => r.kind === 'subject').map(r => r.id)).toContain('s1')
  expect(heldOldest.at(-1)).toMatchObject({ kind: 'fold', text: '2 more queued' })
})

test('an Overview saved before subjects keeps its open work, dated at the last look, and its headline as the goal', () => {
  const old = {
    isCoordinator: true,
    headline: 'Releasing 0.2.11',
    queue: [
      { status: 'working', text: 'Release notes', detail: 'drafted' },
      { status: 'done', text: 'Fix #81', detail: null },
    ],
    workstreams: [{ status: 'waits-on-other', text: 'VM pass', detail: null }],
    open: [{ status: 'problem', text: 'Flaky row test', detail: null }],
    lastLookAt: 5000,
  }

  expect(upgradeOverview(old)).toEqual({
    ...EMPTY_OVERVIEW,
    role: 'coordinator',
    goal: 'Releasing 0.2.11',
    subjects: [
      {
        id: 's1',
        name: 'VM pass',
        status: 'waits-on-other',
        text: '',
        was: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
      {
        id: 's2',
        name: 'Release notes',
        status: 'working',
        text: 'drafted',
        was: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
      {
        id: 's3',
        name: 'Flaky row test',
        status: 'queued',
        text: '',
        was: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
    ],
    nextId: 4,
    lastLookAt: 5000,
  })
  expect(upgradeOverview({ ...old, lastLookAt: null })?.subjects).toEqual([])
  expect(upgradeOverview({ headline: 'x', lastLookAt: null })?.goal).toBe('x')
})

test('a saved Overview drops subjects and children it cannot read, and nothing else is an Overview', () => {
  const saved = {
    ...EMPTY_OVERVIEW,
    subjects: [
      { id: 's1', name: 'A', status: 'working', text: 'b', changedAt: 5 },
      { id: 's2', status: 'odd' },
      { id: 's3', name: 'C', status: 'waits-on-you', text: 'needs a pick', changedAt: 6 },
      { id: 's4', name: 'D', status: 'problem', text: 'flaky', changedAt: 7 },
    ],
    askSubjects: { i1: 's3', i2: 7 },
    children: [
      { id: 'c1', ref: 'r', kind: 'subagent', name: 'n', startedAt: 1 },
      { id: 'c2', kind: 'robot' },
    ],
    look: { startedAt: 'soon' },
  }
  const o = upgradeOverview(saved)!

  expect(o.subjects).toEqual([
    {
      id: 's1',
      name: 'A',
      status: 'working',
      text: 'b',
      was: null,
      createdAt: 5,
      changedAt: 5,
      closedAt: null,
      into: null,
    },
    {
      id: 's3',
      name: 'C',
      status: 'queued',
      text: 'needs a pick',
      was: null,
      createdAt: 6,
      changedAt: 6,
      closedAt: null,
      into: null,
    },
    {
      id: 's4',
      name: 'D',
      status: 'queued',
      text: 'flaky',
      was: null,
      createdAt: 7,
      changedAt: 7,
      closedAt: null,
      into: null,
    },
  ])
  expect(o.askSubjects).toEqual({ i1: 's3' })
  expect(o.children).toEqual([
    {
      id: 'c1',
      ref: 'r',
      kind: 'subagent',
      name: 'n',
      subjectId: null,
      startedAt: 1,
      endedAt: null,
      lastActivityAt: null,
    },
  ])
  expect(o.look).toBeNull()
  expect(upgradeOverview(null)).toBeNull()
  expect(upgradeOverview('x')).toBeNull()
  expect(upgradeOverview({ role: 'session' })).toBeNull()
})
