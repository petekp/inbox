import { expect, test } from 'bun:test'

import { freshUi } from '../../hooks/ui-controller-types'
import type { UiCommand } from '../../hooks/ui-controller-types'
import { HERDR_LOOK, applyEvents } from '../src/controller'
import { foldClickOpens } from '../src/fold-all'
import { tabBlocks } from '../src/draw'
import { keyMove } from '../src/keys'
import { NOW, demoScreen, uiOn } from './fixtures'

const savedOf = (commands: UiCommand[]) =>
  commands.flatMap(c => (c.kind === 'save-collapse' ? [{ id: c.id, isCollapsed: c.isCollapsed }] : []))

test('the w key asks the controller to fold every fold, and types into an open field instead', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  expect(keyMove('w', [], blocks, null)).toEqual({ is: 'event', event: { type: 'fold-all', isOpening: null } })
  expect(keyMove('w', [], blocks, 'row')).toBeNull()
})

test('a fold-all by key folds every row of the tab while any is open, then opens them all', () => {
  const { view } = demoScreen()
  const ui = freshUi(HERDR_LOOK)
  const folded = savedOf(applyEvents(ui, view, [{ type: 'fold-all', isOpening: null }], NOW).commands)
  expect(folded.length).toBeGreaterThan(1)
  expect(folded.every(c => c.isCollapsed)).toBe(true)
  const shut = { ...view, collapsed: folded.map(c => c.id) }
  const opened = savedOf(applyEvents(ui, shut, [{ type: 'fold-all', isOpening: null }], NOW).commands)
  expect(opened.length).toBeGreaterThan(1)
  expect(opened.every(c => !c.isCollapsed)).toBe(true)
})

test('an Option-click on a row title names the direction by the row that was clicked', () => {
  const ui = freshUi(HERDR_LOOK)
  expect(foldClickOpens({ is: 'collapse', id: 'a', isCollapsed: true }, ui)).toBe(false)
  expect(foldClickOpens({ is: 'collapse', id: 'a', isCollapsed: false }, ui)).toBe(true)
  expect(foldClickOpens({ is: 'nothing' }, ui)).toBeNull()
})
