import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { askStatus, parseStatus } from '../hooks/status'
import { applyStatus } from '../hooks/status-ops'
import { goalBlocks } from '../hooks/status-prompt-goal'
import { nextGoalRetry } from '../hooks/status-prompt'
import type { SessionStatus } from '../types'
import { after, MIN } from './status-helpers'

const WORK = 'NEW: working | Import | CSV works\nNEW: queued | Dark mode | not started'
const MET = 'GOAL: Import ready to demo | done Import works; done Error messages'
const PROMPT = '<subjects>\n…\n</subjects>'

const met = (): SessionStatus => after(after(null, WORK, 10 * MIN), MET, 20 * MIN)
const isAsked = (o: SessionStatus | null) => goalBlocks(o, 30 * MIN).some(b => b.startsWith('<next-goal>'))

async function asked(last: SessionStatus | null, answers: string[]) {
  const prompts: string[] = []
  const { last: applied } = await askStatus(async retry => {
    prompts.push(retry ?? PROMPT)
    return { text: answers.shift() ?? null }
  }, nextGoalRetry(last, PROMPT))

  return { prompts, applied: parseStatus(applied.text) }
}

test('the call is asked for the next goal while no goal runs and none is suggested', () => {
  expect(met().goal?.metAt).not.toBeNull()
  expect(isAsked(met())).toBe(true)
  expect(isAsked(null)).toBe(true)
  expect(isAsked(after(met(), 'SUGGEST: Import shipped to the store', 25 * MIN))).toBe(false)
  expect(isAsked(after(null, `${WORK}\nGOAL: Import ready to demo | working Import works; queued Error messages`, 20 * MIN))).toBe(false)
})

test('an answer with no GOAL or SUGGEST line while the next goal is asked is asked once more, with that answer, and the second applies', async () => {
  const { prompts, applied } = await asked(met(), ['NO CHANGE', 'NO CHANGE\nSUGGEST: Import shipped to the store'])

  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain(`${PROMPT}\n<your-answer>\nNO CHANGE\n</your-answer>`)
  expect(applied).toEqual({ kind: 'ops', ops: [{ kind: 'suggest', text: 'Import shipped to the store' }] })
})

test('an answer that gives the next goal, or SUGGEST -, is asked once, and a second answer that does not parse leaves the first', async () => {
  expect((await asked(met(), ['SUGGEST: -'])).prompts).toHaveLength(1)
  expect((await asked(after(met(), 'SUGGEST: Import shipped', 25 * MIN), ['NO CHANGE'])).prompts).toHaveLength(1)

  const unread = await asked(met(), ['SET: Import | working | CSV and JSON work', 'Sure, here you go.'])
  expect(unread.prompts).toHaveLength(2)
  expect(unread.applied).toEqual({
    kind: 'ops',
    ops: [{ kind: 'set', ref: 'Import', status: 'working', text: 'CSV and JSON work' }],
  })
})

test('an answer of only SUGGEST - while nothing is suggested changes nothing, as NO CHANGE does', () => {
  const none = parseStatus('NO CHANGE\nSUGGEST: -')!

  expect(applyStatus(null, none, 30 * MIN, new Set())).toBeNull()
  expect(applyStatus(met(), none, 30 * MIN, new Set())).toEqual(met())
})
