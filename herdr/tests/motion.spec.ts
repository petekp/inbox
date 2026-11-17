import { expect, test } from 'bun:test'

import { prMarkId } from '../../hooks/pr-rows'
import { ENTER_FADE_MS, LEAVE_FADE_MS } from '../../hooks/row-motion'
import { SETTLED_MS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { rowWaits, tabBlocks } from '../src/draw'
import { withClosedSelection, withSelected } from '../src/keys'
import { NEXT_FRAME_MS, NO_TRACKS, moveRows } from '../src/motion'
import { HEIGHT_SETTLE_MS } from '../../hooks/springs'
import { NOW, demoScreen, dismissedPr, uiOn, withDismissedAsk } from './fixtures'
import { allOf, openPanel } from './gpui-stand-in'

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a row the publish dropped stays drawn until its fade and its height spring come to rest, then goes', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const first = moveRows(blocks, NO_TRACKS, NOW, true)
  const gone = rowsOf(blocks)[0]!
  const without = blocks.filter(b => b.id !== gone.id)
  const leaving = moveRows(without, first.tracks, NOW + 1, false)
  expect(leaving.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(leaving.motion.get(gone.id)?.state).toBe('leaving')
  const restsAt = NOW + 1 + NEXT_FRAME_MS + LEAVE_FADE_MS + HEIGHT_SETTLE_MS + NEXT_FRAME_MS
  const settling = moveRows(without, leaving.tracks, restsAt - 1, false)
  expect(settling.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(moveRows(without, settling.tracks, restsAt, false).blocks.some(b => b.id === gone.id)).toBe(false)
})

test('a leaving row fades out while its box holds, then its box shuts; an entering row opens, then fades in', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const row = rowsOf(blocks).find(r => !r.settled && !r.isSelected)!
  const without = blocks.filter(b => b.id !== row.id)
  const leaves = moveRows(without, moveRows(blocks, NO_TRACKS, NOW, true).tracks, NOW, false)
  const fading = moveRows(without, leaves.tracks, NOW + NEXT_FRAME_MS, false)
  const shutAt = NOW + NEXT_FRAME_MS + LEAVE_FADE_MS
  const held = moveRows(without, fading.tracks, shutAt - 1, false)
  const shut = moveRows(without, held.tracks, shutAt, false)
  expect(leaves.motion.get(row.id)).toMatchObject({
    state: 'leaving',
    box: 'open',
    isShown: true,
    fadeMs: LEAVE_FADE_MS,
  })
  expect(fading.motion.get(row.id)).toMatchObject({ box: 'open', isShown: false })
  expect(held.motion.get(row.id)?.box).toBe('open')
  expect(shut.motion.get(row.id)?.box).toBe('shut')
  expect(fading.nextAt).toBe(shutAt)
  const enters = moveRows(blocks, moveRows(without, NO_TRACKS, NOW, true).tracks, NOW, false)
  const opens = moveRows(blocks, enters.tracks, NOW + NEXT_FRAME_MS, false)
  expect(enters.motion.get(row.id)).toMatchObject({ state: 'entering', box: 'shut', isShown: false })
  expect(opens.motion.get(row.id)).toMatchObject({
    box: 'open',
    isShown: true,
    fadeMs: ENTER_FADE_MS,
    waitsForSpace: true,
  })
})

test('while a block leaves and holds its space, a block that enters in the same draw waits to open', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const [gone, added] = rowsOf(blocks).filter(r => !r.settled && !r.isSelected)
  const before = blocks.filter(b => b.id !== added!.id)
  const after = blocks.filter(b => b.id !== gone!.id)
  const starts = moveRows(after, moveRows(before, NO_TRACKS, NOW, true).tracks, NOW, false)
  const opensAt = NOW + NEXT_FRAME_MS + LEAVE_FADE_MS
  const waits = moveRows(after, starts.tracks, opensAt - 1, false)
  const opens = moveRows(after, waits.tracks, opensAt, false)
  expect(waits.motion.get(added!.id)).toMatchObject({ state: 'entering', box: 'shut', isShown: false })
  expect(opens.motion.get(added!.id)).toMatchObject({ box: 'open', isShown: true })
})

test('a group title takes its new count in the draw that sets its rows moving, not the draw before', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const gone = rowsOf(blocks).find(r => !r.settled && !r.isSelected)!
  const screen = demoScreen()
  const questions = screen.view.needsYou.questions.filter(r => r.id !== gone.id)
  const needsYou = { ...screen.view.needsYou, questions }
  const without = tabBlocks({ ...screen, view: { ...screen.view, needsYou } }, uiOn('needsYou'))
  const heading = (bs: Block[]) => JSON.stringify(bs.find(b => b.id.startsWith('group ')))
  const starts = moveRows(without, moveRows(blocks, NO_TRACKS, NOW, true).tracks, NOW, false)
  const moving = moveRows(without, starts.tracks, NOW + NEXT_FRAME_MS, false)
  expect(heading(without)).not.toBe(heading(blocks))
  expect(heading(starts.blocks)).toBe(heading(blocks))
  expect(heading(moving.blocks)).toBe(heading(without))
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

test('a fold’s lines enter shut and open at the next draw, and a shut fold fades them out, then shuts them', () => {
  const shut = tabBlocks(demoScreen(), uiOn('needsYou'))
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { unfolded: ['question'] }))
  const lines = open.filter(b => 'depth' in b && b.depth === 1).map(b => b.id)
  expect(lines.length).toBeGreaterThan(0)
  const rest = moveRows(shut, NO_TRACKS, NOW, true)
  const start = moveRows(open, rest.tracks, NOW + 1, false)
  const next = moveRows(open, start.tracks, NOW + 17, false)
  const back = moveRows(shut, next.tracks, NOW + 50, false)
  const gone = moveRows(shut, back.tracks, NOW + 50 + LEAVE_FADE_MS, false)
  expect(boxesOf(start, lines).every(b => b === 'shut')).toBe(true)
  expect(boxesOf(next, lines).every(b => b === 'open')).toBe(true)
  expect(lines.map(id => back.motion.get(id)?.isShown)).toEqual(lines.map(() => false))
  expect(boxesOf(gone, lines).every(b => b === 'shut')).toBe(true)
  expect(gone.blocks.filter(b => lines.includes(b.id)).length).toBe(lines.length)
})

test('a line that leaves starts open, fades, then shuts, and a Status done fold’s rows move as a Closed fold’s do', () => {
  const shut = tabBlocks(demoScreen(), uiOn('overview'))
  const open = tabBlocks(demoScreen(), uiOn('overview', { statusUnfolded: ['other-done'] }))
  const done = open.slice(open.findIndex(b => b.id === 'other-done') + 1).map(b => b.id)
  expect(done.length).toBeGreaterThan(0)
  const rest = moveRows(open, NO_TRACKS, NOW, true)
  const start = moveRows(shut, rest.tracks, NOW + 1, false)
  const next = moveRows(shut, start.tracks, NOW + 17, false)
  const after = moveRows(shut, next.tracks, NOW + 17 + LEAVE_FADE_MS, false)
  expect(boxesOf(start, done).every(b => b === 'open')).toBe(true)
  expect(done.map(id => next.motion.get(id)?.isShown)).toEqual(done.map(() => false))
  expect(boxesOf(after, done).every(b => b === 'shut')).toBe(true)
  expect(boxesOf(moveRows(open, NO_TRACKS, NOW, true), ['s2', 's5'])).toEqual([null, null])
})

test('in the panel, opening each row of a tab and pressing z leaves no row open after each press, and the last one collapsed stays selected', async () => {
  const { panel, paint, click, press, settle } = await openPanel()
  const openRows = () => {
    paint()
    return [...panel.tracks.rows.values()].flatMap(({ block: b }) =>
      b.kind === 'row' && b.isSelected && !b.isCollapsed ? [b.id] : [],
    )
  }
  const rowNode = (id: string) => allOf(paint()).find(n => n.id === `row ${id}`)
  const ids = allOf(paint()).flatMap(n => (n.id?.startsWith('row ') ? [n.id.slice('row '.length)] : []))
  const collapsed: string[] = []
  for (const id of ids) {
    const row = rowNode(id)
    if (!openRows().includes(id) && row?.click) click(row)
    await settle()
    if (!openRows().includes(id)) continue
    press('z')
    await settle()
    expect(openRows()).toEqual([])
    collapsed.push(id)
  }
  expect(collapsed.length).toBeGreaterThan(1)
  expect(panel.ui.selected).toBe(collapsed.at(-1)!)
})

test('a field a press brings in opens and shows in the draw after the press, while the lines it takes the place of fade', () => {
  const before = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  const press = moveRows(typing, moveRows(before, NO_TRACKS, NOW, true).tracks, NOW, false)
  const next = moveRows(typing, press.tracks, NOW + NEXT_FRAME_MS, false)
  const leaving = [...next.motion].filter(([, m]) => m.state === 'leaving').map(([id]) => id)
  expect(leaving.length).toBeGreaterThan(0)
  expect(next.motion.get('goal field')).toMatchObject({ box: 'open', isShown: true, fadeMs: 0 })
})

test('the row the selection moves to opens in the draw that moves it, while another block leaves', () => {
  const screen = demoScreen()
  const questions = screen.view.needsYou.questions.filter(r => r.id !== 'd15')
  const fewer = { ...screen, view: { ...screen.view, needsYou: { ...screen.view.needsYou, questions } } }
  const before = tabBlocks(screen, uiOn('needsYou', { selected: 'd11' }))
  const after = tabBlocks(fewer, uiOn('needsYou', { selected: 'd12' }))
  const moved = moveRows(after, moveRows(before, NO_TRACKS, NOW, true).tracks, NOW, false)
  const d12 = rowsOf(moved.blocks).find(r => r.id === 'd12')
  expect(moved.motion.get('d15')?.state).toBe('leaving')
  expect(d12?.isSelected).toBe(true)
  expect(moved.motion.get('d12')?.state).toBe('opening')
})
