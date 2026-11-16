import { expect, test } from 'bun:test'

import { foldAllIn, foldClickOpens } from '../src/fold-all'
import { tabBlocks } from '../src/draw'
import { keyMove } from '../src/keys'
import { demoScreen, uiOn } from './fixtures'

const cx = { notify: () => undefined } as never

function lookOn(tab: 'needsYou' | 'overview') {
  const screen = demoScreen()
  const saved: { id: string; isCollapsed: boolean }[] = []
  const look = {
    view: screen.view,
    ui: uiOn(tab),
    collapse: (id: string, isCollapsed: boolean) => void saved.push({ id, isCollapsed }),
  }

  return { screen, saved, look }
}

test('the w key asks the look to fold every fold', () => {
  const { screen, look } = lookOn('needsYou')
  const blocks = tabBlocks(screen, look.ui)
  expect(keyMove('w', [], blocks, null)).toEqual({ is: 'fold-all' })
  expect(keyMove('w', [], blocks, 'row')).toBeNull()
})

test('a fold-all by key folds every row of the tab while any is open, then opens them all', () => {
  const { look, saved } = lookOn('needsYou')
  foldAllIn(look, null, cx)
  expect(saved.length).toBeGreaterThan(1)
  expect(saved.every(c => c.isCollapsed)).toBe(true)
  look.view = { ...look.view, collapsed: saved.map(c => c.id) }
  saved.length = 0
  foldAllIn(look, null, cx)
  expect(saved.length).toBeGreaterThan(1)
  expect(saved.every(c => !c.isCollapsed)).toBe(true)
})

test('an Option-click on a row title names the direction by the row that was clicked', () => {
  const { look } = lookOn('needsYou')
  expect(foldClickOpens({ is: 'collapse', id: 'a', isCollapsed: true }, look.ui)).toBe(false)
  expect(foldClickOpens({ is: 'collapse', id: 'a', isCollapsed: false }, look.ui)).toBe(true)
  expect(foldClickOpens({ is: 'nothing' }, look.ui)).toBeNull()
})
