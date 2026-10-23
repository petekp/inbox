import { expect, test } from 'claude-code/testing'

import {
  applyOverview,
  awayOf,
  EMPTY_OVERVIEW,
  HERE_MS,
  looked,
  orderParts,
  parseOverview,
  SHORT_MS,
  upgradeOverview,
  workOf,
} from '../hooks/overview'
import { overviewPage, pointerText, QUIET_TEXT } from '../hooks/view'
import type { OverviewAnswer } from '../hooks/overview'
import type { Overview } from '../types'

const written = (text: string) => {
  const answer = parseOverview(text)
  if (answer?.kind !== 'written') throw new Error('not written')

  return answer
}

test('an answer of UNCHANGED keeps the last Overview, and one with no headline is unusable', () => {
  const last = written('HEADLINE: Adding offline mode').overview

  expect(applyOverview(last, parseOverview('UNCHANGED')!)).toBe(last)
  expect(applyOverview(null, parseOverview('UNCHANGED')!)).toBeNull()
  expect(parseOverview('STATUS: fine')).toBeNull()
  expect(parseOverview(null)).toBeNull()
  expect(parseOverview('')).toBeNull()
})

test('reads every line of the answer, tolerating dashes and bullets', () => {
  const { overview } = written(
    [
      'KIND: coordinator',
      'STATE: stuck',
      'HEADLINE: Rewriting the import',
      '- STATUS: Waiting on the parser.',
      'COURSE: Moved to streaming because files are large.',
      'QUEUE: working | Parser rewrite | Reads the new format',
      'QUEUE: waits-on-you | Pick a format',
      'QUEUE: bogus | Dropped',
      'QUEUE: done |',
      'WORKS: done | Old format still reads',
      'OPEN: unknown | Memory use on large files | -',
      'NEXT: queued | Error reporting',
      'SINCE: done | Parser started',
      'STREAM: working | Parser: reads the new format',
    ].join('\n'),
  )

  expect(overview).toMatchObject({
    isCoordinator: true,
    state: 'stuck',
    headline: 'Rewriting the import',
    status: 'Waiting on the parser.',
    course: 'Moved to streaming because files are large.',
  })
  expect(overview.queue).toEqual([
    { status: 'working', text: 'Parser rewrite', detail: 'Reads the new format' },
    { status: 'waits-on-you', text: 'Pick a format', detail: null },
  ])
  expect(overview.open).toEqual([{ status: 'unknown', text: 'Memory use on large files', detail: null }])
  expect(overview.next).toHaveLength(1)
  expect(overview.since).toHaveLength(1)
  expect(overview.workstreams).toHaveLength(1)
})

test('reads a list written as a key alone on a line with bulleted items under it', () => {
  const { overview } = written('HEADLINE: h\nQUEUE:\n- working | a\n- done | b | why\nWORKS:\n* done | c\nSTATUS: s')

  expect(overview.queue.map(i => i.text)).toEqual(['a', 'b'])
  expect(overview.works.map(i => i.text)).toEqual(['c'])
  expect(overview.status).toBe('s')
})

test('clips texts to their word limits and lists to six items', () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
  const items = Array.from({ length: 9 }, (_, i) => `QUEUE: queued | item ${i}`).join('\n')
  const { overview } = written(
    `HEADLINE: ${long(20)}\nSTATUS: ${long(40)}\nQUEUE: working | ${long(20)} | ${long(30)}\n${items}`,
  )

  expect(overview.headline.split(' ')).toHaveLength(12)
  expect(overview.headline.endsWith('…')).toBe(true)
  expect(overview.status.split(' ')).toHaveLength(30)
  expect(overview.queue).toHaveLength(6)
  expect(overview.queue[0]!.text.split(' ')).toHaveLength(12)
  expect(overview.queue[0]!.detail!.split(' ')).toHaveLength(20)
})

test('a new topic folds the last headline into one earlier line, and the same topic keeps the earlier ones', () => {
  const first = written('HEADLINE: Fixing the checkout total').overview
  const folded = applyOverview(
    first,
    written('TOPIC: new\nFOLDED: Fixed the checkout total; committed.\nHEADLINE: Adding dark mode\nCOURSE: ignored'),
  )!

  expect(folded.headline).toBe('Adding dark mode')
  expect(folded.course).toBe('')
  expect(folded.earlier).toEqual(['Fixed the checkout total; committed.'])

  const same = applyOverview(folded, written('TOPIC: same\nHEADLINE: Adding dark mode to settings'))!
  expect(same.earlier).toEqual(folded.earlier)

  const unfolded = applyOverview(first, written('TOPIC: new\nHEADLINE: Something else'))!
  expect(unfolded.earlier).toEqual(['Fixing the checkout total'])
})

test('keeps only the six newest earlier lines', () => {
  let current = written('HEADLINE: Topic 0').overview
  for (let n = 1; n <= 8; n++)
    current = applyOverview(current, written(`TOPIC: new\nFOLDED: Topic ${n - 1} left\nHEADLINE: Topic ${n}`))!

  expect(current.earlier).toEqual([3, 4, 5, 6, 7, 8].map(n => `Topic ${n - 1} left`))
})

test('a saved Overview with missing or wrong fields upgrades to the current shape', () => {
  expect(upgradeOverview(null)).toBeNull()
  expect(upgradeOverview({})).toBeNull()
  expect(
    upgradeOverview({ headline: 'h', queue: [{ status: 'bogus', text: 't', detail: null }, 4], earlier: ['a', 3] }),
  ).toEqual({
    ...EMPTY_OVERVIEW,
    headline: 'h',
    earlier: ['a'],
  })
  const answer: OverviewAnswer = written('HEADLINE: h\nQUEUE: done | x')
  expect(upgradeOverview(answer.kind === 'written' ? answer.overview : null)?.queue).toHaveLength(1)
})

const guide = (over: Partial<Overview> = {}): Overview => ({
  ...EMPTY_OVERVIEW,
  headline: 'Adding offline mode',
  status: 'Going well.',
  queue: [{ status: 'working', text: 'Cache layer', detail: null }],
  works: [{ status: 'done', text: 'Reads work offline', detail: null }],
  open: [{ status: 'problem', text: 'Sync conflicts', detail: null }],
  next: [{ status: 'queued', text: 'Sync on reconnect', detail: null }],
  since: [{ status: 'done', text: 'Cache layer started', detail: null }],
  ...over,
})

test('how long the person was away falls in three bands, and no earlier look counts as long', () => {
  expect(awayOf(null, 1000)).toBe('long')
  expect(awayOf(1000, 1000 + HERE_MS - 1)).toBe('here')
  expect(awayOf(1000, 1000 + HERE_MS)).toBe('short')
  expect(awayOf(1000, 1000 + SHORT_MS - 1)).toBe('short')
  expect(awayOf(1000, 1000 + SHORT_MS)).toBe('long')
})

test('the work is running, stopped, finished or idle', () => {
  const calm = { isTurnRunning: false, isStopped: false }
  expect(workOf(guide(), { ...calm, isTurnRunning: true })).toBe('running')
  expect(workOf(guide(), { ...calm, isStopped: true })).toBe('stopped')
  expect(workOf(guide({ state: 'stuck' }), calm)).toBe('stopped')
  expect(workOf(guide({ queue: [{ status: 'waits-on-you', text: 'x', detail: null }] }), calm)).toBe('stopped')
  expect(workOf(guide({ state: 'finished' }), calm)).toBe('finished')
  expect(workOf(guide(), calm)).toBe('idle')
})

test('orders the parts for each pair of away and work, leaving out empty parts and next while items are queued', () => {
  const queuedBehind = guide({ queue: [{ status: 'queued', text: 'Cache layer', detail: null }] })
  expect(orderParts(guide(), 'here', 'running')).toEqual(['headline', 'queue'])
  expect(orderParts(guide(), 'short', 'running')).toEqual(['headline', 'since', 'queue', 'open'])
  expect(orderParts(guide(), 'short', 'idle')).toEqual(['headline', 'since', 'queue', 'open'])
  expect(orderParts(guide(), 'long', 'idle')).toEqual(['headline', 'status', 'since', 'queue', 'next', 'open'])
  expect(orderParts(guide({ queue: [{ status: 'done', text: 'x', detail: null }] }), 'long', 'running')).toEqual([
    'headline',
    'status',
    'since',
    'queue',
    'next',
    'open',
  ])
  expect(orderParts(queuedBehind, 'long', 'idle')).not.toContain('next')
  expect(orderParts(guide(), 'long', 'stopped')).toEqual([
    'headline',
    'status',
    'pointer',
    'since',
    'queue',
    'next',
    'open',
  ])
  expect(orderParts(guide({ state: 'finished' }), 'long', 'finished')).toEqual(['headline', 'status', 'works', 'open'])
})

test('says nothing new when the person was away and nothing changed, and not while they are here', () => {
  const calm = guide({ since: [] })
  expect(orderParts(calm, 'short', 'idle')).toEqual(['headline', 'quiet', 'queue', 'open'])
  expect(orderParts(calm, 'here', 'idle')).not.toContain('quiet')
})

test('a changed course leads right after the headline, in any order', () => {
  const changed = guide({ course: 'Moved to streaming.' })
  expect(orderParts(changed, 'here', 'running')).toEqual(['headline', 'course', 'queue'])
  expect(orderParts(changed, 'long', 'finished').slice(0, 3)).toEqual(['headline', 'course', 'status'])
})

test('a coordinator shows its streams first, then what changed and its own steps', () => {
  const lead = guide({ isCoordinator: true, workstreams: [{ status: 'working', text: 'Parser', detail: null }] })
  expect(orderParts(lead, 'long', 'idle')).toEqual(['headline', 'workstreams', 'since', 'queue', 'next', 'open'])
  expect(orderParts(lead, 'here', 'running')).toEqual(['headline', 'workstreams', 'since', 'queue', 'next', 'open'])
})

test('earlier topics come last, after every other part', () => {
  expect(orderParts(guide({ earlier: ['Fixed the total'] }), 'here', 'running').at(-1)).toBe('earlier')
})

test('a look clears what changed and the course, and records when', () => {
  const seen = looked(guide({ course: 'Moved to streaming.' }), 5000)!

  expect(seen.since).toEqual([])
  expect(seen.course).toBe('')
  expect(seen.lastLookAt).toBe(5000)
  expect(seen.queue).toEqual(guide().queue)
  expect(looked(null, 1)).toBeNull()
})

test('the course stays through later replies until a look or a new topic, and a look time survives replies', () => {
  const first = applyOverview(
    { ...guide(), lastLookAt: 7 },
    written('HEADLINE: Adding offline mode\nCOURSE: Moved to streaming.'),
  )!
  const next = applyOverview(first, written('HEADLINE: Adding offline mode'))!

  expect(next.course).toBe('Moved to streaming.')
  expect(next.lastLookAt).toBe(7)
  expect(applyOverview(next, written('TOPIC: new\nHEADLINE: Other'))!.course).toBe('')
})

test('the page counts what waits on the person and draws parts in order', () => {
  expect(pointerText(0)).toBeNull()
  expect(pointerText(1)).toBe('1 thing waits on you in Inbox.')
  expect(pointerText(3)).toBe('3 things wait on you in Inbox.')
  const stopped = { ledger: { overview: guide({ state: 'stuck', lastLookAt: 0 }) }, presence: { isTurnRunning: false } }
  const page = overviewPage(stopped, SHORT_MS * 2, 2)

  expect(page.lead.map(l => l.id)).toEqual(['headline', 'status', 'pointer'])
  expect(page.lead[2]?.text).toBe('2 things wait on you in Inbox.')
  expect(page.lead.find(l => l.id === 'status')?.text).toBe('Going well.')
  expect(page.sections.map(x => x.id)).toEqual(['since', 'queue', 'next', 'open'])
  const here = overviewPage({ ...stopped, presence: { isTurnRunning: true } }, 1000, 2)
  expect(here.lead.map(l => l.text)).toEqual(['Adding offline mode', 'Working…'])
  const quiet = overviewPage(
    { ledger: { overview: guide({ since: [], lastLookAt: 0 }) }, presence: { isTurnRunning: false } },
    SHORT_MS / 2,
  )
  expect(quiet.lead.map(l => l.text)).toEqual(['Adding offline mode', QUIET_TEXT])
})

test('a line that only starts with a key word is not a key line', () => {
  const { overview } = written(
    'HEADLINE: h\nSTATUS: fine\nOPENING the file went well\nNEXTSTEP is a word\nQUEUE:\n- working | a',
  )

  expect(overview.headline).toBe('h')
  expect(overview.status).toBe('fine')
  expect(overview.queue.map(i => i.text)).toEqual(['a'])
})
