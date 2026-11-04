import { expect, test } from 'claude-code/testing'
import { noteStatusDrawn, takeShownRows } from '../hooks/pane-status-shown'
import { exactly, type Lines, type RowTop } from '../hooks/pane-status-tops'

const draw = (
  tops: Map<string, RowTop>,
  pageTop: Lines | null,
  offset: number,
  now: number,
  bodyRows = 4,
  isUnplacedShown = true,
) => noteStatusDrawn({ pageTop, tops, scroll: { offset, bodyRows }, now, isUnplacedShown })

const exactTops = new Map<string, RowTop>([
  ['s1', exactly(0)],
  ['s2', exactly(5)],
  ['s3', 'unknown'],
])

test('a Status row counts as shown while its first line is in the window, and where rows with no known place count as shown, a row whose line is not counted does', () => {
  takeShownRows()
  draw(exactTops, exactly(2), 0, 100)
  draw(exactTops, exactly(2), 4, 200)

  expect(takeShownRows()).toEqual({ s1: 100, s2: 200, s3: 200 })
})

test('where rows with no known place count as shown, every Status row does while the lines above the Status are not counted', () => {
  draw(exactTops, null, 0, 100)

  expect(takeShownRows()).toEqual({ s1: 100, s2: 100, s3: 100 })
})

test('where rows with no known place count as unseen, a row whose line is not counted, and every row while the lines above the Status are not counted, stay unseen', () => {
  draw(exactTops, exactly(2), 0, 100, 4, false)
  draw(exactTops, exactly(2), 4, 200, 4, false)
  expect(takeShownRows()).toEqual({ s1: 100, s2: 200 })

  draw(exactTops, null, 0, 100, 4, false)
  expect(takeShownRows()).toEqual({})
})

test('a row whose first line may sit below the window or above it does not count as shown at that draw', () => {
  const tops = new Map<string, RowTop>([
    ['sure', { least: 1, most: 3 }],
    ['maybe-below', { least: 2, most: 4 }],
  ])
  draw(tops, exactly(0), 0, 100)
  expect(takeShownRows()).toEqual({ sure: 100 })

  draw(tops, exactly(0), 2, 100)
  expect(takeShownRows()).toEqual({ 'maybe-below': 100 })
})

test('a row the windows covered while scrolling counts as shown from when they started covering, and a jump past the window does not cover the lines it skips', () => {
  const tops = new Map<string, RowTop>([['wide', { least: 3, most: 6 }]])
  draw(tops, exactly(0), 0, 100)
  draw(tops, exactly(0), 2, 200)
  draw(tops, exactly(0), 4, 300)
  expect(takeShownRows()).toEqual({ wide: 100 })

  draw(tops, exactly(0), 0, 100)
  draw(tops, exactly(0), 5, 200)
  expect(takeShownRows()).toEqual({})
})

test('a row counts as shown only when its first line is whole in the window wherever in its range the page top sits', () => {
  const tops = new Map<string, RowTop>([
    ['s1', exactly(0)],
    ['s2', exactly(1)],
  ])
  draw(tops, { least: 1, most: 3 }, 0, 100)
  expect(takeShownRows()).toEqual({ s1: 100 })

  draw(tops, { least: 1, most: 3 }, 2, 100)
  expect(takeShownRows()).toEqual({ s2: 100 })
})

test('windows that only touch do not cover the line between them, and a widened page top needs its range more of overlap', () => {
  draw(new Map([['edge', { least: 3, most: 4 }]]), exactly(0), 0, 100)
  draw(new Map([['edge', { least: 3, most: 4 }]]), exactly(0), 4, 200)
  expect(takeShownRows()).toEqual({})

  const wide = new Map<string, RowTop>([['wide', { least: 1, most: 6 }]])
  draw(wide, { least: 0, most: 2 }, 0, 100, 6)
  draw(wide, { least: 0, most: 2 }, 4, 200, 6)
  expect(takeShownRows()).toEqual({})

  draw(wide, { least: 0, most: 2 }, 0, 100, 6)
  draw(wide, { least: 0, most: 2 }, 3, 200, 6)
  expect(takeShownRows()).toEqual({ wide: 100 })
})

test('a row added above the window after a scroll does not count as covered by the windows drawn before it', () => {
  const before = new Map<string, RowTop>([['a', exactly(0)]])
  const after = new Map<string, RowTop>([
    ['a', exactly(0)],
    ['b', exactly(2)],
  ])
  draw(before, exactly(0), 0, 100, 10)
  draw(before, exactly(0), 5, 200, 10)
  draw(after, exactly(0), 5, 300, 10)

  expect(takeShownRows()).toEqual({ a: 100 })
})
