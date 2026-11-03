import { expect, test } from 'claude-code/testing'
import { noteStatusDrawn, takeShownRows } from '../hooks/pane-status-shown'
import type { RowTop } from '../hooks/pane-status-tops'

const tops = new Map<string, RowTop>([
  ['s1', 0],
  ['s2', 5],
  ['s3', 'unknown'],
])
const draw = (pageTop: number | null, offset: number, now: number) =>
  noteStatusDrawn({ look: 'terminal', pageTop, tops, scroll: { offset, bodyRows: 4 }, now })

test('the terminal counts a Status row as shown while its first line is in the window, and a row whose line it cannot count as shown', () => {
  takeShownRows()
  draw(2, 0, 100)
  draw(2, 4, 200)

  expect(takeShownRows()).toEqual({ s1: 100, s2: 200, s3: 200 })
})

test('the terminal counts every Status row as shown when it cannot count the lines above the Status, and desktop counts every subject', () => {
  draw(null, 0, 100)
  expect(takeShownRows()).toEqual({ s1: 100, s2: 100, s3: 100 })

  noteStatusDrawn({ look: 'desktop' })
  expect(takeShownRows()).toBe('all')
  expect(takeShownRows()).toEqual({})
})
