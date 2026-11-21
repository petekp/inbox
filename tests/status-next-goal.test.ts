import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { askStatus, parseStatus } from '../core/domain/status'
import { applyStatus } from '../core/domain/status-ops'
import { goalBlocks } from '../core/domain/status-prompt-goal'
import { statusRetry } from '../core/domain/status-retry'
import type { SessionStatus } from '../types'
import { after, MIN } from './status-helpers'

const WORK = 'NEW: working | Import | CSV works\nNEW: queued | Dark mode | not started'
const MET = 'GOAL: Import ready to demo | done Import works; done Error messages'
const PROMPT = '<subjects>\n…\n</subjects>'

const met = (): SessionStatus => after(after(null, WORK, 10 * MIN), MET, 20 * MIN)
const isAsked = (o: SessionStatus | null) => goalBlocks(o, 30 * MIN).some(b => b.startsWith('<next-goal>'))

async function asked(last: SessionStatus | null, answers: string[]) {
  const prompts: string[] = []
  const { answer: applied } = await askStatus(
    async retry => {
      prompts.push(retry ?? PROMPT)
      return { text: answers.shift() ?? null }
    },
    statusRetry({ last, asks: [], tasks: [], now: 30 * MIN }, PROMPT),
  )

  return { prompts, applied }
}

test('the call is asked for the next goal while no goal runs and none is suggested', () => {
  expect(met().goal?.metAt).not.toBeNull()
  expect(isAsked(met())).toBe(true)
  expect(isAsked(null)).toBe(true)
  expect(isAsked(after(met(), 'SUGGEST: Import shipped to the store', 25 * MIN))).toBe(false)
  expect(
    isAsked(after(null, `${WORK}\nGOAL: Import ready to demo | working Import works; queued Error messages`, 20 * MIN)),
  ).toBe(false)
})

test('an answer with no GOAL or SUGGEST line while the next goal is asked is asked once more, with that answer, and only the goal lines of the second are added to the first', async () => {
  const { prompts, applied } = await asked(met(), [
    'NEW: working | Store listing | screenshots taken\nDONE: Dark mode | shipped',
    'NEW: working | Store page | redone\nSUGGEST: Import shipped to the store',
  ])

  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain(`${PROMPT}\n<your-answer>\nNEW: working | Store listing | screenshots taken`)
  expect(applied).toEqual({
    kind: 'ops',
    ops: [
      { kind: 'new', status: 'working', name: 'Store listing', text: 'screenshots taken' },
      { kind: 'done', ref: 'Dark mode', text: 'shipped' },
      { kind: 'suggest', text: 'Import shipped to the store' },
    ],
  })
  expect((await asked(met(), ['NO CHANGE', 'SUGGEST: Import shipped'])).applied).toEqual({
    kind: 'ops',
    ops: [{ kind: 'suggest', text: 'Import shipped' }],
  })
})

test('an answer that gives the next goal, or SUGGEST -, is asked once, and a second answer with no goal line leaves the first', async () => {
  expect((await asked(met(), ['SUGGEST: -'])).prompts).toHaveLength(1)
  expect((await asked(after(met(), 'SUGGEST: Import shipped', 25 * MIN), ['NO CHANGE'])).prompts).toHaveLength(1)

  const unread = await asked(met(), ['SET: Import | working | CSV and JSON work', 'Sure, here you go.'])
  expect(unread.prompts).toHaveLength(2)
  expect(unread.applied).toEqual({
    kind: 'ops',
    ops: [{ kind: 'set', ref: 'Import', status: 'working', text: 'CSV and JSON work' }],
  })
})

test('an answer that meets the goal with no GOAL or SUGGEST line is asked once more for the next goal', async () => {
  const running = after(
    null,
    `${WORK}\nGOAL: Import ready to demo | working Import works; queued Error messages`,
    20 * MIN,
  )
  const meets = 'DONE: Import works | shipped\nDONE: Error messages | clear'
  const { prompts, applied } = await asked(running, [meets, 'SUGGEST: Import shipped to the store'])

  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain('The goal is met, and no next goal is suggested.')
  expect(applied?.kind === 'ops' && applied.ops.at(-1)).toEqual({
    kind: 'suggest',
    text: 'Import shipped to the store',
  })
  expect((await asked(running, ['DONE: Import works | shipped'])).prompts).toHaveLength(1)
})

test('an answer of only SUGGEST - while nothing is suggested changes nothing but the note of the work it judged', () => {
  const none = parseStatus('NO CHANGE\nSUGGEST: -')!

  expect(applyStatus(null, none, 30 * MIN, new Set())).toBeNull()
  expect(applyStatus(met(), none, 30 * MIN, new Set())).toEqual({ ...met(), noGoalFor: expect.any(String) })
})

test('after SUGGEST: -, an answer with no goal line is asked once more only when the goal, the open subjects or the asks changed', async () => {
  const declined = applyStatus(met(), { kind: 'ops', ops: [{ kind: 'suggest', text: null }] }, 22 * MIN, new Set())
  const moved = declined && after(declined, 'NEW: working | Search | started', 25 * MIN)

  expect((await asked(declined, ['NO CHANGE'])).prompts).toHaveLength(1)
  expect((await asked(moved, ['NO CHANGE', 'SUGGEST: -'])).prompts).toHaveLength(2)
})

test('while the Status holds nothing, an answer that adds no subject is not asked for the next goal, and one that adds a subject is', async () => {
  expect((await asked(null, ['NO CHANGE', 'SUGGEST: -'])).prompts).toHaveLength(1)
  expect((await asked(null, ['NEW: working | Search | started', 'SUGGEST: -'])).prompts).toHaveLength(2)
})
