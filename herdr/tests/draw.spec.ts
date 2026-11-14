import { expect, test } from 'bun:test'

import { rowKeyPlan } from '../../hooks/action-plan'
import { CLEAR_FINISHED_ID } from '../../hooks/pr-rows'
import { actionLabel } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import { goalKeyPlan, statusKeyPlan } from '../../hooks/status-keys'
import { shownTabs } from '../../hooks/tabs'
import { NO_HOLDS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks, tabCells } from '../src/draw'
import { readSession } from '../src/files'
import { keyMove } from '../src/keys'
import { screenOf } from '../src/screen'
import type { Followed } from '../src/follow'
import { NOW, demoEnvelopeText, demoScreen, finishedScreen, uiOn } from './fixtures'

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

test('a selected question draws why it came up first under its title, in the Why line’s tone, and a collapsed one draws none', () => {
  const screen = demoScreen()
  const question = screen.view.needsYou.questions.find(r => r.contextLine)!
  const selected = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(
    b => b.id === question.id,
  )!
  expect(selected.body[0]).toEqual({ text: question.contextLine!, tone: 'muted' })
  expect(selected.body.find(l => l.text === question.recLine)?.tone).toBe('muted')
  const other = screen.view.needsYou.questions.find(r => r.id !== question.id && r.state.is === 'open')!
  const collapsed = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: other.id }))).find(b => b.id === question.id)!
  expect(collapsed.body.some(l => l.text === question.contextLine)).toBe(false)
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

test('the PRs tab draws Clear merged and closed above the first PR, m presses it from any row, and it does not draw for the branch’s own PR alone', () => {
  const tabs = [{ id: 'prs' as const, label: 'PRs', badge: null, isSelected: true }]
  const blocks = tabBlocks(finishedScreen({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' }), uiOn('prs'))
  const at = blocks.findIndex(b => b.id === CLEAR_FINISHED_ID)
  const line = blocks[at]
  if (line?.kind !== 'line') throw new Error('no Clear merged and closed line')
  expect(at).toBeLessThan(blocks.findIndex(b => b.kind === 'pr'))
  expect(line.buttons.map(b => [b.label, b.hotkey, b.does])).toEqual([
    ['Clear merged and closed', 'm', { is: 'press', press: { action: 'pr-clear-finished' }, effects: [] }],
  ])
  const thread = blocks.find(b => b.kind === 'row' && b.isSelectable)
  if (thread?.kind !== 'row') throw new Error('no thread row')
  const onThread = tabBlocks(
    finishedScreen({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' }),
    uiOn('prs', { selected: thread.id }),
  )
  expect(onThread.some(b => b.kind === 'row' && b.id === thread.id && b.isSelected)).toBe(true)
  expect(keyMove('m', tabs, onThread, null)).toEqual({ is: 'press', button: line.buttons[0]! })
  const branchOnly = tabBlocks(finishedScreen({ 'acme/visor#31': 'MERGED' }), uiOn('prs'))
  expect(branchOnly.some(b => b.id === CLEAR_FINISHED_ID)).toBe(false)
})
