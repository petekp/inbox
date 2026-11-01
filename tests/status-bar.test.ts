import { expect, test } from 'claude-code/testing'

import { alphaPerTest, atLeast, blockAt, interval, TOLERANCE } from '../evals/status-bar'
import { gradeReplay } from '../evals/status-grade'
import { runReplay } from '../evals/status-replay'
import type { Agent } from '../evals/status-replay'
import { REPLAYS } from '../evals/status-replays'
import { holdFailures, isBlocking, layerTests } from '../evals/status-report'
import type { ReplayRun } from '../evals/status-report'
import { GOOD_RUNS } from './status-evals-runs'

const longTurn = REPLAYS.find(r => r.name === 'long-turn')!

async function longTurnRun(agent: Agent, run: number, isPlanted: boolean): Promise<ReplayRun> {
  const answers = [...GOOD_RUNS['long-turn']!]
  if (isPlanted) answers[1] = 'SET: s2 | working | reading the ranking code'
  const results = await runReplay(longTurn, { agent, ask: async () => ({ text: answers.shift()! }) })
  const steps = gradeReplay(longTurn, results).map((rules, i) => ({
    label: results[i]!.label,
    page: results[i]!.text,
    calls: results[i]!.calls,
    isStatusFailed: results[i]!.isStatusFailed,
    rules,
  }))
  return { agent, name: longTurn.name, run, error: null, steps }
}

async function blockingWith(planted: number): Promise<string[]> {
  const runs = await Promise.all(
    [0, 1, 2, 3, 4, 5].map(n => longTurnRun(n < 3 ? 'claude' : 'codex', n % 3, n < planted)),
  )
  const cases = [{ replay: longTurn, runs }]

  return [
    ...layerTests(cases, ['claude', 'codex'], false)
      .filter(isBlocking)
      .map(t => t.name),
    ...holdFailures(cases),
  ]
}

test('a planted failure blocks its replay step when most runs show it, and good runs block nothing', async () => {
  expect(await blockingWith(0)).toEqual([])
  expect(await blockingWith(1)).toEqual([])
  expect(await blockingWith(6)).toContain('long-turn step 2 no-news-no-move')
})

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
