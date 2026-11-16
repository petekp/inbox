import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import {
  addNewRows,
  closedTitleClock,
  NEW_FADE_MS,
  NEW_HOLD_MS,
  newRowIn,
  newRowShare,
  showNewRows,
  steppedShare,
  steppedTitleTint,
  TITLE_TINT,
} from '../hooks/arrivals'

test("a new row's tint stays full until its tab shows, holds, fades, and is gone once the fade ends", () => {
  const added = addNewRows(new Map(), { needsYou: [], findings: ['f1'] })
  expect(newRowShare(added.get('f1'), 0)).toBe(1)
  const onAsks = showNewRows(added, 'needsYou', 100)
  expect(onAsks.get('f1')?.shownAt).toBe(null)
  const shown = showNewRows(onAsks, 'findings', 1000)
  const row = shown.get('f1')
  const fadeAt = 1000 + NEW_HOLD_MS
  const midFade = fadeAt + NEW_FADE_MS / 2
  const endAt = fadeAt + NEW_FADE_MS
  expect(newRowShare(row, fadeAt)).toBe(1)
  expect(Math.abs(newRowShare(row, midFade) - 0.5) < 1e-9).toBe(true)
  expect(steppedShare(row, midFade + 1)).toBe(newRowShare(row, midFade))
  expect(steppedShare(row, midFade - 1) > newRowShare(row, midFade - 1)).toBe(true)
  expect(newRowShare(row, endAt)).toBe(0)
  expect(showNewRows(shown, 'findings', endAt).size).toBe(0)
  expect(addNewRows(shown, { findings: ['f1'] }).get('f1')).toBe(row)
  expect(steppedShare(showNewRows(added, 'findings', 0).get('f1'), NEW_HOLD_MS + 1)).toBe(1)
})

test("a closed row's title tint starts when a look first draws the row, and a row closed long ago has none", () => {
  const seen = new Map<string, number>()
  const clock = closedTitleClock(seen, 'q1', 5000, 7000)
  expect(clock?.shownAt).toBe(7000)
  expect(closedTitleClock(seen, 'q1', 5000, 7000 + NEW_HOLD_MS)).toEqual(clock)
  expect(steppedTitleTint(clock, 7000 + NEW_HOLD_MS)).toBe(TITLE_TINT)
  expect(steppedTitleTint(clock, 7000 + NEW_HOLD_MS + NEW_FADE_MS)).toBe(0)
  expect(closedTitleClock(seen, 'q1', 5000, 7000 + NEW_HOLD_MS + NEW_FADE_MS)).toBe(undefined)
  expect(closedTitleClock(seen, 'q2', 5000, 5000 + NEW_HOLD_MS + NEW_FADE_MS)).toBe(undefined)
  expect(closedTitleClock(seen, 'q1', 9000, 9000)?.shownAt).toBe(9000)
})

test("a new row's tint draws only in the tab that recorded it", () => {
  const added = addNewRows(new Map(), { findings: ['i1'] })
  expect(newRowIn(added, 'i1', 'findings')).toBe(added.get('i1'))
  expect(newRowIn(added, 'i1', 'needsYou')).toBe(undefined)
  expect(newRowIn(added, 'i2', 'findings')).toBe(undefined)
})
