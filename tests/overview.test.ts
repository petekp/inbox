import { expect, test } from 'claude-code/testing'

import { applyOverview, EMPTY_OVERVIEW, parseOverview, upgradeOverview } from '../hooks/overview'
import type { OverviewAnswer } from '../hooks/overview'

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
