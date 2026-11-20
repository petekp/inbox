import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { withCollapse } from '../hooks/collapse'
import { FOLD_QUIET_MS, PRESS_GUARD_MS } from '../hooks/timing'
import { openRowOf, selectedOf } from '../hooks/ui-controller-selection'
import { COLLAPSE_WAIT_MS } from '../hooks/ui-controller-types'
import {
  closedByAgent,
  kinds,
  openOn,
  question,
  read,
  send,
  sessionWith,
  T0,
  viewOf,
  withItems,
} from './ui-controller-helpers'

const THREE = sessionWith({ items: [question('i1'), question('i2'), question('i3')] })
const answer = (id: string) => ({ action: 'answer', id, option: 'Yes' }) as const
const LATER = T0 + 10 + FOLD_QUIET_MS

test('with no row picked, the first waiting row is selected and drawn open', () => {
  const { ui } = openOn(THREE)
  expect(ui.selection.needsYou.id).toBe(null)
  expect(selectedOf(ui, viewOf(THREE, ui, T0), 'needsYou')).toBe('i1')
  expect(openRowOf(ui, viewOf(THREE, ui, T0), 'needsYou')).toBe('i1')
})

test('a second click on a row a click just opened is dropped until the guard ends, and a key press is not', () => {
  const { ui } = openOn(THREE)
  const clicked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'click' }, T0 + 10)
  const early = send(clicked.ui, THREE, { type: 'press', press: answer('i2'), by: 'click' }, T0 + 20)
  expect(kinds(early.commands)).toEqual([])
  const byKey = send(clicked.ui, THREE, { type: 'press', press: answer('i2'), by: 'key' }, T0 + 20)
  expect(kinds(byKey.commands)).toEqual(['press'])
  const late = send(clicked.ui, THREE, { type: 'press', press: answer('i2'), by: 'click' }, T0 + 10 + PRESS_GUARD_MS)
  expect(kinds(late.commands)).toEqual(['press'])
  expect(clicked.nextWakeAt).toBe(T0 + 10 + PRESS_GUARD_MS)
})

test('when the agent closes the picked row, the cursor moves to the next waiting row and reveals it', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const run = read(picked.ui, closedByAgent(THREE, 'i2', LATER), LATER)
  expect(run.ui.selection.needsYou.id).toBe('i3')
  expect(run.commands).toContainEqual({ kind: 'reveal', tab: 'needsYou', id: 'i3', closedId: 'i2' })
})

test('when the agent closes the last waiting row, the cursor moves back to the nearest one before it', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i3', by: 'key' }, T0 + 10)
  const run = read(picked.ui, closedByAgent(THREE, 'i3', LATER), LATER)
  expect(run.ui.selection.needsYou.id).toBe('i2')
})

test('the agent’s close of the picked row waits while the list is in use, then moves once the list is quiet', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const closed = closedByAgent(THREE, 'i2', T0 + 20)
  const held = read(picked.ui, closed, T0 + 20)
  expect(held.ui.selection.needsYou.id).toBe('i2')
  expect(held.ui.heldClose).toEqual({ tab: 'needsYou', id: 'i2' })
  expect(held.nextWakeAt).toBe(T0 + 10 + FOLD_QUIET_MS)
  const due = send(held.ui, closed, { type: 'tick' }, T0 + 10 + FOLD_QUIET_MS)
  expect(due.ui.selection.needsYou.id).toBe('i3')
  expect(due.ui.heldClose).toBe(null)
})

test('a row the person’s own press closed moves the cursor at once, even while the list is in use', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const pressed = send(picked.ui, THREE, { type: 'press', press: answer('i2'), by: 'key' }, T0 + 20)
  const run = read(pressed.ui, closedByAgent(THREE, 'i2', T0 + 30), T0 + 30)
  expect(run.ui.selection.needsYou.id).toBe('i3')
  expect(run.ui.heldClose).toBe(null)
})

test('a row with its field open keeps the cursor when the agent closes it', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const typing = send(picked.ui, THREE, { type: 'open-field', id: 'i2' }, T0 + 20)
  const run = read(typing.ui, closedByAgent(THREE, 'i2', LATER), LATER)
  expect(run.ui.selection.needsYou.id).toBe('i2')
  expect(run.ui.typing).toBe('i2')
})

test('j and k step through the look’s own order and wrap past either end', () => {
  const { ui } = openOn(THREE)
  const ids = ['i1', 'i2', 'i3']
  const down = send(ui, THREE, { type: 'step', by: 1, ids }, T0 + 10)
  expect(down.ui.selection.needsYou.id).toBe('i2')
  expect(down.commands).toEqual([{ kind: 'reveal', tab: 'needsYou', id: 'i2', closedId: null }])
  const up = send(ui, THREE, { type: 'step', by: -1, ids }, T0 + 10)
  expect(up.ui.selection.needsYou.id).toBe('i3')
  expect(down.ui.selection.needsYou.guard).toBe(null)
  const none = send(ui, THREE, { type: 'step', by: 1, ids: [] }, T0 + 10)
  expect(none.ui.selection).toEqual(ui.selection)
})

test('a title press selects another row, collapses the open one, and expands a collapsed one', () => {
  const { ui } = openOn(THREE)
  const other = send(ui, THREE, { type: 'title-press', id: 'i2', by: 'key' }, T0 + 10)
  expect(other.ui.selection.needsYou.id).toBe('i2')
  expect(other.commands).toEqual([])
  const collapsed = send(other.ui, THREE, { type: 'title-press', id: 'i2', by: 'key' }, T0 + 20)
  expect(collapsed.commands).toEqual([{ kind: 'save-collapse', id: 'i2', isCollapsed: true }])
  expect(openRowOf(collapsed.ui, viewOf(THREE, collapsed.ui, T0 + 20), 'needsYou')).toBe(null)
  const expanded = send(collapsed.ui, THREE, { type: 'title-press', id: 'i2', by: 'key' }, T0 + 30)
  expect(expanded.commands).toEqual([{ kind: 'save-collapse', id: 'i2', isCollapsed: false }])
  expect(openRowOf(expanded.ui, viewOf(THREE, expanded.ui, T0 + 30), 'needsYou')).toBe('i2')
})

test('a second title click inside the guard does not collapse the row the first click opened', () => {
  const { ui } = openOn(THREE)
  const opened = send(ui, THREE, { type: 'title-press', id: 'i2', by: 'click' }, T0 + 10)
  const again = send(opened.ui, THREE, { type: 'title-press', id: 'i2', by: 'click' }, T0 + 20)
  expect(again.commands).toEqual([])
  const after = send(opened.ui, THREE, { type: 'title-press', id: 'i2', by: 'click' }, T0 + 10 + PRESS_GUARD_MS)
  expect(kinds(after.commands)).toEqual(['save-collapse'])
})

test('collapsing the row that opened by default pins the cursor there, so the next row does not open', () => {
  const { ui } = openOn(THREE)
  const run = send(ui, THREE, { type: 'collapse', id: 'i1', isCollapsed: true }, T0 + 10)
  expect(run.ui.selection.needsYou.id).toBe('i1')
  expect(openRowOf(run.ui, viewOf(THREE, run.ui, T0 + 10), 'needsYou')).toBe(null)
})

test('a collapse waits for the view to show it, and is dropped once it does or after the wait', () => {
  const { ui } = openOn(THREE)
  const run = send(ui, THREE, { type: 'collapse', id: 'i1', isCollapsed: true }, T0 + 10)
  expect(run.ui.collapses.i1).toEqual({ isCollapsed: true, at: T0 + 10 })
  expect(read(run.ui, THREE, T0 + 20).ui.collapses).toEqual(run.ui.collapses)
  expect(read(run.ui, withCollapse(THREE, 'i1', true, T0 + 10), T0 + 20).ui.collapses).toEqual({})
  expect(read(run.ui, THREE, T0 + 10 + COLLAPSE_WAIT_MS).ui.collapses).toEqual({})
})

test('a row that arrives opens when the picked row is collapsed, and not when it draws open', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const four = withItems(THREE, [question('i1'), question('i2'), question('i3'), question('i4')])
  expect(read(picked.ui, four, T0 + 20).ui.selection.needsYou.id).toBe('i2')
  const collapsed = send(picked.ui, THREE, { type: 'collapse', id: 'i2', isCollapsed: true }, T0 + 15)
  expect(read(collapsed.ui, four, T0 + 20).ui.selection.needsYou.id).toBe('i4')
})

test('the cursor follows its row’s place when rows above it leave', () => {
  const { ui } = openOn(THREE)
  const picked = send(ui, THREE, { type: 'select', tab: 'needsYou', id: 'i3', by: 'key' }, T0 + 10)
  expect(picked.ui.selection.needsYou.index).toBe(2)
  const run = read(picked.ui, withItems(THREE, [question('i2'), question('i3')]), LATER)
  expect(run.ui.selection.needsYou).toEqual({ id: 'i3', index: 1, guard: null })
})

test('closing a fold also takes its kind out of the folds whose earlier rows show', () => {
  const { ui } = openOn(THREE)
  const open = send(ui, THREE, { type: 'fold', fold: 'question', isOpen: true }, T0 + 10)
  const earlier = send(open.ui, THREE, { type: 'earlier', fold: 'question' }, T0 + 20)
  expect(earlier.ui.closedAll).toEqual(['question'])
  const shut = send(earlier.ui, THREE, { type: 'fold', fold: 'question', isOpen: false }, T0 + 30)
  expect(shut.ui.unfolded).toEqual([])
  expect(shut.ui.closedAll).toEqual([])
})
