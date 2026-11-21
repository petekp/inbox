import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import {
  CHILD_GAP_PT,
  HEAD_GAP_PT,
  INSIDE_GAP_PT,
  ITEM_GAP_PT,
  LIST_GAP_PT,
  LIST_MARGIN_PT,
  ROW_PAD_PT,
  SECTION_GAP_PT,
  SPACE_UNIT,
} from '../core/view/layout'

test('the gaps rise from inside an item to between sections, each a whole number of the space unit', () => {
  const gaps = [INSIDE_GAP_PT, LIST_GAP_PT, CHILD_GAP_PT, ITEM_GAP_PT, SECTION_GAP_PT]
  expect([...new Set(gaps)].sort((a, b) => a - b)).toEqual(gaps)
  expect(gaps.filter(gap => gap % SPACE_UNIT !== 0)).toEqual([])
})

test('a heading sits closer to its first item than two items sit, so it reads as part of what it heads', () => {
  expect(HEAD_GAP_PT < ITEM_GAP_PT).toBe(true)
})

test('two rows’ padding fills the gap between them, and a list’s title and fold sit closer to its rows’ text than two rows’ text', () => {
  expect(2 * ROW_PAD_PT).toBe(ITEM_GAP_PT)
  expect(LIST_MARGIN_PT + ROW_PAD_PT < ITEM_GAP_PT).toBe(true)
})
