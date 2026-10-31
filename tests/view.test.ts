import { expect, test } from 'claude-code/testing'

import { actionLines } from '../hooks/action-plan'

test('a row’s follow-ups stay on its buttons’ last line only when all of them fit there, and otherwise start the next line together', async () => {
  const spacing = { gap: 1, separator: 0 }
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 20 })).toEqual({
    lines: [[0, 1, 2, 3]],
    isFollowUpLineNew: false,
  })
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 14 })).toEqual({
    lines: [
      [0, 1],
      [2, 3],
    ],
    isFollowUpLineNew: true,
  })
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 5 })).toEqual({
    lines: [[0], [1], [2], [3]],
    isFollowUpLineNew: true,
  })
  expect(actionLines([6, 6], [1, 1], { ...spacing, width: 10 })).toEqual({
    lines: [[0], [1, 2, 3]],
    isFollowUpLineNew: false,
  })
  expect(actionLines([6, 6], [1, 1], { ...spacing, separator: 1, width: 10 })).toEqual({
    lines: [[0], [1], [2, 3]],
    isFollowUpLineNew: true,
  })
  expect(actionLines([], [3, 3], { ...spacing, width: 5 })).toEqual({ lines: [[0], [1]], isFollowUpLineNew: false })
})
