import { expect, setSystemTime, test } from 'bun:test'

import { prMarkId } from '../../hooks/pr-rows'
import { ENTER_FADE_MS, LEAVE_FADE_MS } from '../../hooks/row-motion'
import { PRESS_GUARD_MS, SETTLED_MS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { rowWaits, tabBlocks, tabCells } from '../src/draw'
import { withClosedSelection, withSelected } from '../src/keys'
import { NEXT_FRAME_MS, NO_TRACKS, heldTabs, moveRows } from '../src/motion'
import { HEIGHT_SETTLE_MS } from '../../hooks/springs'
import { NOW, demoScreen, dismissedPr, dismissedSession, uiOn, withDismissedAsk } from './fixtures'
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

test('a field a press brings in opens and shows in the draw after the press, and the lines it takes the place of hide at once and shut', () => {
  const before = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  const press = moveRows(typing, moveRows(before, NO_TRACKS, NOW, true).tracks, NOW, false, true)
  const next = moveRows(typing, press.tracks, NOW + NEXT_FRAME_MS, false)
  const leaving = [...press.motion].filter(([, m]) => m.state === 'leaving').map(([id]) => id)
  expect(leaving.length).toBeGreaterThan(0)
  for (const id of leaving) expect(press.motion.get(id)).toMatchObject({ isShown: false, fadeMs: 0 })
  for (const id of leaving) expect(next.motion.get(id)?.box).toBe('shut')
  expect(next.motion.get('goal field')).toMatchObject({ box: 'open', isShown: true, fadeMs: 0 })
})

test('the row the person’s selection moves to opens in the draw that moves it, while another block leaves', () => {
  const screen = demoScreen()
  const questions = screen.view.needsYou.questions.filter(r => r.id !== 'd15')
  const fewer = { ...screen, view: { ...screen.view, needsYou: { ...screen.view.needsYou, questions } } }
  const before = tabBlocks(screen, uiOn('needsYou', { selected: 'd11' }))
  const after = tabBlocks(fewer, uiOn('needsYou', { selected: 'd12' }))
  const moved = moveRows(after, moveRows(before, NO_TRACKS, NOW, true).tracks, NOW, false, true)
  const d12 = rowsOf(moved.blocks).find(r => r.id === 'd12')
  expect(moved.motion.get('d15')?.state).toBe('leaving')
  expect(d12?.isSelected).toBe(true)
  expect(moved.motion.get('d12')?.state).toBe('opening')
  expect(moved.motion.get('d11')).toMatchObject({ state: 'closing', isHeightHeld: false })
})

test('the row a publish moves the selection to keeps its last form while another block leaves, then opens as the height of the row it left starts to close', () => {
  const screen = demoScreen()
  const questions = screen.view.needsYou.questions.filter(r => r.id !== 'd15')
  const fewer = { ...screen, view: { ...screen.view, needsYou: { ...screen.view.needsYou, questions } } }
  const first = moveRows(tabBlocks(screen, uiOn('needsYou', { selected: 'd11' })), NO_TRACKS, NOW, true)
  const after = tabBlocks(fewer, uiOn('needsYou', { selected: 'd12' }))
  const leaves = moveRows(after, first.tracks, NOW, false)
  const d12 = rowsOf(leaves.blocks).find(r => r.id === 'd12')
  expect(leaves.motion.get('d15')?.state).toBe('leaving')
  expect(d12?.isSelected).toBe(false)
  expect(leaves.motion.get('d12')?.state).not.toBe('opening')
  expect(leaves.motion.get('d11')).toMatchObject({ state: 'closing', isHeightHeld: true })
  const opens = moveRows(after, leaves.tracks, leaves.tracks.holdsUntil, false)
  expect(opens.motion.get('d12')).toMatchObject({ state: 'opening', isStart: true })
  expect(opens.motion.get('d11')).toMatchObject({ state: 'closing', isHeightHeld: false })
})

test('the Asks tab takes its new count in the draw that sets the rows moving, with the group title', () => {
  const screen = demoScreen()
  const gone = screen.view.needsYou.questions.find(r => r.state.is !== 'settled')!
  const questions = screen.view.needsYou.questions.filter(r => r.id !== gone.id)
  const needsYou = { ...screen.view.needsYou, questions, count: screen.view.needsYou.count - 1 }
  const fewer = { ...screen, view: { ...screen.view, needsYou } }
  const badge = (tabs: { id: string; badge: string | null }[]) => tabs.find(t => t.id === 'needsYou')?.badge
  const before = tabCells(screen, 'needsYou')
  const after = tabCells(fewer, 'needsYou')
  const blocks = tabBlocks(fewer, uiOn('needsYou'))
  const starts = moveRows(
    blocks,
    moveRows(tabBlocks(screen, uiOn('needsYou')), NO_TRACKS, NOW, true).tracks,
    NOW,
    false,
  )
  const moving = moveRows(blocks, starts.tracks, NOW + NEXT_FRAME_MS, false)
  const startTabs = heldTabs(after, before, starts.motion)
  expect(badge(after)).not.toBe(badge(before))
  expect(badge(startTabs)).toBe(badge(before))
  expect(badge(heldTabs(after, startTabs, moving.motion))).toBe(badge(after))
})

test('a row closes on its spring when the selection leaves it while another block’s leave holds its space', () => {
  const screen = demoScreen()
  const questions = screen.view.needsYou.questions.filter(r => r.id !== 'd15')
  const fewer = { ...screen, view: { ...screen.view, needsYou: { ...screen.view.needsYou, questions } } }
  const first = moveRows(tabBlocks(screen, uiOn('needsYou', { selected: 'd11' })), NO_TRACKS, NOW, true)
  const leaves = moveRows(tabBlocks(fewer, uiOn('needsYou', { selected: 'd11' })), first.tracks, NOW + 1, false)
  const moves = moveRows(tabBlocks(fewer, uiOn('needsYou', { selected: 'd12' })), leaves.tracks, NOW + 50, false, true)
  expect(moves.motion.get('d15')?.state).toBe('leaving')
  expect(moves.motion.get('d11')).toMatchObject({ state: 'closing', isHeightHeld: false })
})

test('a block listed again before its box had opened fades in once its box is nearly open', () => {
  const screen = demoScreen()
  const asksOf = (ids: string[]) => {
    const questions = screen.view.needsYou.questions.filter(r => ids.includes(r.id))
    return tabBlocks(
      { ...screen, view: { ...screen.view, needsYou: { ...screen.view.needsYou, questions } } },
      uiOn('needsYou'),
    )
  }
  const first = moveRows(asksOf(['d11']), NO_TRACKS, NOW, true)
  const enters = moveRows(asksOf(['d11', 'd12']), first.tracks, NOW + 1, false)
  const leaves = moveRows(asksOf(['d11']), enters.tracks, NOW + 5, false)
  const back = moveRows(asksOf(['d11', 'd12']), leaves.tracks, NOW + 10, false)
  expect(enters.motion.get('d12')?.box).toBe('shut')
  expect(back.motion.get('d12')).toMatchObject({ state: 'entering', box: 'open', isShown: true, waitsForSpace: true })
})

test('a tab that gains its first count shows none in the draw that sets the rows moving', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('needsYou'))
  const fewer = blocks.filter(b => b.id !== 'd15')
  const starts = moveRows(fewer, moveRows(blocks, NO_TRACKS, NOW, true).tracks, NOW, false)
  const after = tabCells(screen, 'needsYou')
  const before = after.map(t => ({ ...t, badge: null }))
  expect(after.find(t => t.id === 'needsYou')?.badge).not.toBeNull()
  expect(heldTabs(after, before, starts.motion).find(t => t.id === 'needsYou')?.badge).toBeNull()
})

test('a click on a collapsed row’s title shows its panel without waiting for its space, as a key does', async () => {
  let at = NOW
  const tick = () => setSystemTime(new Date((at += PRESS_GUARD_MS + 1)))
  const panel = await openPanel()
  try {
    panel.measure(() => ({ width: 300, height: 40 }))
    const rowId = openRow([...panel.panel.tracks.rows.values()].map(r => r.block))
    for (const _ of ['collapse', 'expand']) {
      const title = allOf(panel.paint()).find(n => n.id === `title ${rowId}`)!
      tick()
      panel.click(title)
    }
    expect(
      allOf(panel.paint())
        .find(n => n.id === `panel ${rowId}`)
        ?.delays.get('opacity'),
    ).toBe(0)
  } finally {
    setSystemTime(new Date(NOW))
  }
})

async function nextPanelDelay(isPressed: boolean) {
  let at = NOW
  const tick = () => setSystemTime(new Date((at += PRESS_GUARD_MS + 1)))
  const panel = await openPanel()
  try {
    panel.measure(() => ({ width: 300, height: 40 }))
    const blocks = () => [...panel.panel.tracks.rows.values()].map(r => r.block)
    const rowId = openRow(blocks())!
    const row = allOf(panel.paint()).find(n => n.id === `row ${rowId}`)
    tick()
    if (isPressed) panel.click(allOf(row!).find(n => n.label === 'Dismiss')!)
    panel.paint()
    const read = panel.panel.read
    if (read?.is === 'read') panel.panel.read = { ...read, session: dismissedSession(rowId, at) }
    tick()
    panel.measure(() => ({ width: 300, height: 40 }))
    setSystemTime(new Date(at + NEXT_FRAME_MS))
    expect(openRow(blocks())).not.toBe(rowId)

    return allOf(panel.paint())
      .find(n => n.id === `panel ${openRow(blocks())}`)
      ?.delays.get('opacity')
  } finally {
    setSystemTime(new Date(NOW))
  }
}

test('a press that closes the open row opens the next row in the draw of the publish that answers it, as a key does', async () => {
  expect(await nextPanelDelay(true)).toBe(0)
  expect(await nextPanelDelay(false)).toBeGreaterThan(0)
})
