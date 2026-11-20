import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { FOLD_QUIET_MS, SETTLED_MS } from '../hooks/timing'
import { freshUi } from '../hooks/ui-controller-types'
import {
  closedByAgent,
  FACTS,
  finding,
  kinds,
  LOOK,
  openOn,
  question,
  read,
  send,
  sessionWith,
  T0,
  withFindings,
  withItems,
} from './ui-controller-helpers'

test('opening on another tab moves to Asks while a question waits there', () => {
  const s = sessionWith({ items: [question('i1')], findings: [finding('f1')] })
  const run = openOn(s, T0, 'findings')
  expect(run.ui.tab).toBe('needsYou')
  expect(run.commands).toContainEqual({ kind: 'tab-shown', tab: 'needsYou' })
  expect(run.ui.isOpening).toBe(false)
})

test('opening on an empty Asks tab moves to Finds when a finding is open there', () => {
  const run = openOn(sessionWith({ findings: [finding('f1')] }))
  expect(run.ui.tab).toBe('findings')
  expect(kinds(run.commands)).toContain('tab-shown')
})

test('opening with nothing open anywhere stays on the tab it opened on and sends no move', () => {
  const run = openOn(sessionWith({}), T0, 'findings')
  expect(run.ui.tab).toBe('findings')
  expect(kinds(run.commands)).not.toContain('tab-shown')
})

test('opening on the Status page or with Help shown makes no move', () => {
  const s = sessionWith({ items: [question('i1')] })
  expect(openOn(s, T0, 'overview').ui.tab).toBe('overview')
  const helped = send(freshUi(LOOK, 'findings'), s, { type: 'show-help', isShown: true }, T0)
  const opened = send(helped.ui, s, { type: 'opened' }, T0)
  expect(read(opened.ui, s, T0).ui.tab).toBe('findings')
})

test('a row that arrives on another tab is followed only when it arrives while the shown tab draws nothing, settled rows included', () => {
  const s = sessionWith({ findings: [finding('f1')] })
  const start = openOn(s, T0, 'findings')
  const quiet = T0 + FOLD_QUIET_MS + 1
  const closed = closedByAgent(s, 'f1', quiet)
  const arrived = withItems(closed, [question('i1')])
  const settling = read(read(start.ui, closed, quiet).ui, arrived, quiet + 10)
  expect(settling.ui.tab).toBe('findings')
  const folded = read(read(start.ui, closed, quiet).ui, closed, quiet + 2 * SETTLED_MS)
  const run = read(folded.ui, arrived, quiet + 2 * SETTLED_MS + 10)
  expect(run.ui.tab).toBe('needsYou')
  expect(run.commands).toContainEqual({ kind: 'tab-shown', tab: 'needsYou' })
})

test('an arrival waits while the list is in use and is followed once the list has been quiet for FOLD_QUIET_MS', () => {
  const empty = sessionWith({})
  const start = openOn(empty, T0, 'findings')
  const used = send(start.ui, empty, { type: 'list-input' }, T0 + 100)
  const arrived = sessionWith({ items: [question('i1')] })
  const held = read(used.ui, arrived, T0 + 200)
  expect(held.ui.tab).toBe('findings')
  expect(held.ui.heldArrivals.needsYou).toEqual(['i1'])
  expect(held.nextWakeAt).toBe(T0 + 100 + FOLD_QUIET_MS)
  const early = send(held.ui, arrived, { type: 'tick' }, T0 + 100 + FOLD_QUIET_MS - 1)
  expect(early.ui.tab).toBe('findings')
  const due = send(early.ui, arrived, { type: 'tick' }, T0 + 100 + FOLD_QUIET_MS)
  expect(due.ui.tab).toBe('needsYou')
  expect(due.ui.heldArrivals).toEqual({})
})

test('a held arrival that stopped waiting before the list went quiet is not followed', () => {
  const empty = sessionWith({})
  const start = openOn(empty, T0, 'findings')
  const used = send(start.ui, empty, { type: 'list-input' }, T0 + 100)
  const arrived = sessionWith({ items: [question('i1')] })
  const held = read(used.ui, arrived, T0 + 200)
  const gone = closedByAgent(arrived, 'i1', T0 + 300)
  const due = send(held.ui, gone, { type: 'tick' }, T0 + 100 + FOLD_QUIET_MS)
  expect(due.ui.tab).toBe('findings')
  expect(due.ui.heldArrivals).toEqual({})
})

test('an arrival is not followed while the shown tab still lists an open row', () => {
  const s = sessionWith({ findings: [finding('f1')] })
  const start = openOn(s, T0, 'findings')
  const run = read(start.ui, withItems(s, [question('i1')]), T0 + FOLD_QUIET_MS + 1)
  expect(run.ui.tab).toBe('findings')
})

test('a page shown again moves to Asks when a question waits and keeps what it recorded', () => {
  const s = sessionWith({ findings: [finding('f1')] })
  const start = openOn(s, T0, 'findings')
  const hidden = send(start.ui, s, { type: 'visible', isVisible: false }, T0 + 10)
  const asked = withItems(s, [question('i1')])
  const whileHidden = read(hidden.ui, asked, T0 + 20)
  expect(whileHidden.ui.tab).toBe('findings')
  const shown = send(whileHidden.ui, asked, { type: 'visible', isVisible: true }, T0 + 30)
  const run = read(shown.ui, asked, T0 + 30)
  expect(run.ui.tab).toBe('needsYou')
  expect(run.ui.shownSince).toBe(T0 + 30)
  expect(run.ui.rowsSeen.needsYou).toEqual(['i1'])
  expect(run.ui.opensOnAsks).toBe(false)
})

test('a row recorded while the page is hidden gets no new-row tint', () => {
  const s = sessionWith({ findings: [finding('f1')] })
  const start = openOn(s, T0, 'findings')
  const hidden = send(start.ui, s, { type: 'visible', isVisible: false }, T0 + 10)
  const run = read(hidden.ui, withFindings(s, [finding('f1'), finding('f2')]), T0 + 20)
  expect(Object.keys(run.ui.newRows)).toEqual([])
  const shownRun = read(start.ui, withFindings(s, [finding('f1'), finding('f2')]), T0 + 20)
  expect(shownRun.ui.newRows.f2?.shownAt).toBe(T0 + 20)
})

test('the person switching tabs keeps that tab’s cursor and closes Help', () => {
  const s = sessionWith({ items: [question('i1'), question('i2')], findings: [finding('f1')] })
  const start = openOn(s)
  const picked = send(start.ui, s, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const away = send(picked.ui, s, { type: 'show-tab', tab: 'findings' }, T0 + 20)
  const helped = send(away.ui, s, { type: 'show-help', isShown: true }, T0 + 30)
  const back = send(helped.ui, s, { type: 'show-tab', tab: 'needsYou' }, T0 + 40)
  expect(back.ui.selection.needsYou.id).toBe('i2')
  expect(back.ui.isHelpShown).toBe(false)
  expect(back.commands).toEqual([{ kind: 'tab-shown', tab: 'needsYou' }])
})

test('following an arrival starts the target tab’s cursor over', () => {
  const s = sessionWith({ items: [question('i1'), question('i2')] })
  const start = openOn(s)
  const picked = send(start.ui, s, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const away = send(picked.ui, s, { type: 'show-tab', tab: 'findings' }, T0 + 20)
  const run = read(away.ui, withItems(s, [question('i1'), question('i2'), question('i3')]), T0 + 20 + FOLD_QUIET_MS)
  expect(run.ui.tab).toBe('needsYou')
  expect(run.ui.selection.needsYou.id).toBe(null)
})

test('switching the demo on or off starts the look over as it opens and keeps drafts and folds', () => {
  const s = sessionWith({ items: [question('i1')] })
  const start = openOn(s)
  const drafted = send(start.ui, s, { type: 'edit-draft', id: 'i1', text: 'Maybe' }, T0 + 10)
  const folded = send(drafted.ui, s, { type: 'fold', fold: 'question', isOpen: true }, T0 + 20)
  const reset = send(folded.ui, s, { type: 'reset' }, T0 + 30)
  expect(reset.ui.drafts.i1?.text).toBe('Maybe')
  expect(reset.ui.unfolded).toEqual(['question'])
  expect(reset.ui.isOpening).toBe(true)
  expect(reset.ui.shownSince).toBe(T0 + 30)
  expect(reset.ui.rowsSeen).toEqual({})
})

test('a closed look keeps no held arrivals and makes no move on a read', () => {
  const empty = sessionWith({})
  const start = openOn(empty, T0, 'findings')
  const closed = send(start.ui, empty, { type: 'closed' }, T0 + 10)
  expect(closed.ui.shownSince).toBe(null)
  const run = send(closed.ui, sessionWith({ items: [question('i1')] }), { type: 'read', host: FACTS }, T0 + 20)
  expect(run.ui.tab).toBe('findings')
})
