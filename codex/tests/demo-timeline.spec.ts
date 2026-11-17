import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoTaskTree } from '../../hooks/demo-timeline'
import { NO_HOLDS } from '../../hooks/timing'
import { demoState } from '../src/demo'
import { viewOf } from '../src/core'

test('the Codex demo Timeline uses the shared Timeline sample tree', () => {
  const now = Date.now()
  const view = viewOf(demoState(now), now, NO_HOLDS, demoTaskTree(now))

  assert.deepEqual(
    view.timeline.rows.map(row => row.task.id),
    demoTaskTree(now).map(task => task.id),
  )
})
