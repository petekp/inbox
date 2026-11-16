import { afterEach, beforeEach, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createInbox } from '../src/host'
import { deps, endAgent, endWorld, pi, prompt, record, settle, startWorld, state, w } from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

test('with INBOX_RECORDED_ITEMS_ONLY=1, a reply whose question the agent did not record adds no ask', async () => {
  createInbox(pi(), { ...deps(), recordedItemsOnly: '1' })
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().pending).toEqual([])
  expect(state().ledger.items).toEqual([])
})

test('omp sends a quoted candidate in the next hidden inbox message once', async () => {
  createInbox(pi(), { ...deps(), recordedItemsOnly: '1' })
  w.reply =
    'NEW: decide | - | Should the command be greet or hello? | greet / hello | greet | - | We should choose whether the command is greet or hello.'

  await prompt('Add a greeting CLI')
  await endAgent('We should choose whether the command is greet or hello.')
  await settle()
  expect(state().ledger.unrecordedDecisions).toEqual([
    {
      kind: 'question',
      ask: 'Should the command be greet or hello?',
      quote: 'We should choose whether the command is greet or hello.',
    },
  ])

  const next = await prompt('Continue')
  expect(next.message.content).toContain('Possibly unrecorded decisions in your last reply:')
  expect(next.message.content).toContain('We should choose whether the command is greet or hello.')
  expect(state().ledger.unrecordedDecisions).toEqual([])

  const following = await prompt('Continue again')
  expect(following.message?.content ?? '').not.toContain('Possibly unrecorded decisions in your last reply:')
})

test('with INBOX_RECORDED_ITEMS_ONLY=1, a legacy ask closes only on an answer while TODOs stay and NEW asks drop', async () => {
  createInbox(pi(), { ...deps(), recordedItemsOnly: '1' })
  await prompt('I will revisit the current threshold.')
  await record({
    kind: 'question',
    ask: 'Keep the current threshold?',
    options: ['Keep 5 and 15 USD', 'Keep all four'],
  })

  const saved = state()
  delete saved.ledger.items[0].from
  writeFileSync(join(w.dir, 'sessions', 's1.json'), JSON.stringify(saved))
  w.reply = [
    'CLOSED: i1 | No longer applies: scope changed in this reply',
    'NEW: decide | - | Should we add another theme? | Light / dark | dark',
    'TODO: add a dark theme',
  ].join('\n')
  await endAgent('The migration plan is ready.')
  await settle()

  const afterUnansweredClose = state().ledger
  expect(afterUnansweredClose.items.map((i: { ask: string }) => i.ask)).toEqual([
    'Keep the current threshold?',
    'Ready to start on add a dark theme?',
  ])
  expect(afterUnansweredClose.items[0].from).toBe('update')
  expect(afterUnansweredClose.closed).toEqual([])

  w.reply = 'CLOSED: i1 | Keep the current threshold'
  await prompt('Keep the current threshold.')
  await endAgent('I will keep that threshold.')
  await settle()

  const afterAnswer = state().ledger
  expect(afterAnswer.items.map((i: { id: string }) => i.id)).toEqual(['i2'])
  expect(afterAnswer.closed.map((c: { id: string; outcome: string }) => [c.id, c.outcome])).toEqual([
    ['i1', 'Keep the current threshold'],
  ])
})

test('seven omp-recorded questions stay open after both CLOSED outcome forms', async () => {
  createInbox(pi(), { ...deps(), recordedItemsOnly: '1' })
  await prompt('Please keep these questions open until they are answered.')
  for (let n = 1; n <= 7; n++)
    await record({
      kind: 'question',
      ask: `Which option should question ${n} use?`,
      options: ['A', 'B'],
    })
  w.reply = Array.from(
    { length: 7 },
    (_, n) => `CLOSED: i${n + 1} | ${n < 4 ? 'done: ' : ''}回答待ちのまま変更なし`,
  ).join('\n')
  await endAgent('The seven questions are still waiting.')
  await settle()

  expect(state().ledger.items.map((item: { id: string }) => item.id)).toEqual(
    Array.from({ length: 7 }, (_, n) => `i${n + 1}`),
  )
  expect(state().ledger.closed).toEqual([])
})
