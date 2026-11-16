import { expect, test } from 'bun:test'

import { statusListRows } from '../../hooks/status-folds'
import type { Block } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import { withCollapsed } from '../src/keys'
import { demoScreen, uiOn } from './fixtures'

test('a Status parent draws a chevron after its name that folds its rows away and opens them, the fold hides the rows under it and its connector, and the press saves the collapse', () => {
  const screen = demoScreen()
  const rows = statusListRows(screen.view.statusPage)
  const s1 = rows.find(r => r.id === 's1')
  if (s1?.kind !== 'subject') throw new Error('no s1 subject')
  const milestone = screen.view.statusPage.goal!.milestones.find(m => m.foldCount > 0)!
  const underS1 = rows.filter(r => r.kind === 'child' && r.id.startsWith('c') && r.depth > s1.depth).map(r => r.id)
  const open = tabBlocks(screen, uiOn('overview'))
  const folded = tabBlocks({ ...screen, view: { ...screen.view, collapsed: ['s1', milestone.id] } }, uiOn('overview'))
  const statusOf = (blocks: Block[], id: string) => {
    const b = blocks.find(x => x.id === id)
    return b?.kind === 'status' ? b : undefined
  }

  expect(statusOf(open, 's1')?.fold).toMatchObject({
    isFolded: false,
    toggle: { does: { is: 'collapse', id: 's1', isCollapsed: true } },
  })
  expect(statusOf(folded, 's1')?.fold).toMatchObject({
    isFolded: true,
    count: s1.foldCount,
    toggle: { does: { is: 'collapse', id: 's1', isCollapsed: false } },
  })
  expect(statusOf(open, milestone.id)?.fold).toMatchObject({ isFolded: false })
  expect(statusOf(folded, milestone.id)?.fold).toMatchObject({ isFolded: true, count: milestone.foldCount })
  expect(underS1.length).toBeGreaterThan(0)
  expect(underS1.every(id => open.some(b => b.id === id))).toBe(true)
  expect(underS1.some(id => folded.some(b => b.id === id))).toBe(false)
  expect(milestone.rows.some(r => folded.some(b => b.id === r.id))).toBe(false)
  const ownConnector = { depth: s1.depth, is: 'down' as const }
  expect(statusOf(open, 's1')?.tree).toContainEqual(ownConnector)
  expect(statusOf(folded, 's1')?.tree ?? []).not.toContainEqual(ownConnector)
  expect(statusOf(folded, 's1')?.buttons.map(b => b.label)).toEqual(statusOf(open, 's1')?.buttons.map(b => b.label))
  expect(statusOf(open, 's1')?.buttons.some(b => b.does.is === 'collapse')).toBe(false)
  expect(statusOf(open, 'c1')?.fold).toBeUndefined()
})

test('the press on a parent’s chevron saves its collapse and opens it again', () => {
  const screen = demoScreen()
  const toggleOf = (collapsed: string[]) => {
    const blocks = tabBlocks({ ...screen, view: { ...screen.view, collapsed } }, uiOn('overview'))
    const b = blocks.find(x => x.id === 's1')

    return b?.kind === 'status' ? b.fold?.toggle.does : undefined
  }

  expect(toggleOf([])).toEqual({ is: 'collapse', id: 's1', isCollapsed: true })
  expect(toggleOf(['s1'])).toEqual({ is: 'collapse', id: 's1', isCollapsed: false })
})

test('a collapse on the Status tab leaves the selected row, and one on a row tab selects its row', () => {
  const onStatus = withCollapsed(uiOn('overview', { selected: 'q1' }), 's1', true)
  const onRows = withCollapsed(uiOn('needsYou', { selected: 'q1' }), 'q2', true)

  expect(onStatus.selected).toBe('q1')
  expect(onRows.selected).toBe('q2')
})
