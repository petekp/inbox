import { expect, test } from 'bun:test'

import { rowKeyPlan } from '../../hooks/action-plan'
import { actionLabel } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import { goalKeyPlan, statusKeyPlan } from '../../hooks/status-keys'
import { shownTabs } from '../../hooks/tabs'
import { NO_HOLDS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks, tabCells } from '../src/draw'
import { readSession } from '../src/files'
import { screenOf } from '../src/screen'
import type { Followed } from '../src/follow'
import { NOW, demoEnvelopeText, demoScreen, uiOn } from './fixtures'

const plannedLabels = (row: RowView, isAllShown: boolean) => {
  const { keys, more } = rowKeyPlan(row, isAllShown)
  return [...keys, ...more].map(k => (k.slot === 'allOptions' || k.slot === 'retry' ? k.label : actionLabel(k.action)))
}

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a selected row draws its buttons in the shared key plan order', () => {
  const screen = demoScreen()
  const { view } = screen
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows].filter(
    r => r.state.is === 'open',
  )
  expect(rows.length).toBeGreaterThan(5)
  for (const row of rows)
    for (const isAllShown of [false, true]) {
      const ui = uiOn(row.type === 'finding' ? 'findings' : 'needsYou', {
        selected: row.id,
        optionsShown: isAllShown ? [row.id] : [],
      })
      const drawn = rowsOf(tabBlocks(screen, ui)).find(b => b.id === row.id)!
      expect(drawn.buttons.map(b => b.label)).toEqual(plannedLabels(row, isAllShown))
    }
})

test('only the selected row shows buttons, and with no selection the first waiting row opens', () => {
  const rows = rowsOf(tabBlocks(demoScreen(), uiOn('needsYou')))
  const opened = rows.filter(r => r.isSelected)
  expect(opened.map(r => r.id)).toEqual([rows.find(r => r.isSelectable)!.id])
  expect(rows.filter(r => !r.isSelected && r.depth === 0).every(r => r.buttons.length === 0)).toBe(true)
})

test('the tabs follow the build’s shared tab plan, with their counts', () => {
  for (const isNextBuild of [false, true]) {
    const cells = tabCells(demoScreen(isNextBuild), 'needsYou')
    expect(cells.map(c => c.label)).toEqual(shownTabs(isNextBuild).map(t => t.label))
    expect(cells.filter(c => c.isSelected).map(c => c.id)).toEqual(['needsYou'])
  }
})

test('a group’s Closed fold shows its lines only while open', () => {
  const screen = demoScreen()
  const shut = tabBlocks(screen, uiOn('needsYou'))
  const fold = shut.find(b => b.kind === 'fold')
  if (fold?.kind !== 'fold' || !('closedFold' in fold.change)) throw new Error('no Closed fold')
  expect(rowsOf(shut).some(r => r.depth === 1)).toBe(false)
  const open = tabBlocks(screen, uiOn('needsYou', { unfolded: [fold.change.closedFold] }))
  expect(rowsOf(open).filter(r => r.depth === 1).length).toBeGreaterThan(0)
})

test('the Status page draws the goal’s and each row’s buttons in their plans’ order', () => {
  const screen = demoScreen()
  const page = screen.view.statusPage
  const blocks = tabBlocks(screen, uiOn('overview'))
  const heading = blocks.find(b => b.kind === 'heading' && b.id === 'goal heading')
  expect(heading?.kind === 'heading' && heading.buttons.map(b => b.label)).toEqual(goalKeyPlan(page).map(k => k.label))
  for (const row of page.rows.filter(r => r.kind === 'subject')) {
    const drawn = blocks.find(b => b.kind === 'status' && b.id === row.id)
    expect(drawn?.kind === 'status' && drawn.buttons.map(b => b.label)).toEqual(statusKeyPlan(row).map(k => k.label))
  }
})

test('each case of the followed terminal draws its own message, and a read session draws the inbox', () => {
  const read = readSession(demoEnvelopeText())
  const o = {
    now: NOW,
    isNextBuild: true,
    holds: { ...NO_HOLDS, shownSince: NOW },
    queue: { outs: [], notes: {}, lines: {} },
  }
  const cases: [Followed, Parameters<typeof screenOf>[1]][] = [
    [{ is: 'no-terminal' }, null],
    [{ is: 'no-inbox', terminal: 't1', program: 'zsh' }, null],
    [{ is: 'ended', terminal: 't1' }, null],
    [{ is: 'session', terminal: 't1', sessionId: 's1' }, null],
    [{ is: 'session', terminal: 't1', sessionId: 's1' }, { is: 'missing' }],
    [
      { is: 'session', terminal: 't1', sessionId: 's1' },
      { is: 'newer', format: 2 },
    ],
    [
      { is: 'session', terminal: 't1', sessionId: 's1' },
      { is: 'refused', reason: 'no agent' },
    ],
  ]
  const titles = cases.map(([f, r]) => {
    const s = screenOf(f, r, uiOn('needsYou'), o)
    return s.is === 'message' ? s.message.title : null
  })
  expect(titles.every(t => t !== null)).toBe(true)
  expect(new Set(titles).size).toBe(cases.length)
  expect(screenOf({ is: 'session', terminal: 't1', sessionId: 's1' }, read, uiOn('needsYou'), o).is).toBe('inbox')
})
