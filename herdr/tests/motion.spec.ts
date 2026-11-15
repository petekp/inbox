import { expect, test } from 'bun:test'

import { prMarkId } from '../../hooks/pr-rows'
import { EXIT_MS } from '../../hooks/row-motion'
import { SETTLED_MS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { rowWaits, tabBlocks } from '../src/draw'
import { withClosedSelection, withSelected } from '../src/keys'
import { NEXT_FRAME_MS, NO_TRACKS, moveRows } from '../src/motion'
import { HEIGHT_SETTLE_MS } from '../src/springs'
import { NOW, demoScreen, dismissedPr, uiOn, withDismissedAsk } from './fixtures'
import './gpui-stand-in'

const { spacesOf } = await import('../src/paint-space')

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a row the publish dropped stays drawn until its fade and its height spring come to rest, then goes', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const first = moveRows(blocks, NO_TRACKS, NOW, true)
  const gone = rowsOf(blocks)[0]!
  const without = blocks.filter(b => b.id !== gone.id)
  const leaving = moveRows(without, first.tracks, NOW + 1, false)
  expect(leaving.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(leaving.motion.get(gone.id)?.state).toBe('leaving')
  const restsAt = NOW + 1 + Math.max(EXIT_MS, HEIGHT_SETTLE_MS) + NEXT_FRAME_MS
  const settling = moveRows(without, leaving.tracks, restsAt - 1, false)
  expect(settling.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(moveRows(without, settling.tracks, restsAt, false).blocks.some(b => b.id === gone.id)).toBe(false)
})

test('a first draw forgets the last draw’s rows and draws its own at rest', () => {
  const asks = moveRows(tabBlocks(demoScreen(), uiOn('needsYou')), NO_TRACKS, NOW, true)
  const findings = tabBlocks(demoScreen(), uiOn('findings'))
  const shown = moveRows(findings, asks.tracks, NOW + 1, true)
  expect(shown.blocks.map(b => b.id)).toEqual(findings.map(b => b.id))
  expect([...shown.motion.values()].filter(m => m.state === 'entering' || m.state === 'leaving')).toEqual([])
  expect(shown.nextAt).toBeNull()
})

test('a leaving group keeps its place among the blocks that remain, its heading and fold leaving with its rows', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('findings'))
  const goneGroup = new Set(['group issue', 'd23', 'd22', 'fold issue'])
  const first = moveRows(blocks, NO_TRACKS, NOW, true)
  const leaving = moveRows(
    blocks.filter(b => !goneGroup.has(b.id)),
    first.tracks,
    NOW + 1,
    false,
  )
  expect(leaving.blocks.map(b => b.id)).toEqual([...goneGroup, 'rule opportunity', 'group opportunity', 'd21', 'd20'])
  expect([...goneGroup].map(id => leaving.motion.get(id)?.state)).toEqual(['leaving', 'leaving', 'leaving', 'leaving'])
})

test('a PR dismissed and then undone changes form in place, never drawn twice and never fading in or out', () => {
  const ref = 'acme/visor#29'
  const id = prMarkId(ref)
  const open = tabBlocks(demoScreen(), uiOn('prs'))
  const first = moveRows(open, NO_TRACKS, NOW, true)
  const dismissed = moveRows(dismissedPr(ref).blocks, first.tracks, NOW + 1, false)
  expect(dismissed.blocks.filter(b => b.id === id).map(b => b.kind)).toEqual(['row'])
  expect(dismissed.motion.get(id)).toMatchObject({ state: 'settling', box: null })
  const undone = moveRows(open, dismissed.tracks, NOW + 2, false)
  expect(undone.blocks.filter(b => b.id === id).map(b => b.kind)).toEqual(['pr'])
  expect(undone.motion.get(id)).toMatchObject({ state: 'closing', box: null, closing: null })
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

const boxesOf = (moved: ReturnType<typeof moveRows>, ids: string[]) => ids.map(id => moved.motion.get(id)?.box ?? null)

test('a fold’s lines enter shut and open at the next draw, and a shut fold sends them back from where they are', () => {
  const shut = tabBlocks(demoScreen(), uiOn('needsYou'))
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { unfolded: ['question'] }))
  const lines = open.filter(b => 'depth' in b && b.depth === 1).map(b => b.id)
  expect(lines.length).toBeGreaterThan(0)
  const rest = moveRows(shut, NO_TRACKS, NOW, true)
  const start = moveRows(open, rest.tracks, NOW + 1, false)
  const next = moveRows(open, start.tracks, NOW + 17, false)
  const back = moveRows(shut, next.tracks, NOW + 50, false)
  expect(boxesOf(start, lines).every(b => b === 'shut')).toBe(true)
  expect(boxesOf(next, lines).every(b => b === 'open')).toBe(true)
  expect(boxesOf(back, lines).every(b => b === 'shut')).toBe(true)
  expect(back.blocks.filter(b => lines.includes(b.id)).length).toBe(lines.length)
})

test('a line that leaves starts open, then shuts, and a Status done fold’s rows move as a Closed fold’s do', () => {
  const shut = tabBlocks(demoScreen(), uiOn('overview'))
  const open = tabBlocks(demoScreen(), uiOn('overview', { statusUnfolded: ['other-done'] }))
  const done = open.slice(open.findIndex(b => b.id === 'other-done') + 1).map(b => b.id)
  expect(done.length).toBeGreaterThan(0)
  const rest = moveRows(open, NO_TRACKS, NOW, true)
  const start = moveRows(shut, rest.tracks, NOW + 1, false)
  const next = moveRows(shut, start.tracks, NOW + 17, false)
  expect(boxesOf(start, done).every(b => b === 'open')).toBe(true)
  expect(boxesOf(next, done).every(b => b === 'shut')).toBe(true)
  expect(boxesOf(moveRows(open, NO_TRACKS, NOW, true), ['s2', 's5'])).toEqual([null, null])
})

test('the block under moving blocks keeps its space as they glide, and the run’s last box holds the rest', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('overview', { statusUnfolded: ['other-done'] }))
  const atFold = blocks.findIndex(b => b.id === 'other-done')
  const withBelow = [
    ...blocks,
    {
      kind: 'note' as const,
      id: 'after',
      text: 'after',
      count: null,
      tone: null,
      isHead: false,
      isAtEdge: false,
      isStrong: false,
      depth: 0,
    },
  ]
  const done = new Set(withBelow.slice(atFold + 1, -1).map(b => b.id))
  const resting = spacesOf(withBelow, () => false)
  const moving = spacesOf(withBelow, b => done.has(b.id))
  const shut = spacesOf(
    withBelow.filter(b => !done.has(b.id)),
    () => false,
  )
  const spaceOf = (spaces: typeof moving, id: string) => spaces.find(s => s.block.id === id)!
  const last = moving.filter(s => done.has(s.block.id)).at(-1)!
  expect(spaceOf(moving, 'after').above + last.floor).toBe(spaceOf(shut, 'after').above)
  expect(spaceOf(moving, 'after').above + last.below).toBe(spaceOf(resting, 'after').above)
})
