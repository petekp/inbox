import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recordClose, recordItem } from '../../hooks/tools'
import { NO_HOLDS } from '../../hooks/timing'
import { ARRIVAL_TABS, followTo } from '../../hooks/arrivals'
import { isShownEmpty, newRows, openRows } from '../src/arrivals'
import { endTurn, noteHook, noteToolCall, viewOf } from '../src/core'
import { demoState } from '../src/demo'
import { emptyState, NOTHING_HEARD } from '../src/state'
import type { SessionState } from '../src/state'
import { CODEX } from '../src/texts'
import { withItems } from './press-fixtures'

test('the tab reports active work separately from pending exchanges and failed updates', () => {
  const s = { ...withItems(), presence: { ...withItems().presence, isUpdating: false, ledgerState: 'failed' as const } }
  const waiting = endTurn(s, 'Done.', 50)
  assert.equal(waiting.pending.length, 1)
  assert.equal(viewOf(waiting, 60).status.isUpdating, false)
  assert.match(viewOf(waiting, 60).status.error ?? '', /Last update failed.*retries after your next message/)
  const running = { ...waiting, presence: { ...waiting.presence, isUpdating: true } }
  assert.deepEqual(viewOf(running, 60).status, { isUpdating: true, error: null })
  const scheduled = { ...waiting, presence: { ...waiting.presence, ledgerState: 'current' as const } }
  assert.deepEqual(viewOf(scheduled, 60).status, { isUpdating: false, error: null })
  assert.equal(viewOf(s, 60).status.error, 'Last update failed. Items from that reply may be missing.')
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

test('the tab moves from an empty Asks to Finds when it opens on a finding or a poll brings one, and counts as new only rows added since its first view', () => {
  const s = noteHook(emptyState('s1'), 'start', 1)
  const first = newRows({}, viewOf(s, 10), false)
  assert.deepEqual(first.added, { needsYou: [], findings: [], prs: [] })
  const withFinding = {
    ...s,
    ledger: recordItem(
      CODEX,
      s.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      20,
    ).ledger,
  }
  const next = newRows(first.seen, viewOf(withFinding, 20), false)
  assert.deepEqual(next.added, { needsYou: [], findings: ['f1'], prs: [] })
  const followed = (state: SessionState) =>
    followTo(
      ARRIVAL_TABS,
      'needsYou',
      isShownEmpty(viewOf(state, 20), 'needsYou', new Set(), new Set(), false),
      next.added,
    )
  assert.equal(followed(withFinding), 'findings')
  const opened = viewOf(withFinding, 20)
  assert.equal(
    followTo(ARRIVAL_TABS, 'needsYou', isShownEmpty(opened, 'needsYou', new Set(), new Set(), false), openRows(opened)),
    'findings',
  )
  assert.equal(viewOf({ ...withFinding, heard: NOTHING_HEARD }, 20).heard, 'none')
  assert.equal(followed({ ...withFinding, heard: NOTHING_HEARD }), null)
  assert.equal(followed({ ...withFinding, ledger: withItems().ledger }), null)
  assert.deepEqual(newRows(next.seen, viewOf(withFinding, 30), false).added, { needsYou: [], findings: [], prs: [] })
  const closed = recordClose(CODEX, withFinding.ledger, { id: 'f1', reason: 'fixed' }, 30)
  const afterClose = { ...withFinding, ledger: closed.ledger }
  const settled = viewOf(afterClose, 31, { ...NO_HOLDS, shownSince: 20 })
  assert.equal(isShownEmpty(settled, 'findings', new Set(['f1']), new Set(), false), false)
  assert.equal(isShownEmpty(settled, 'findings', new Set(), new Set(), false), true)
  const history = viewOf(afterClose, 30_000)
  assert.equal(isShownEmpty(history, 'findings', new Set(), new Set(['issue']), false), false)
  assert.equal(isShownEmpty(history, 'findings', new Set(), new Set(), false), true)
})

test('a new PR counts as a new row, moves an empty tab to PRs, and counts nothing while PRs load', () => {
  const s = noteHook(emptyState('s1'), 'start', 1)
  const pr = (ref: string) => ({
    ref,
    number: 1,
    title: 'Fix it',
    url: `https://github.com/${ref}`,
    isDraft: false,
    state: 'OPEN',
    base: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: '',
    checks: [],
    threads: [],
    isYours: true,
    wasSeenOpen: true,
    error: null,
  })
  const withPrs = (refs: string[]) => {
    const v = viewOf(s, 10)

    return {
      ...v,
      prs: { ...v.prs, drawn: refs.map(ref => ({ pr: pr(ref), state: { is: 'open' as const }, rank: null })) },
    }
  }
  const first = newRows({}, withPrs([]), false)
  const loading = newRows(first.seen, withPrs(['a/b#1']), true)
  assert.deepEqual(loading.added.prs, [])
  const arrived = newRows(first.seen, withPrs(['a/b#1']), false)
  assert.equal(arrived.added.prs.length, 1)
  const followed = (shown: 'needsYou' | 'prs', v: ReturnType<typeof withPrs>, added: typeof arrived.added) =>
    followTo(ARRIVAL_TABS, shown, isShownEmpty(v, shown, new Set(), new Set(), false), added)
  assert.equal(followed('needsYou', withPrs(['a/b#1']), arrived.added), 'prs')
  assert.equal(followed('needsYou', withPrs(['a/b#1']), openRows(withPrs(['a/b#1']))), null)
  assert.equal(followed('prs', withPrs(['a/b#1']), arrived.added), null)
  const emptied = withPrs([])
  assert.equal(isShownEmpty(emptied, 'prs', new Set(), new Set(), true), false)
  assert.equal(followed('prs', emptied, { needsYou: [], findings: ['f1'], prs: [] }), 'findings')
  assert.equal(followed('prs', emptied, { needsYou: [], findings: [], prs: [] }), null)
})
