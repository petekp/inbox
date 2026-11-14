import { expect, test } from 'bun:test'

import { prMarkId } from '../../hooks/pr-rows'
import { EXIT_MS } from '../../hooks/row-motion'
import { SETTLED_MS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { rowWaits, tabBlocks } from '../src/draw'
import { withClosedSelection, withSelected } from '../src/keys'
import { NO_TRACKS, moveRows } from '../src/motion'
import { NOW, demoScreen, dismissedPr, uiOn, withDismissedAsk } from './fixtures'

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a row the publish dropped stays drawn while it leaves, then goes', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const first = moveRows(blocks, NO_TRACKS, NOW, true)
  const gone = rowsOf(blocks)[0]!
  const without = blocks.filter(b => b.id !== gone.id)
  const leaving = moveRows(without, first.tracks, NOW + 1, false)
  expect(leaving.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(leaving.motion.get(gone.id)?.state).toBe('leaving')
  expect(moveRows(without, leaving.tracks, NOW + 1 + EXIT_MS, false).blocks.some(b => b.id === gone.id)).toBe(false)
})

test('a first draw forgets the last draw’s rows and draws its own at rest', () => {
  const asks = moveRows(tabBlocks(demoScreen(), uiOn('needsYou')), NO_TRACKS, NOW, true)
  const findings = tabBlocks(demoScreen(), uiOn('findings'))
  const shown = moveRows(findings, asks.tracks, NOW + 1, true)
  expect(shown.blocks.map(b => b.id)).toEqual(findings.map(b => b.id))
  expect([...shown.motion.values()].filter(m => m.state === 'entering' || m.state === 'leaving')).toEqual([])
  expect(shown.nextAt).toBeNull()
})

test('a leaving row whose block above went too keeps its place among the blocks that remain', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('findings'))
  const goneGroup = new Set(['group issue', 'd23', 'd22', 'fold issue'])
  const first = moveRows(blocks, NO_TRACKS, NOW, true)
  const leaving = moveRows(
    blocks.filter(b => !goneGroup.has(b.id)),
    first.tracks,
    NOW + 1,
    false,
  )
  expect(leaving.blocks.map(b => b.id)).toEqual(['d23', 'd22', 'rule opportunity', 'group opportunity', 'd21', 'd20'])
  expect([leaving.motion.get('d23')?.state, leaving.motion.get('d22')?.state]).toEqual(['leaving', 'leaving'])
})

test('a PR dismissed and then undone changes form in place, never drawn twice and never fading in', () => {
  const ref = 'acme/visor#29'
  const id = prMarkId(ref)
  const open = tabBlocks(demoScreen(), uiOn('prs'))
  const first = moveRows(open, NO_TRACKS, NOW, true)
  const dismissed = moveRows(dismissedPr(ref).blocks, first.tracks, NOW + 1, false)
  expect(dismissed.blocks.filter(b => b.id === id).map(b => b.kind)).toEqual(['row'])
  expect(dismissed.motion.get(id)?.state).toBe('settled')
  const undone = moveRows(open, dismissed.tracks, NOW + 2, false)
  expect(undone.blocks.filter(b => b.id === id).map(b => b.kind)).toEqual(['pr'])
  expect(undone.motion.has(id)).toBe(false)
})

const openRow = (blocks: Block[]) => rowsOf(blocks).find(r => r.isSelected)?.id

test('closing the open row opens the next row that waits after it, keeps it once the row folds, and Undo reopens it', () => {
  const ui = uiOn('needsYou', { selected: 'd13' })
  const closing = withDismissedAsk('d13', NOW - 500)
  const moved = withClosedSelection(ui, rowWaits(demoScreen(), 'needsYou'), rowWaits(closing, 'needsYou'))
  expect(moved.selected).toBe('d15')
  expect(openRow(tabBlocks(closing, moved))).toBe('d15')
  expect(openRow(tabBlocks(withDismissedAsk('d13', NOW - SETTLED_MS - 5000), moved))).toBe('d15')
  const undoing = withSelected(moved, 'd13')
  expect(openRow(tabBlocks(closing, undoing))).toBe('d15')
  expect(openRow(tabBlocks(demoScreen(), undoing))).toBe('d13')
})

test('a selected row that did not wait, such as a handed-off one, stays open', () => {
  const ui = uiOn('needsYou', { selected: 'd18' })
  const waits = rowWaits(demoScreen(), 'needsYou')
  expect(waits.find(r => r.id === 'd18')?.isWaiting).toBe(false)
  expect(withClosedSelection(ui, waits, waits)).toBe(ui)
  expect(openRow(tabBlocks(demoScreen(), ui))).toBe('d18')
})
