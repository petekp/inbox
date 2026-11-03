import { expect, test } from 'claude-code/testing'
import { noteStatusDrawn, takeShownRows } from '../hooks/pane-status-shown'
import { exactly, type Lines, type RowTop } from '../hooks/pane-status-tops'

const draw = (tops: Map<string, RowTop>, pageTop: Lines | null, offset: number, now: number) =>
  noteStatusDrawn({ pageTop, tops, scroll: { offset, bodyRows: 4 }, now })

const exactTops = new Map<string, RowTop>([
  ['s1', exactly(0)],
  ['s2', exactly(5)],
  ['s3', 'unknown'],
])

test('a Status row counts as shown while its first line is in the window, and a row whose line is not counted counts as shown', () => {
  takeShownRows()
  draw(exactTops, exactly(2), 0, 100)
  draw(exactTops, exactly(2), 4, 200)

  expect(takeShownRows()).toEqual({ s1: 100, s2: 200, s3: 200 })
})

test('every Status row counts as shown when the lines above the Status are not counted', () => {
  draw(exactTops, null, 0, 100)

  expect(takeShownRows()).toEqual({ s1: 100, s2: 100, s3: 100 })
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
