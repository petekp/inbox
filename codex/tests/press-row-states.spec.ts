import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ROW_STATE_MS, stepRow } from '../src/rows'
import type { RowState, RowTarget, RowTrack } from '../src/rows'

const ROW_STATES: RowState[] = [
  'entering',
  'closed',
  'opening',
  'open',
  'closing',
  'settling',
  'settled',
  'undoing',
  'leaving',
]
const ROW_TARGETS: RowTarget[] = ['closed', 'open', 'settled', 'undoing', 'gone']
const RESTS: Record<RowTarget, RowState | null> = {
  closed: 'closed',
  open: 'open',
  settled: 'settled',
  undoing: 'undoing',
  gone: null,
}

const WITH_PANEL = new Set<RowState>(['opening', 'open', 'closing', 'settling'])
const trackOf = (state: RowState, hasPanel = WITH_PANEL.has(state)): RowTrack => ({ state, since: 0, hasPanel })

test('every row state reaches every target, and a row drawing its panel keeps it until its height has shrunk over it', () => {
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS) {
      const first = stepRow(trackOf(state), target, 0)
      if (WITH_PANEL.has(state) && first)
        assert.ok(
          first.hasPanel && (WITH_PANEL.has(first.state) || first.state === 'leaving'),
          `${state} toward ${target} dropped its panel as ${first.state}`,
        )
      let track = first
      for (let n = 0; n < 2 && track && track.state !== RESTS[target]; n++)
        track = stepRow(track, target, track.since + ROW_STATE_MS[track.state])
      assert.equal(track?.state ?? null, RESTS[target], `${state} toward ${target}`)
      if (track) assert.equal(track.hasPanel, track.state === 'open', `${state} toward ${target}`)
    }
  assert.equal(stepRow(trackOf('open'), 'gone', 0)?.hasPanel, true)
  assert.equal(stepRow(trackOf('closed'), 'gone', 0)?.hasPanel, false)
})

test('a row turned around mid-move starts the new move at once, and with reduced motion every move ends as it starts', () => {
  assert.equal(stepRow(trackOf('closing'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('opening'), 'closed', 50)?.state, 'closing')
  assert.equal(stepRow(trackOf('settling'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('entering', false), 'open', 50)?.state, 'opening')
  const closing = trackOf('closing')
  assert.equal(stepRow(closing, 'closed', 50), closing)
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS)
      assert.equal(
        stepRow(trackOf(state), target, 0, false, true)?.state ?? null,
        RESTS[target],
        `${state} toward ${target}`,
      )
  assert.deepEqual(stepRow(undefined, 'open', 0, true), { state: 'entering', since: 0, hasPanel: true })
  assert.equal(stepRow(undefined, 'closed', 0, true)?.hasPanel, false)
  assert.equal(stepRow(undefined, 'closed', 0, true, true)?.state, 'closed')
  assert.equal(stepRow(undefined, 'open', 0)?.state, 'open')
})
