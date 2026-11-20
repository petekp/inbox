import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshUi } from '../../hooks/ui-controller-types'
import type { UiState } from '../../hooks/ui-controller-types'
import './row-actions-fixtures'
import { CODEX_LOOK } from '../src/tab-state'
import type { Kept } from '../src/tab-state'
import { keptOf, uiOfKept } from '../src/tab-swap'

const NOW = 1_000_000

test('a page loads the state a 0.6.0 page kept: its tab, cursors, drafts, folds and shown time', () => {
  const old: Kept = {
    version: 1,
    isDemo: false,
    tab: 'findings',
    selection: { needsYou: 'i2', findings: 'f1', prs: null },
    typing: 'f1',
    drafts: [
      ['f1', 'Half a reply'],
      ['i2', { text: 'Kept as a draft', since: 40 }],
    ],
    optionsShown: ['i2'],
    unfolded: ['question', 'finding'],
    shownSince: 50,
  }
  const ui = uiOfKept(JSON.parse(JSON.stringify(old)) as Kept, NOW)
  assert.equal(ui.tab, 'findings')
  assert.deepEqual(ui.selection.needsYou, { id: 'i2', index: 0, guard: null })
  assert.deepEqual(ui.selection.findings, { id: 'f1', index: 0, guard: null })
  assert.equal(ui.selection.prs.id, null)
  assert.equal(ui.typing, 'f1')
  assert.deepEqual(ui.drafts, { f1: { text: 'Half a reply', since: NOW }, i2: { text: 'Kept as a draft', since: 40 } })
  assert.deepEqual(ui.optionsShown, ['i2'])
  assert.deepEqual(ui.unfolded, ['question', 'issue', 'opportunity'])
  assert.equal(ui.shownSince, 50)
  assert.deepEqual(ui.statusUnfolded, [])
})

test('what a page keeps reads in a 0.6.0 page as the same tab, cursors, draft and folds, and in a new page as the whole controller state', () => {
  const fresh = freshUi(CODEX_LOOK, 'needsYou')
  const ui: UiState = {
    ...fresh,
    shownSince: 50,
    selection: { ...fresh.selection, needsYou: { id: 'i2', index: 1, guard: { by: 'click', at: NOW - 10 } } },
    typing: 'i2',
    drafts: { i2: { text: 'Waiting for access', since: 60 } },
    unfolded: ['task'],
    statusUnfolded: ['s1'],
    undoSeen: { i1: NOW - 2_000 },
    errors: { i3: { text: 'Could not send.', at: NOW - 100 } },
    pressesOut: { 4: { pressId: 4, rowId: 'i3', tab: 'needsYou', action: 'explain', at: NOW - 50, isReply: false } },
  }
  const kept = JSON.parse(JSON.stringify(keptOf(ui, false))) as Kept
  assert.ok(kept.version === 1 || kept.version === 2)
  assert.equal(kept.tab, 'needsYou')
  assert.deepEqual(kept.selection, { needsYou: 'i2', findings: null, prs: null })
  assert.equal(kept.typing, 'i2')
  assert.deepEqual(kept.drafts, [['i2', { text: 'Waiting for access', since: 60 }]])
  assert.deepEqual(kept.unfolded, ['task'])
  assert.equal(kept.shownSince, 50)
  assert.deepEqual(kept.statusUnfolded, ['s1'])
  const swapped = uiOfKept(kept, NOW + 500)
  assert.deepEqual(swapped.undoSeen, { i1: NOW - 2_000 })
  assert.deepEqual(swapped.errors, { i3: { text: 'Could not send.', at: NOW - 100 } })
  assert.deepEqual(swapped.selection.needsYou, ui.selection.needsYou)
  assert.deepEqual(swapped.pressesOut, {})
  assert.equal(swapped.config, CODEX_LOOK)
})
