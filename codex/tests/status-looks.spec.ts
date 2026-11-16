import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY } from '../../hooks/ledger'
import { parseStatus } from '../../hooks/status'
import { isSubjectSeen, LOOK_MIN_MS } from '../../hooks/status-children'
import { applyStatus } from '../../hooks/status-ops'
import { emptyState } from '../src/state'
import { lookOnView } from '../src/core'
import type { SessionState } from '../src/state'
import { noteShownRows, rowsInView, takeShownRows } from '../src/tab-shown'

test('a look starts when the tab shows the Status, ends when it shows another tab, ends at the last request when the pane closed, and counts once it lasted five seconds', () => {
  const state = emptyState('look')
  state.ledger = {
    ...EMPTY,
    overview: applyStatus(
      null,
      parseStatus('HEAD: Ship it | Shipping the first version\nNEW: queued | Docs | after the code')!,
      500,
      new Set(),
    ),
  }
  state.tabSeenAt = 1000
  const open = lookOnView(state, 'overview', 2000, {})
  assert.equal(open.ledger.overview?.look?.startedAt, 2000)

  const seen = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 2000 + LOOK_MIN_MS, {})
  assert.equal(seen.ledger.overview?.look, null)
  assert.equal(seen.ledger.overview?.lastLookAt, 2000 + LOOK_MIN_MS)

  const passed = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 3000, {})
  assert.equal(passed.ledger.overview?.look, null)
  assert.equal(passed.ledger.overview?.lastLookAt, null)

  const closed = lookOnView({ ...open, tabSeenAt: 2000 + LOOK_MIN_MS }, 'needsYou', 2000 + 60_000, {})
  assert.equal(closed.ledger.overview?.lastLookAt, 2000 + LOOK_MIN_MS)

  const never = lookOnView(state, 'needsYou', 2000, {})
  assert.equal(never.ledger.overview?.lastLookAt, null)
})

test('a look counts as seen only the Status subjects the tab reported on screen, across its requests and when the pane closed, and not rows a later showing reported', () => {
  const state = emptyState('look-rows')
  state.ledger = {
    ...EMPTY,
    overview: applyStatus(
      null,
      parseStatus(
        'NEW: working | Sync | under way\nNEW: working | Search | under way\nNEW: queued | Docs | after the code',
      )!,
      500,
      new Set(),
    ),
  }
  const seenOf = (s: SessionState) => {
    const o = s.ledger.overview!
    return o.subjects.filter(x => isSubjectSeen(o, x)).map(x => x.name)
  }
  const open = lookOnView({ ...state, tabSeenAt: 1000 }, 'overview', 1000, { s1: 1000 })
  const scrolled = lookOnView({ ...open, tabSeenAt: 4000 }, 'overview', 4000, { s2: 3500 })
  const ended = lookOnView({ ...scrolled, tabSeenAt: 7000 }, 'needsYou', 7000, {})
  assert.deepEqual(seenOf(ended), ['Sync', 'Search'])
  assert.deepEqual(ended.lookRows, {})

  const reopened = lookOnView({ ...ended, tabSeenAt: 7000 }, 'overview', 8000, { s3: 8000 })
  const afterClose = lookOnView({ ...reopened, tabSeenAt: 8000 + LOOK_MIN_MS }, 'overview', 90_000, { s1: 90_000 })
  assert.deepEqual(seenOf(afterClose), ['Sync', 'Search', 'Docs'])
  assert.deepEqual(afterClose.lookRows, { s1: 90_000 })
})

test('the tab reports as on screen the subjects of the rows whose first line is inside its window, each subject a named fold stands for among them, each with when it last was, until its next request', () => {
  const rows = [
    { subjects: 's1', top: -40 },
    { subjects: 's2', top: 0 },
    { subjects: 's5 s6 s7', top: 300 },
    { subjects: 's3', top: 599 },
    { subjects: 's4', top: 600 },
  ]
  assert.deepEqual(rowsInView(rows, 600), ['s2', 's5', 's6', 's7', 's3'])

  takeShownRows()
  noteShownRows(['s2', 's3'], 100)
  noteShownRows(['s3', 's4'], 200)
  assert.deepEqual(takeShownRows(), { s2: 100, s3: 200, s4: 200 })
  assert.deepEqual(takeShownRows(), {})
})
