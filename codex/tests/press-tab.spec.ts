import assert from 'node:assert/strict'
import { test } from 'node:test'

import { endTurn, noteHook, noteToolCall, viewOf } from '../src/core'
import { demoState } from '../src/demo'
import { withItems } from './press-fixtures'

test('the tab reports active work separately from pending exchanges and failed updates', () => {
  const s = { ...withItems(), presence: { ...withItems().presence, isUpdating: false, ledgerState: 'failed' as const } }
  const waiting = endTurn(s, 'Done.', 50)
  assert.equal(waiting.pending.length, 1)
  assert.match(
    viewOf(waiting, 60).status.error ?? '',
    /^The inbox couldn't update from the agent's last reply\..*tries again after the next reply/,
  )
  const running = { ...waiting, presence: { ...waiting.presence, isUpdating: true } }
  assert.deepEqual(
    [viewOf(running, 60).status, viewOf(running, 60).sync.ledger],
    [{ error: null }, { is: 'stale', since: null, why: 'retrying' }],
  )
  const scheduled = { ...waiting, presence: { ...waiting.presence, ledgerState: 'current' as const } }
  assert.deepEqual(
    [viewOf(scheduled, 60).status, viewOf(scheduled, 60).sync.ledger],
    [{ error: null }, { is: 'fresh' }],
  )
  assert.equal(
    viewOf(s, 60).status.error,
    "The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing. It tries again after the next reply.",
  )
})

test('the tab says the hooks were not heard when none ran, when a tool call comes in a turn no prompt recorded, or when two prompts saw no Stop', () => {
  const s = withItems()
  assert.equal(viewOf(s, 10).heard, 'none')
  const started = noteHook(s, 'start', 10)
  assert.equal(viewOf(started, 10).heard, 'heard')
  const prompted = noteHook(started, 'prompt', 20, 't1')
  assert.equal(viewOf(noteToolCall(prompted, 't1', 30), 30).heard, 'heard')
  const missed = noteToolCall(prompted, 't2', 30)
  assert.equal(viewOf(missed, 30).heard, 'partial')
  assert.equal(viewOf(noteHook(noteHook(missed, 'stop', 35), 'prompt', 40, 't3'), 40).heard, 'heard')
  const twice = noteHook(prompted, 'prompt', 50, 't2')
  assert.equal(viewOf(twice, 50).heard, 'partial')
  assert.equal(viewOf(noteHook(twice, 'stop', 60), 60).heard, 'heard')
  assert.equal(viewOf(noteHook(prompted, 'prompt', 50, 't1'), 50).heard, 'heard')
  assert.equal(viewOf(noteHook(noteHook(s, 'prompt', 20, 't1'), 'stop', 30), 30).heard, 'partial')
  const stopped = noteHook(prompted, 'stop', 40)
  assert.equal(viewOf(noteToolCall(stopped, null, 45), 45).heard, 'partial')
  assert.equal(viewOf(noteToolCall(prompted, null, 25), 25).heard, 'heard')
  assert.equal(viewOf(demoState(10), 10).heard, 'heard')
})

test('a tool call in a turn the prompt hook recorded, after a Stop sent Codex back, is not read as a skipped prompt', () => {
  const prompted = noteHook(noteHook(withItems(), 'start', 10), 'prompt', 20, 't1')
  const sentBack = noteHook(prompted, 'stop', 30)
  const called = noteToolCall(sentBack, 't1', 40)
  assert.equal(called.heard.promptMissedAt, null)
  assert.equal(viewOf(called, 40).heard, 'heard')
})
