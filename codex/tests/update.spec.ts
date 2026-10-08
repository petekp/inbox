import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Exchange } from '../../hooks/ledger'
import { readState, updateState } from '../src/state'
import { runUpdates } from '../src/update'
import { tempDir } from './helpers'

const ex = (turn: number, reply: string): Exchange => ({
  person: 'go',
  trigger: null,
  activity: [],
  reply,
  turn,
  press: null,
  screen: 'The Inbox tab is closed.',
  checks: [],
})

test('pending exchanges reach the ledger in order, and a failed one still counts as summarized', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 2 },
    pending: [
      { ex: ex(1, 'Should I deploy?'), turnsStarted: 1 },
      { ex: ex(2, 'Done.'), turnsStarted: 2 },
    ],
  }))
  const prompts: string[] = []
  const answers = ['GOAL: Ship\nNOW: Waiting on deploy\nNEW: decide | - | Deploy now? | Yes / No | Yes', null]
  await runUpdates(
    dir,
    's1',
    async p => (prompts.push(p), answers.shift() ?? null),
    () => 5,
  )

  const s = await readState(dir, 's1')
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /i1 \| decide \| - \| Deploy now\?/)
  assert.deepEqual(
    s.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.deepEqual(s.pending, [])
  assert.deepEqual(s.presence, { turnsStarted: 2, turnsApplied: 2, ledgerState: 'failed', isUpdating: false })
})
