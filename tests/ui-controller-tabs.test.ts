import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import type { SessionView } from '../core/view/session-view'
import { FOLD_QUIET_MS, SETTLED_MS } from '../core/view/timing'
import { reduceUi } from '../core/view/ui-controller'
import { freshUi } from '../core/view/ui-controller-types'
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
  viewOf,
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

test('a look that opens on its Status page with no tab of its own moves to Asks only while a question waits there', () => {
  const asked = sessionWith({ items: [question('i1')], findings: [finding('f1')] })
  const first = (s: typeof asked) => {
    const opened = send(freshUi(LOOK, 'overview'), s, { type: 'opened', isFirst: true }, T0)
    return read(opened.ui, s, T0)
  }
  expect(first(asked).ui.tab).toBe('needsYou')
  expect(first(asked).commands).toContainEqual({ kind: 'tab-shown', tab: 'needsYou' })
  expect(first(sessionWith({ findings: [finding('f1')] })).ui.tab).toBe('overview')
  expect(first(asked).ui.isFirstOpen).toBe(false)
  const again = send(first(sessionWith({})).ui, asked, { type: 'visible', isVisible: false }, T0 + 10)
  const shown = send(again.ui, asked, { type: 'visible', isVisible: true }, T0 + 20)
  expect(read(shown.ui, asked, T0 + 20).ui.tab).toBe('overview')
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
  expect(held.nextWakeAt).toBe(T0 + 100 + FOLD_QUIET_MS)
  const early = send(held.ui, arrived, { type: 'tick' }, T0 + 100 + FOLD_QUIET_MS - 1)
  expect(early.ui.tab).toBe('findings')
  const due = send(early.ui, arrived, { type: 'tick' }, T0 + 100 + FOLD_QUIET_MS)
  expect(due.ui.tab).toBe('needsYou')
})

test('a held arrival is followed on the first event after the list goes quiet, not only on a tick', () => {
  const empty = sessionWith({})
  const start = openOn(empty, T0, 'needsYou')
  const used = send(start.ui, empty, { type: 'list-input' }, T0 + 100)
  const arrived = sessionWith({ findings: [finding('f1')] })
  const held = read(used.ui, arrived, T0 + 200)
  expect(held.ui.tab).toBe('needsYou')
  const late = send(held.ui, arrived, { type: 'visible', isVisible: true }, T0 + 500 + FOLD_QUIET_MS)
  expect(late.ui.tab).toBe('findings')
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
  expect(read(due.ui, withItems(gone, [question('i2')]), T0 + 200 + FOLD_QUIET_MS).ui.tab).toBe('needsYou')
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

test('a row recorded while Help shows starts its new-row tint when Help closes', () => {
  const s = sessionWith({ findings: [finding('f1')] })
  const arrived = withFindings(s, [finding('f1'), finding('f2')])
  const help = send(openOn(s, T0, 'findings').ui, s, { type: 'show-help', isShown: true }, T0 + 10)
  const run = read(help.ui, arrived, T0 + 20)
  expect(run.ui.newRows.f2?.shownAt).toBeNull()
  const closedHelp = send(run.ui, arrived, { type: 'show-help', isShown: false }, T0 + 5000)
  expect(closedHelp.ui.newRows.f2?.shownAt).toBe(T0 + 5000)
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

test('a PR listed while PRs load is not new, and its waiting thread is followed once they have loaded', () => {
  const empty = sessionWith({})
  const start = openOn(empty)
  const base = viewOf(empty, start.ui, T0 + 10)
  const pr = {
    ref: 'a/b#1',
    number: 1,
    title: 'Fix it',
    url: 'https://github.com/a/b/pull/1',
    isDraft: false,
    state: 'OPEN',
    base: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: '',
    checks: [],
    threads: [
      {
        id: 't1',
        author: 'reviewer',
        reply: null,
        isWaiting: true,
        isOutdated: false,
        isLinesChanged: false,
        path: 'a.ts',
        line: 1,
        body: 'Rename this',
        url: 'https://github.com/a/b/pull/1#t1',
        at: 5,
      },
    ],
    isYours: true,
    wasSeenOpen: true,
    error: null,
  }
  const withPr: SessionView = {
    ...base,
    prs: { ...base.prs, drawn: [{ pr, state: { is: 'open' }, isRanked: false }] },
  }
  const loading = reduceUi(start.ui, withPr, { type: 'read', host: { ...FACTS, isFetchingPrs: true } }, T0 + 10)
  expect(loading.ui.tab).toBe('needsYou')
  expect(loading.ui.newRows).toEqual({})
  const loaded = reduceUi(loading.ui, withPr, { type: 'read', host: FACTS }, T0 + 20)
  expect(loaded.ui.tab).toBe('prs')
  expect(loaded.commands).toContainEqual({ kind: 'tab-shown', tab: 'prs' })
})
