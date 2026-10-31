import { expect, test } from 'claude-code/testing'

import { asksText, lookEnded, lookStarted, LOOK_MIN_MS } from '../hooks/status-children'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import {
  CLOSED_MARKS,
  FINDING_GROUPS,
  HELD_MARK,
  MARK_LEGEND,
  mergedLine,
  nameBeforeStall,
  statusKeyPlan,
  PR_MARKS,
  RUNNING_FRAMES,
  SUBJECT_MARKS,
} from '../hooks/view'
import { IDLE_MARK } from '../hooks/help'
import type { Item } from '../types'
import { MIN, after, askItem, page, shape } from './status-helpers'

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

  expect(shape(page(o, 12 * MIN).rows)).toEqual(['◐ Offline mode: queue built'])
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
