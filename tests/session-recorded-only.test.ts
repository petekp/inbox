import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { upgradeLedger } from '../hooks/ledger'
import { isRecordedItemsOnly, runUpdates } from '../hooks/session-host'
import { recordItem } from '../hooks/tools'
import type { Item, Session } from '../types'
import { fakeHost } from './session-fake-host'
import { finishTurn } from './session-helpers'

const THRESHOLDS = {
  kind: 'question',
  ask: 'Keep only the two 10-minute thresholds?',
  options: ['Keep 5 and 15 USD', 'Keep all four'],
  rec: 'Keep 5 and 15 USD',
  document: '/reports/thresholds.md',
  document_preview: 'Threshold comparison.',
}

const REPLY =
  'Should I keep only the two 10-minute thresholds? See https://example.com/thresholds. Another agent asks whether to resume; you need not answer it.'

const ANSWER = [
  'NEW: decide | - | Let the other agent resume? | Resume / Stop | Resume',
  'NEW: do | - | Fix the build host connection | - | -',
  'UPDATE: i1 | Keep 10 USD / Keep 20 USD | Keep 20 USD',
  'HELP: i1 | link | https://example.com/thresholds | threshold notes',
  'TODO: add a dark theme',
].join('\n')

/** A session whose agent recorded THRESHOLDS as i1, then ended a turn with REPLY. */
const recordedThenReplied = (s: Session): Session => {
  const { ledger } = recordItem(CLAUDE_CODE, s.ledger, THRESHOLDS, 1)

  return finishTurn({ ...s, ledger }, REPLY)
}

/** A legacy ledger item with no `from`, upgraded as an update-originated ask. */
const legacyThenReplied = (s: Session): Session => {
  const legacy = {
    id: 'i1',
    kind: 'question',
    ask: THRESHOLDS.ask,
    label: null,
    options: THRESHOLDS.options,
    rec: THRESHOLDS.rec,
    helps: [],
    turn: 0,
    at: null,
  } as unknown as Item
  const ledger = upgradeLedger({ ...s.ledger, items: [legacy], nextId: 2 })

  return finishTurn({ ...s, ledger }, REPLY)
}

const asRecorded = {
  options: THRESHOLDS.options,
  rec: THRESHOLDS.rec,
  from: 'record',
  document: THRESHOLDS.document,
  documentPreview: THRESHOLDS.document_preview,
}

test('with recordedItemsOnly, an update drops NEW asks, keeps TODOs and recorded asks, adds steps, and leaves closes to the person or close tool', async () => {
  let answer = ANSWER
  const { host } = fakeHost(async () => answer)
  await host.update(recordedThenReplied)
  await runUpdates({ ...host, recordedItemsOnly: true })

  const after = (await host.read()).ledger
  expect(after.items.map(i => i.ask)).toEqual([THRESHOLDS.ask, 'Ready to start on add a dark theme?'])
  expect(after.items[0]).toMatchObject(asRecorded)
  expect(after.items[1]).toMatchObject({ id: 'i2', from: 'update' })
  expect(after.items[0]!.helps).toEqual([
    { kind: 'link', url: 'https://example.com/thresholds', name: 'threshold notes' },
  ])

  answer = 'CLOSED: i1 | Keep 5 and 15 USD'
  await host.update(s => finishTurn(s, 'Keeping the 5 and 15 USD thresholds.'))
  await runUpdates({ ...host, recordedItemsOnly: true })
  const closed = (await host.read()).ledger
  expect(closed.items.map(i => i.id)).toEqual(['i1', 'i2'])
  expect(closed.closed).toEqual([])
})

test('seven agent-recorded questions stay open after either CLOSED outcome in both modes', async () => {
  for (const recordedItemsOnly of [false, true])
    for (const outcome of ['done: 回答待ちのまま変更なし', '回答待ちのまま変更なし']) {
      const answer = Array.from({ length: 7 }, (_, n) => `CLOSED: i${n + 1} | ${outcome}`).join('\n')
      const { host } = fakeHost(async () => answer)
      await host.update(s => {
        let ledger = s.ledger
        for (let n = 1; n <= 7; n++)
          ledger = recordItem(
            CLAUDE_CODE,
            ledger,
            {
              kind: 'question',
              ask: `Which option should question ${n} use?`,
              options: ['A', 'B'],
            },
            n,
          ).ledger

        return finishTurn({ ...s, ledger }, 'The seven questions are still waiting.')
      })
      await runUpdates({ ...host, recordedItemsOnly })

      const after = (await host.read()).ledger
      expect(
        after.items.map(i => i.id),
        `mode ${recordedItemsOnly}, outcome ${outcome}`,
      ).toEqual(Array.from({ length: 7 }, (_, n) => `i${n + 1}`))
      expect(after.closed).toEqual([])
    }
})

test('with recordedItemsOnly, a legacy ask survives an unanswered close, TODOs remain, NEW asks drop, and an answer closes the ask', async () => {
  let answer = [
    'CLOSED: i1 | No longer applies: scope changed in this reply',
    'NEW: decide | - | Should we add another theme? | Light / dark | dark',
    'TODO: add a dark theme',
  ].join('\n')
  const { host } = fakeHost(async () => answer)
  await host.update(legacyThenReplied)
  expect((await host.read()).ledger.items[0]).toMatchObject({ id: 'i1', from: 'update' })

  await runUpdates({ ...host, recordedItemsOnly: true })

  const afterUnansweredClose = (await host.read()).ledger
  expect(afterUnansweredClose.items.map(i => i.ask)).toEqual([THRESHOLDS.ask, 'Ready to start on add a dark theme?'])
  expect(afterUnansweredClose.items[1]).toMatchObject({
    id: 'i2',
    kind: 'question',
    options: ['Proceed', 'Not yet'],
    from: 'update',
  })
  expect(afterUnansweredClose.closed).toEqual([])

  answer = 'CLOSED: i1 | Keep only the two 10-minute thresholds'
  await host.update(s => finishTurn(s, 'Keep only the two 10-minute thresholds.'))
  await runUpdates({ ...host, recordedItemsOnly: true })

  const afterAnswer = (await host.read()).ledger
  expect(afterAnswer.items.map(i => i.id)).toEqual(['i2'])
  expect(afterAnswer.closed.map(c => [c.id, c.outcome])).toEqual([['i1', 'Keep only the two 10-minute thresholds']])
})

test('with recordedItemsOnly, a question the answer closes and asks again stays open, as it does without the option', async () => {
  const answer = ['CLOSED: i1 | Keep 5 and 15 USD', 'UPDATE: i1 | Keep 10 USD / Keep 20 USD | Keep 20 USD'].join('\n')
  for (const recordedItemsOnly of [true, false]) {
    const { host } = fakeHost(async () => answer)
    await host.update(recordedThenReplied)
    await runUpdates({ ...host, recordedItemsOnly })
    expect(
      (await host.read()).ledger.items.map(i => i.id),
      `recordedItemsOnly: ${recordedItemsOnly}`,
    ).toEqual(['i1'])
  }
})

test('with recordedItemsOnly, a catch-up adds no ask and keeps a recorded ask as recorded', async () => {
  const { host } = fakeHost(async () => null)
  await host.update(s => {
    const replied = recordedThenReplied(s)

    return { ...replied, presence: { ...replied.presence, ledgerState: 'behind' as const } }
  })
  await runUpdates({
    ...host,
    recordedItemsOnly: true,
    catchUp: async () => ({ kind: 'reply', text: ANSWER, source: REPLY, statusCall: null, heard: null }),
  })

  const after = (await host.read()).ledger
  expect(after.items.map(i => i.ask)).toEqual([THRESHOLDS.ask, 'Ready to start on add a dark theme?'])
  expect(after.items[0]).toMatchObject(asRecorded)
})

test('without recordedItemsOnly, the same update adds the asks it found and changes the recorded options', async () => {
  const { host } = fakeHost(async () => ANSWER)
  await host.update(recordedThenReplied)
  await runUpdates(host)

  const after = (await host.read()).ledger
  expect(after.items[0]).toMatchObject({ options: ['Keep 10 USD', 'Keep 20 USD'], rec: 'Keep 20 USD' })
  expect(after.items[0]).toMatchObject({
    document: THRESHOLDS.document,
    documentPreview: THRESHOLDS.document_preview,
  })
  expect(after.items.map(i => i.ask)).toContain('Ready to start on add a dark theme?')
  expect(after.items.length).toBeGreaterThan(2)
})

test('only 1 and true turn the environment variable on', () => {
  expect(['1', 'true', '0', 'false', '', undefined, null].map(isRecordedItemsOnly)).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ])
})
