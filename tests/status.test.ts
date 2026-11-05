import { expect, test } from 'claude-code/testing'

import { asksText, lookEnded, lookStarted, LOOK_MIN_MS, withChild } from '../hooks/status-children'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { mergedLine, nameBeforeStall, statusPage } from '../hooks/status-page'
import { statusKeyPlan } from '../hooks/status-keys'
import {
  IDLE_MARK,
  CLOSED_MARKS,
  FINDING_GROUPS,
  HELD_MARK,
  MARK_LEGEND,
  PR_MARKS,
  RUNNING_FRAMES,
  SUBJECT_MARKS,
} from '../hooks/help'
import type { Item, SessionStatus } from '../types'
import { minutes } from '../evals/status-replay'
import { sessionOf, statusOf, subject } from './status-evals-scenes'
import { MIN, after, askItem, page, shape } from './status-helpers'

test('a look keeps the look line where it was until the look ends, and counts only once the Status showed for five seconds', () => {
  const o = { ...after(null, 'NEW: working | Offline mode | queue built', 100), lastLookAt: 50 }
  const looking = lookStarted(o, 200)!

  expect(looking.lastLookAt).toBe(50)
  expect(lookStarted(looking, 300)).toBe(looking)
  expect(lookEnded(looking, 200 + LOOK_MIN_MS, 'all')).toMatchObject({ lastLookAt: 200 + LOOK_MIN_MS, look: null })
  expect(lookEnded(looking, 199 + LOOK_MIN_MS, 'all')).toMatchObject({ lastLookAt: 50, look: null })
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
    '◐ Sync: step two',
    '◐ Export: step one',
    '◌ Review: sent for review',
    '○ Help menu: outline ready',
    '✓ Banner: shipped',
    '-- Last seen',
    '◆ Seen queue: later · waiting',
    '○ 1 more',
  ])
})

test('only a subject an open ask holds up reads waiting, in the needs-you tone, with no time, and one waiting on someone else shows no word until it idles', () => {
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

test('an open subject unchanged for a day reads how long it has been idle, in whole days, muted, unless its work runs or an ask holds it', () => {
  const DAY = 24 * 60 * MIN
  const o = after(
    null,
    'NEW: working | Sync | needs a pick\nNEW: working | Search | index built\nNEW: queued | Docs | not started\nDONE: Docs | written\nNEW: waits-on-other | Review | sent\nLINK: i1 | s1',
    0,
    new Set(['i1']),
  )
  const child = {
    ref: 't1',
    kind: 'subagent' as const,
    name: 'reindex',
    startedAt: 0,
    endedAt: null,
    lastActivityAt: 0,
  }
  const running = { ...withChild(o, child, 0), children: [{ ...withChild(o, child, 0).children[0]!, subjectId: 's2' }] }
  const stalls = (now: number, turn = false) =>
    page(running, now, { isTurnRunning: turn }, [askItem('i1')]).rows.flatMap(r =>
      r.kind === 'subject' ? [`${r.name}: ${r.stall?.text ?? '-'}${r.stall ? ` (${r.stall.tone})` : ''}`] : [],
    )

  expect(stalls(DAY - MIN)).toEqual(['Sync: waiting (needsYou)', 'Search: -', 'Review: -', 'Docs: -'])
  expect(stalls(2 * DAY + 5 * 60 * MIN)).toEqual([
    'Sync: waiting (needsYou)',
    'Search: -',
    'Review: idle 2d (muted)',
    'Docs: -',
  ])
  expect(stalls(2 * DAY, true)).toContain('Review: idle 2d (muted)')
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

  expect(o.askSubjects).toEqual({ i1: ['s1'] })
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
    page(o, 10 * MIN, {}, items).rows.map(r =>
      statusKeyPlan(r).map(k => `${r.id} ${k.label} ${k.press.action === 'show-ask' ? k.press.askId : ''}`),
    )

  expect(viewOf([asks.i1, asks.i2])).toEqual([['s1 View task i2'], []])
  expect(viewOf([asks.i1, asks.i2, asks.i3])).toEqual([['s1 View question i3'], []])
  expect(viewOf([asks.i1])).toEqual([['s1 View question i1'], []])
  expect(viewOf([])).toEqual([[], []])
})

test('with no look yet every row is new, so the page draws no look line and shows where each stands', () => {
  const o = after(null, 'NEW: working | Offline mode | queue built', 10 * MIN)

  expect(shape(page(o, 12 * MIN).rows)).toEqual(['◐ Offline mode: queue built'])
})

test('a page with no head and no rows shows its empty state, even while a turn runs', () => {
  expect(page(null, 3 * MIN, { isTurnRunning: true, turnStartedAt: 0 }).isEmpty).toBe(true)
  expect(page({ ...EMPTY_SESSION_STATUS, head: { title: '0.3 release', description: '' } }, 3 * MIN).isEmpty).toBe(
    false,
  )
})

test('work closed since the last look shows as two rows, the rest is named in a fold for each status above the look line, and finished work folds into a count once seen', () => {
  const now = 100 * MIN
  const opened = after(
    null,
    [
      'NEW: working | One | a',
      'NEW: working | Two | b',
      'NEW: working | Three | c',
      'NEW: working | Four | d',
      'NEW: working | Five | e',
      'NEW: working | Six | f',
    ].join('\n'),
    10 * MIN,
  )
  const old = after(opened, 'DONE: s1 | done a', 20 * MIN)
  const fresh = [
    'DONE: s2 | done b',
    'DROP: s6 | not needed',
    'DONE: s5 | done e',
    'DONE: s3 | done c',
    'DONE: s4 | done d',
  ].reduce((o, line, n) => after(o, line, (65 + 5 * n) * MIN), old)

  expect(shape(page({ ...fresh, lastLookAt: 60 * MIN }, now).rows)).toEqual([
    '✓ Four: done d',
    '✓ Three: done c',
    '✓ Also done: Five, Two',
    '✗ Also dropped: Six',
    '-- Last seen',
    '▸ 1 more done',
  ])
})

test('when every row on the page closed since the last look, the named fold ends the rows, above the look line', () => {
  const opened = after(
    null,
    ['NEW: working | One | a', 'NEW: working | Two | b', 'NEW: working | Three | c'].join('\n'),
    10 * MIN,
  )
  const closed = ['DONE: s1 | done a', 'DONE: s2 | done b', 'DONE: s3 | done c'].reduce(
    (o, line, n) => after(o, line, (20 + 10 * n) * MIN),
    opened,
  )

  expect(shape(page({ ...closed, lastLookAt: 15 * MIN }, 60 * MIN).rows)).toEqual([
    '✓ Three: done c',
    '✓ Two: done b',
    '✓ Also done: One',
    '-- Last seen',
  ])
})

test('a named line shows two names, the newest first, and counts the rest as +N more', () => {
  const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
  const opened = after(null, names.map(n => `NEW: working | ${n} | x`).join('\n'), 10 * MIN)
  const closed = names.reduce((o, _, n) => after(o, `DONE: s${n + 1} | done`, (20 + 5 * n) * MIN), opened)

  expect(shape(page({ ...closed, lastLookAt: 15 * MIN }, 90 * MIN).rows)).toEqual([
    '✓ Seven: done',
    '✓ Six: done',
    '✓ Also done: Five, Four, +3 more',
    '-- Last seen',
  ])
})

test('the Help legend explains every mark a row or group title draws, once each', () => {
  const drawn = new Set([
    ...Object.values(SUBJECT_MARKS).map(m => m.mark),
    IDLE_MARK.mark,
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

const MANY = 40
const manyChanged = () =>
  statusOf(
    Array.from({ length: MANY }, (_, n) => subject(`s${n + 1}`, 'working', `Piece ${n + 1}`, 'under way', 10)),
    {
      lastLookAt: minutes(0),
    },
  )
const shownAt = (ids: string[], at: number) => Object.fromEntries(ids.map(id => [id, at]))
const firstSix = Array.from({ length: 6 }, (_, n) => `s${n + 1}`)
const namesAbove = (o: SessionStatus) => {
  const rows = statusPage(sessionOf(o, [], 30), minutes(30)).rows
  const lookAt = rows.findIndex(r => r.kind === 'look')
  return lookAt === -1 ? null : rows.slice(0, lookAt).flatMap(r => (r.kind === 'subject' ? [r.id] : []))
}

test('a look that showed the first 6 of 40 changed rows leaves the other 34 above the look line', () => {
  const looked = lookEnded(lookStarted(manyChanged(), minutes(20)), minutes(21), shownAt(firstSix, minutes(20)))!
  const above = namesAbove(looked)

  expect(above).toHaveLength(MANY - firstSix.length)
  expect(above?.some(id => firstSix.includes(id))).toBe(false)
})

test('a row shown only before its subject changed stays above the look line, and a missed row stays unseen through a later look that misses it too', () => {
  const first = lookEnded(lookStarted(manyChanged(), minutes(20)), minutes(21), shownAt(['s1', 's2'], minutes(5)))!
  const second = lookEnded(lookStarted(first, minutes(25)), minutes(26), shownAt(['s3'], minutes(25)))!

  expect(namesAbove(first)).toHaveLength(MANY)
  expect(namesAbove(second)).toHaveLength(MANY - 1)
  expect(second.missedInLastLook).toMatchObject({ s1: minutes(0), s40: minutes(0) })
})

test('a look that counts every row, as the desktop pane does, marks every subject seen', () => {
  const looked = lookEnded(lookStarted(manyChanged(), minutes(20)), minutes(21), 'all')!

  expect(looked.missedInLastLook).toEqual({})
  expect(statusPage(sessionOf(looked, [], 30), minutes(30)).rows.some(r => r.kind === 'look')).toBe(false)
})
