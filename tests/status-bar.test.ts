import { expect, test } from 'claude-code/testing'

import { alphaPerTest, atLeast, blockAt, interval, TOLERANCE } from '../evals/status-bar'

test('the old bar flips a step at a 20% rate one time in ten, as the eval plan computed', () => {
  expect(Math.round(atLeast(2, 3, 0.2) * 1000)).toBe(104)
})

test('each layer blocks at the counts the eval plan computed', () => {
  const replay = alphaPerTest('replay', 50)
  const short = alphaPerTest('short', 14)
  const spread = alphaPerTest('spread', 48)
  const judge = alphaPerTest('judge', 22)
  expect([blockAt(6, TOLERANCE.modelRule, replay), blockAt(6, TOLERANCE.missedProposal, replay)]).toEqual([5, 6])
  expect([
    blockAt(5, TOLERANCE.modelRule, short),
    blockAt(5, TOLERANCE.missedProposal, short),
    blockAt(5, TOLERANCE.judgeCheck, short),
  ]).toEqual([4, 5, 5])
  expect([88, 97, 83, 63, 45, 30, 23, 18, 9].map(n => blockAt(n, TOLERANCE.modelRule, spread))).toEqual([
    21, 23, 21, 17, 14, 11, 10, 9, 6,
  ])
  expect([24, 15, 9].map(n => blockAt(n, TOLERANCE.judgeCheck, judge))).toEqual([12, 9, 7])
})

test('a test that can never block says so, and the interval brackets the observed rate', () => {
  expect(blockAt(2, 0.5, 0.001)).toBe(3)
  const [low, high] = interval(3, 10)
  expect(low).toBeLessThan(0.3)
  expect(high).toBeGreaterThan(0.3)
  expect(Math.round(interval(0, 24)[1] * 1000)).toBe(142)
})
