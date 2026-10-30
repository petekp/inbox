import { expect, test } from 'claude-code/testing'

import {
  applyOps,
  applyStatus,
  asksText,
  childActive,
  childEnded,
  EMPTY_SESSION_STATUS,
  lookEnded,
  lookStarted,
  LOOK_MIN_MS,
  parseStatus,
  runningText,
  subjectsText,
  upgradeStatus,
  withChild,
} from '../hooks/status'
import type { Op } from '../hooks/status'
import { delegatesSettled, delegatesStarted } from '../hooks/children'
import type { HerdrStatus } from '../hooks/herdr'
import { emptySession } from '../hooks/session'
import {
  CHILD_ROWS,
  CLOSED_MARKS,
  FINDING_GROUPS,
  HELD_MARK,
  MARK_LEGEND,
  mergedLine,
  nameBeforeStall,
  statusKeyPlan,
  statusPage,
  PR_MARKS,
  RUNNING_FRAMES,
  SUBJECT_MARKS,
} from '../hooks/view'
import type { StatusRow } from '../hooks/view'
import type { Item, SessionStatus, Session } from '../types'

const MIN = 60_000

const opsOf = (text: string): Op[] => {
  const answer = parseStatus(text)
  if (answer?.kind !== 'ops') throw new Error(`not ops: ${text}`)

  return answer.ops
}

const NO_ASKS: ReadonlySet<string> = new Set()

const after = (last: SessionStatus | null, text: string, now: number, askIds = NO_ASKS) =>
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
  sessionStatus: SessionStatus | null,
  now: number,
  over: Partial<Session['presence']> = {},
  items: Item[] = [],
) => statusPage({ ledger: { overview: sessionStatus, items }, presence: presence(over) }, now)

const ARMS = { mid: '├ ', last: '└ ' } as const

const shape = (rows: StatusRow[]) =>
  rows.map(r =>
    r.kind === 'subject'
      ? `${r.mark} ${r.name}${r.text ? `: ${r.text}` : ''}${r.stall ? ` · ${r.stall.text}` : ''}${r.hasChildren ? ' ┐' : ''}`
      : r.kind === 'child'
        ? `${r.branch ? ARMS[r.branch] : ''}${r.mark} ${r.name}${r.stall ? ` · ${r.stall.text}` : ''}`
        : r.kind === 'look'
          ? `-- ${r.text}`
          : r.kind === 'more'
            ? `${ARMS[r.branch]}${r.text}`
            : `${r.mark} ${r.text}`,
  )

test('NO CHANGE keeps the list, and an empty answer or one holding prose cannot be read', () => {
  const last = after(null, 'NEW: working | Offline mode | sync queue built', 0)

  expect(applyStatus(last, parseStatus('NO CHANGE')!, 5, NO_ASKS)).toBe(last)
  expect(parseStatus('UNCHANGED')).toEqual({ kind: 'unchanged' })
  expect(parseStatus(null)).toBeNull()
  expect(parseStatus('')).toBeNull()
  expect(parseStatus('SET: s1 | done | built\nCorrection: the status was wrong.\nDONE: s1 | built')).toBeNull()
  expect(parseStatus('SET: s1 | finished | built')).toBeNull()
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

test('a HEAD that keeps the title, or that comes with work finished from under way and none left, keeps the head', () => {
  const one = after(
    null,
    'HEAD: Offline sync | Adding offline sync to the notes app\nNEW: working | Sync engine | queue built',
    100,
  )
  const retitled = applyOps(one, opsOf('HEAD: offline sync | Wiring the settings toggle'), 200, NO_ASKS)
  const moved = applyOps(one, opsOf('HEAD: 2.5 release | Shipping 2.5 to the stores'), 200, NO_ASKS)
  const finished = applyOps(
    one,
    opsOf(
      'DONE: s1 | syncs on reconnect\nNEW: queued | Export button | not started\nHEAD: Export button | Adding export',
    ),
    200,
    NO_ASKS,
  )
  const handedOn = applyOps(
    one,
    opsOf(
      'DONE: s1 | syncs on reconnect\nNEW: waits-on-other | 2.5 release | in store review\nHEAD: 2.5 release | Shipping 2.5',
    ),
    200,
    NO_ASKS,
  )
  const filedAlongside = applyOps(
    applyOps(one, opsOf('NEW: queued | Export button | not started'), 150, NO_ASKS),
    opsOf('DONE: s1 | syncs on reconnect\nDONE: s2 | filed for later\nHEAD: Export button | Adding export'),
    200,
    NO_ASKS,
  )
  const shipped = applyOps(one, opsOf('DONE: s1 | syncs on reconnect'), 150, NO_ASKS)
  const startedAndFinished = applyOps(
    shipped,
    opsOf('NEW: working | README fix | typo found\nDONE: README fix | fixed\nHEAD: README fix | Fixing the README'),
    200,
    NO_ASKS,
  )
  const unknownDone = applyOps(shipped, opsOf('DONE: s9 | fixed\nHEAD: README fix | Fixing the README'), 200, NO_ASKS)
  const queuedClosed = applyOps(
    applyOps(shipped, opsOf('NEW: queued | Export button | not started'), 160, NO_ASKS),
    opsOf('DROP: s2 | not needed\nHEAD: 2.5 release | Shipping 2.5'),
    200,
    NO_ASKS,
  )
  const saved = { ...one, head: { title: 'Ship offline sync', description: '' } }
  const described = applyOps(
    saved,
    opsOf('HEAD: Ship offline sync | Adding offline sync to the notes app'),
    200,
    NO_ASKS,
  )

  expect(retitled.head).toEqual(one.head)
  expect(moved.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5 to the stores' })
  expect(finished.head).toEqual(one.head)
  expect(handedOn.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5' })
  expect(filedAlongside.head).toEqual(one.head)
  expect(startedAndFinished.head).toEqual({ title: 'README fix', description: 'Fixing the README' })
  expect(unknownDone.head).toEqual({ title: 'README fix', description: 'Fixing the README' })
  expect(queuedClosed.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5' })
  expect(described.head).toEqual({ title: 'Ship offline sync', description: 'Adding offline sync to the notes app' })
})

test('a head whose description names work that just finished, while other work goes on, takes a new one or loses it', () => {
  const one = after(
    null,
    [
      'HEAD: 2.5 release | Fixing vanishing notes, then shipping 2.5',
      'NEW: working | Vanishing notes | fix in review',
      'NEW: queued | 2.5 release | not started',
    ].join('\n'),
    100,
  )
  const fixMerged = 'DONE: s1 | merged\nSET: s2 | working | building 2.5'
  const redescribed = applyOps(one, opsOf(`${fixMerged}\nHEAD: 2.5 release | Shipping 2.5 to the stores`), 200, NO_ASKS)
  const unwritten = applyOps(one, opsOf(fixMerged), 200, NO_ASKS)
  const nothingLeft = applyOps(one, opsOf('DONE: s1 | merged'), 200, NO_ASKS)
  const otherFinished = applyOps(
    applyOps(one, opsOf('NEW: working | README fix | typo found'), 150, NO_ASKS),
    opsOf('DONE: s3 | fixed\nHEAD: 2.5 release | Shipping 2.5 to the stores'),
    200,
    NO_ASKS,
  )

  expect(redescribed.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5 to the stores' })
  expect(unwritten.head).toEqual({ title: '2.5 release', description: '' })
  expect(nothingLeft.head).toEqual(one.head)
  expect(otherFinished.head).toEqual(one.head)
})

test('a SET that keeps the status keeps the old text and age only when its content words are the same', () => {
  const one = after(null, 'NEW: working | Offline mode | sync queue built and tested', 100)
  const reworded = applyOps(one, opsOf('SET: s1 | working | the sync queue is built and tested'), 200, NO_ASKS)
  const broken = applyOps(one, opsOf('SET: s1 | working | sync queue built and broken'), 200, NO_ASKS)

  expect(reworded.subjects[0]).toMatchObject({ text: 'sync queue built and tested', changedAt: 100 })
  expect(broken.subjects[0]).toMatchObject({ text: 'sync queue built and broken', changedAt: 200 })
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
  expect(after(linked, 'NEW: queued | Docs | outline', 200).askSubjects).toEqual({})
})

test('a subject folded into another passes its linked asks to it', () => {
  const two = after(
    null,
    'NEW: working | Offline mode | queue built\nNEW: working | Sync retry | backoff drafted\nLINK: i1 | s2',
    100,
    new Set(['i1']),
  )

  expect(after(two, 'DROP: s2 | part of offline | INTO s1', 200, new Set(['i1'])).askSubjects).toEqual({ i1: 's1' })
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
  const seen = lookEnded(lookStarted(twice, 260), 260 + LOOK_MIN_MS)
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

test('a look keeps the look line where it was until the look ends, and counts only once the Status showed for five seconds', () => {
  const o = { ...after(null, 'NEW: working | Offline mode | queue built', 100), lastLookAt: 50 }
  const looking = lookStarted(o, 200)!

  expect(looking.lastLookAt).toBe(50)
  expect(lookStarted(looking, 300)).toBe(looking)
  expect(lookEnded(looking, 200 + LOOK_MIN_MS)).toMatchObject({ lastLookAt: 200 + LOOK_MIN_MS, look: null })
  expect(lookEnded(looking, 199 + LOOK_MIN_MS)).toMatchObject({ lastLookAt: 50, look: null })
  expect(lookStarted(null, 1)).toBeNull()
})

test('an open row below the look line keeps where it stands but not its was line', () => {
  const now = 100 * MIN
  const o = after(
    after(
      null,
      'HEAD: Work offline | Letting the app work without a connection\nNEW: queued | Docs | outline ready\nNEW: working | Offline mode | queue built',
      10 * MIN,
    ),
    'SET: s2 | working | needs a sync pick\nLINK: i1 | s2',
    90 * MIN,
    new Set(['i1']),
  )
  const p = page({ ...o, lastLookAt: 50 * MIN }, now, { lastReplyAt: now - 2 * MIN }, [askItem('i1')])

  expect(p.head?.title).toBe('Work offline')
  expect(shape(p.rows)).toEqual([
    '◆ Offline mode: needs a sync pick · waiting',
    '-- Last seen',
    '○ Docs: outline ready',
  ])
  const seenAt = { ...after(o, 'WAS: s2 | sync on every save', 90 * MIN, new Set(['i1'])), lastLookAt: 95 * MIN }
  const seen = page(seenAt, now, {}, [askItem('i1')]).rows
  expect(shape(seen)).toEqual(['◆ Offline mode: needs a sync pick · waiting', '○ Docs: outline ready'])
  expect(seen[0]).toMatchObject({ kind: 'subject', was: null })
})

test('each side of the look line lists held, working, waiting, queued, then finished rows, newest change first within each', () => {
  let o = after(null, 'NEW: working | Seen work | old step\nNEW: queued | Seen queue | later', 10 * MIN)
  o = after(
    o,
    'NEW: working | Sync | step one\nNEW: queued | Help menu | not started\nNEW: working | Banner | built',
    60 * MIN,
  )
  o = after(o, 'DONE: s5 | shipped', 65 * MIN)
  o = after(o, 'NEW: working | Export | step one', 70 * MIN)
  o = after(o, 'NEW: waits-on-other | Review | sent for review', 72 * MIN)
  o = after(o, 'SET: s4 | queued | outline ready', 75 * MIN)
  o = after(o, 'NEW: working | Flick | needs a pick\nLINK: i1 | s8\nLINK: i2 | s2', 80 * MIN, new Set(['i1', 'i2']))
  o = after(o, 'SET: s3 | working | step two', 85 * MIN, new Set(['i1', 'i2']))
  const rows = page({ ...o, lastLookAt: 50 * MIN }, 86 * MIN, {}, [askItem('i1'), askItem('i2')]).rows

  expect(shape(rows)).toEqual([
    '◆ Flick: needs a pick · waiting',
    '● Sync: step two',
    '● Export: step one',
    '◌ Review: sent for review',
    '○ Help menu: outline ready',
    '✓ Banner: shipped',
    '-- Last seen',
    '◆ Seen queue: later · waiting',
    '● Seen work: old step',
  ])
})

test('only a subject an open ask holds up reads waiting, in the needs-you tone, with no time, and one waiting on someone else shows no word', () => {
  const o = after(
    null,
    'NEW: waits-on-other | Review | sent for review\nNEW: working | Sync | needs a pick\nNEW: queued | Docs | not started\nLINK: i1 | s2\nLINK: i2 | s2',
    0,
    new Set(['i1', 'i2']),
  )
  const asks = [
    { ...askItem('i1'), at: 20 * MIN },
    { ...askItem('i2'), at: 10 * MIN },
  ]
  const stalls = (now: number) => page(o, now, {}, asks).rows.map(r => (r.kind === 'subject' ? r.stall : r.kind))

  const waiting = [{ text: 'waiting', tone: 'needsYou' }, null, null]
  expect(stalls(20 * MIN)).toEqual(waiting)
  expect(stalls(2 * 60 * MIN)).toEqual(waiting)
  expect(shape(page(o, 2 * 60 * MIN, {}, asks).rows)[1]).toBe('◌ Review: sent for review')
})

test('a name before its stall word is cut at a word with an ellipsis until both fit, and keeps its first word when nothing fits', () => {
  const fitsIn = (cells: number) => (shown: string) => `${shown} · waiting`.length <= cells

  expect(nameBeforeStall('Tune how hard a pinch must be', fitsIn(60))).toBe('Tune how hard a pinch must be')
  expect(nameBeforeStall('Tune how hard a pinch must be', fitsIn(28))).toBe('Tune how hard a…')
  expect(nameBeforeStall('Tune how hard a pinch must be', fitsIn(8))).toBe('Tune…')
  expect(nameBeforeStall('vn2', fitsIn(8))).toBe('vn2')
})

test('a merged line is cut at the last phrase that fits, and keeps its first phrase whole when none fits', () => {
  const fits = (most: number) => (text: string) => text.length <= most
  const names = 'Dragging in Arrange, hover to reveal, and open in Finder'

  expect(mergedLine(names, fits(67))).toBe(`merged in: ${names}`)
  expect(mergedLine(names, fits(60))).toBe('merged in: Dragging in Arrange, hover to reveal…')
  expect(mergedLine(names, fits(40))).toBe('merged in: Dragging in Arrange…')
  expect(mergedLine(names, fits(20))).toBe('merged in: Dragging in Arrange…')
  expect(mergedLine('Sync retry with backoff', fits(20))).toBe('merged in: Sync retry with backoff')
})

test('an open ask linked to an open subject marks it ◆ and stops its running mark until the ask closes, and the call reads each ask with its link', () => {
  const o = after(null, 'NEW: working | Offline mode | queue built\nLINK: i1 | s1\nLINK: i2 | s1', 0, new Set(['i1']))
  const held = page(o, MIN, { isTurnRunning: true }, [askItem('i1')]).rows[0]
  const answered = page(o, MIN, { isTurnRunning: true }, []).rows[0]

  expect(o.askSubjects).toEqual({ i1: 's1' })
  expect(asksText(o, [askItem('i1'), askItem('i3')])).toBe('i1 | Ask i1? | s1\ni3 | Ask i3? | -')
  expect(held).toMatchObject({ mark: '◆', tone: 'needsYou', isRunning: false })
  expect(answered).toMatchObject({ mark: '●', tone: null, isRunning: true })
  expect(page(after(o, 'DONE: s1 | works offline', MIN), MIN, {}, [askItem('i1')]).rows[0]).toMatchObject({
    mark: '✓',
  })
})

test('a subject that open asks hold up offers View on the oldest ask, named for its kind, an ask with no time counting as oldest, and no button once the asks close', () => {
  const o = after(
    null,
    'NEW: working | Offline mode | queue built\nNEW: working | Docs | outline ready\nLINK: i1 | s1\nLINK: i2 | s1\nLINK: i3 | s1',
    0,
    new Set(['i1', 'i2', 'i3']),
  )
  const asks = {
    i1: { ...askItem('i1'), at: 5 * MIN },
    i2: { ...askItem('i2'), kind: 'task' as const, at: 2 * MIN },
    i3: askItem('i3'),
  }
  const viewOf = (items: Item[]) =>
    page(o, 10 * MIN, {}, items).rows.map(r => statusKeyPlan(r).map(k => `${r.id} ${k.label} ${k.press.askId}`))

  expect(viewOf([asks.i1, asks.i2])).toEqual([['s1 View task i2'], []])
  expect(viewOf([asks.i1, asks.i2, asks.i3])).toEqual([['s1 View question i3'], []])
  expect(viewOf([asks.i1])).toEqual([['s1 View question i1'], []])
  expect(viewOf([])).toEqual([[], []])
})

test('with no look yet every row is new, so the page draws no look line and shows where each stands', () => {
  const o = after(null, 'NEW: working | Offline mode | queue built', 10 * MIN)

  expect(shape(page(o, 12 * MIN).rows)).toEqual(['● Offline mode: queue built'])
})

test('a page with no head and no rows shows its empty state, even while a turn runs', () => {
  expect(page(null, 3 * MIN, { isTurnRunning: true, turnStartedAt: 0 }).isEmpty).toBe(true)
  expect(page({ ...EMPTY_SESSION_STATUS, head: { title: '0.3 release', description: '' } }, 3 * MIN).isEmpty).toBe(
    false,
  )
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
    '✓ Four: done d',
    '✓ Three: done c',
    '-- Last seen',
    '✓ 2 more done',
  ])
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

test('a Status saved before subjects keeps its open work, dated at the last look, and its headline as the head', () => {
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

  expect(upgradeStatus(old)).toEqual({
    ...EMPTY_SESSION_STATUS,
    head: { title: 'Releasing 0.2.11', description: '' },
    subjects: [
      {
        id: 's1',
        name: 'VM pass',
        status: 'waits-on-other',
        text: '',
        was: null,
        merged: null,
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
        merged: null,
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
        merged: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
    ],
    nextId: 4,
    lastLookAt: 5000,
  })
  expect(upgradeStatus({ ...old, lastLookAt: null })?.subjects).toEqual([])
  expect(upgradeStatus({ headline: 'x', lastLookAt: null })?.head?.title).toBe('x')
})

test('a saved goal becomes the head with no description, and a saved head keeps both lines', () => {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }

  expect(upgradeStatus({ role: 'coordinator', goal: 'Ship notes 2.4', subjects: [] })?.head).toEqual({
    title: 'Ship notes 2.4',
    description: '',
  })
  expect(upgradeStatus({ goal: '', subjects: [] })?.head).toBeNull()
  expect(upgradeStatus({ head, subjects: [] })?.head).toEqual(head)
})

test('a saved Status drops subjects and children it cannot read, reads a delegate state it does not know as none, and nothing else is a Status', () => {
  const saved = {
    ...EMPTY_SESSION_STATUS,
    subjects: [
      { id: 's1', name: 'A', status: 'working', text: 'b', changedAt: 5, was: 'E folded in; was: two steps' },
      { id: 's2', status: 'odd' },
      { id: 's3', name: 'C', status: 'waits-on-you', text: 'needs a pick', changedAt: 6, was: 'F folded in' },
      { id: 's4', name: 'D', status: 'problem', text: 'flaky', changedAt: 7 },
    ],
    askSubjects: { i1: 's3', i2: 7 },
    children: [
      { id: 'c1', ref: 'r', kind: 'subagent', name: 'n', startedAt: 1 },
      { id: 'c2', kind: 'robot' },
      { id: 'c3', ref: 'herdr:a', kind: 'delegate', name: 'a', startedAt: 2, delegateState: 'blocked' },
      { id: 'c4', ref: 'herdr:b', kind: 'delegate', name: 'b', startedAt: 3, delegateState: 'asleep' },
    ],
    look: { startedAt: 'soon' },
  }
  const o = upgradeStatus(saved)!

  expect(o.subjects).toEqual([
    {
      id: 's1',
      name: 'A',
      status: 'working',
      text: 'b',
      was: 'two steps',
      merged: 'E',
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
      merged: 'F',
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
      merged: null,
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
      delegateState: null,
    },
    expect.objectContaining({ id: 'c3', delegateState: 'blocked' }),
    expect.objectContaining({ id: 'c4', delegateState: null }),
  ])
  expect(o.look).toBeNull()
  expect(upgradeStatus(null)).toBeNull()
  expect(upgradeStatus('x')).toBeNull()
  expect(upgradeStatus({ role: 'session' })).toBeNull()
})

test('the Help legend explains every mark a row or group title draws, once each', () => {
  const drawn = new Set([
    ...Object.values(SUBJECT_MARKS).map(m => m.mark),
    HELD_MARK.mark,
    ...Object.values(CLOSED_MARKS),
    ...Object.values(FINDING_GROUPS).map(g => g.mark),
    ...Object.values(PR_MARKS).map(m => m.text),
  ])
  const explained = MARK_LEGEND.map(m => m.mark)

  expect(new Set(explained).size).toBe(explained.length)
  expect([...drawn].sort()).toEqual([...explained].sort())
  expect(MARK_LEGEND.filter(m => m.isRunning).map(m => m.mark)).toEqual([RUNNING_FRAMES[0]])
})
