import { expect, test } from 'claude-code/testing'
import {
  addNewRows,
  isBarFading,
  isNewRowFading,
  NEW_FADE_MS,
  NEW_HOLD_MS,
  newRowIn,
  newRowShare,
  settledBarClock,
  showNewRows,
  steppedShare,
} from '../hooks/arrivals'

test("a new row's bar stays full until its tab shows, holds, fades, and is gone once the fade ends", () => {
  const added = addNewRows(new Map(), { needsYou: [], findings: ['f1'] })
  expect(newRowShare(added.get('f1'), 0)).toBe(1)
  const onAsks = showNewRows(added, 'needsYou', 100)
  expect(onAsks.get('f1')?.shownAt).toBe(null)
  expect(isNewRowFading(onAsks, 100)).toBe(false)
  const shown = showNewRows(onAsks, 'findings', 1000)
  const row = shown.get('f1')
  const fadeAt = 1000 + NEW_HOLD_MS
  const midFade = fadeAt + NEW_FADE_MS / 2
  const endAt = fadeAt + NEW_FADE_MS
  expect(newRowShare(row, fadeAt)).toBe(1)
  expect(Math.abs(newRowShare(row, midFade) - 0.5) < 1e-9).toBe(true)
  expect(steppedShare(row, midFade + 1)).toBe(newRowShare(row, midFade))
  expect(steppedShare(row, midFade - 1) > newRowShare(row, midFade - 1)).toBe(true)
  expect(isNewRowFading(shown, midFade)).toBe(true)
  expect(newRowShare(row, endAt)).toBe(0)
  expect(isNewRowFading(shown, endAt)).toBe(false)
  expect(showNewRows(shown, 'findings', endAt).size).toBe(0)
  expect(addNewRows(shown, { findings: ['f1'] }).get('f1')).toBe(row)
  expect(steppedShare(showNewRows(added, 'findings', 0).get('f1'), NEW_HOLD_MS + 1)).toBe(1)
})

test("a settled row's bar holds and fades on the clock of a new row's bar, from the moment the row closed", () => {
  const clock = settledBarClock(5000)
  expect(newRowShare(clock, 5000 + NEW_HOLD_MS)).toBe(1)
  expect(Math.abs(newRowShare(clock, 5000 + NEW_HOLD_MS + NEW_FADE_MS / 2) - 0.5) < 1e-9).toBe(true)
  expect(newRowShare(clock, 5000 + NEW_HOLD_MS + NEW_FADE_MS)).toBe(0)
  expect(isBarFading([clock], 5000 + NEW_HOLD_MS)).toBe(true)
  expect(isBarFading([clock], 5000 + NEW_HOLD_MS + NEW_FADE_MS)).toBe(false)
})

test("a new row's bar draws only in the tab that recorded it", () => {
  const added = addNewRows(new Map(), { findings: ['i1'] })
  expect(newRowIn(added, 'i1', 'findings')).toBe(added.get('i1'))
  expect(newRowIn(added, 'i1', 'needsYou')).toBe(undefined)
  expect(newRowIn(added, 'i2', 'findings')).toBe(undefined)
})
