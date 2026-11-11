import { expect, test } from 'bun:test'

import { pressFile } from '../../hooks/herdr-press-file'
import { prCheckId, prMarkId, prThreadId, splitFollowUps, threadSentIn } from '../../hooks/pr-rows'
import { checkActions, prBlockActions, threadActions } from '../../hooks/pr-tab'
import { pendingResult } from '../../hooks/pressed'
import { EXIT_MS } from '../../hooks/row-motion'
import { NO_HOLDS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import { afterSend, keyMove, withSelected, withTab } from '../src/keys'
import { moveRows } from '../src/motion'
import { GIVE_UP_MS, SENDING, drawOuts, rowSignature, settleOuts } from '../src/out'
import type { Out } from '../src/out'
import { pressFileText } from '../src/press-file'
import { isRunHere, runHere } from '../src/run-here'
import type { HereIo } from '../src/run-here'
import { NOW, demoScreen, uiOn } from './fixtures'

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a press file the look writes reads as a press in the hosts’ format, with its holds and its open’s result', () => {
  const holds = { replies: { q1: NOW }, discarded: {}, shownSince: NOW, listInput: null, undoShown: ['x'] }
  const read = pressFile(pressFileText('p1', NOW, { action: 'done', id: 'q1' }, holds, { error: null }))
  expect(read.ok && read.file).toMatchObject({
    id: 'p1',
    press: { action: 'done', id: 'q1' },
    holds: { replies: { q1: NOW }, shownSince: NOW },
    result: { error: null },
  })
  expect(read.ok && 'undoShown' in read.file.holds).toBe(false)
  const sent = pressFile(pressFileText('p2', NOW, { action: 'pr-refresh' }, NO_HOLDS))
  expect(sent.ok && 'result' in sent.file).toBe(false)
})

function outOn(rowId: string, overrides: Partial<Out> = {}): Out {
  const { view } = demoScreen()
  return {
    pressId: 'p5',
    rowId,
    path: '/x',
    action: 'done',
    label: 'Done',
    pending: null,
    result: null,
    before: rowSignature(view, rowId),
    isWritten: true,
    waitingSince: NOW,
    isTaken: false,
    ...overrides,
  }
}

test('a press waits until its file is written, and by the give-up time reads not confirmed if taken, else goes back', () => {
  const { view } = demoScreen()
  const rowId = view.needsYou.questions[0]!.id
  expect(settleOuts([outOn(rowId, { before: 'other' })], view, null, NOW).outs).toEqual([])
  const unwritten = outOn(rowId, { isWritten: false, waitingSince: null, isTaken: true })
  expect(settleOuts([unwritten], view, null, NOW + GIVE_UP_MS * 2).outs).toEqual([unwritten])
  expect(settleOuts([outOn(rowId, { isTaken: true })], view, null, NOW + 100).outs.length).toBe(1)
  const taken = settleOuts([outOn(rowId, { isTaken: true })], view, null, NOW + GIVE_UP_MS)
  expect(taken.lines[rowId]?.text).toBe('Not confirmed: Done')
  expect(taken.notes).toEqual({})
  const lost = settleOuts([outOn(rowId)], view, null, NOW + GIVE_UP_MS)
  expect(lost.outs).toEqual([])
  expect(lost.toClaim.map(o => o.rowId)).toEqual([rowId])
})

test('the host’s last press ends the press it names, and a taken press older than it reads not confirmed at once', () => {
  const { view } = demoScreen()
  const rowId = view.needsYou.questions[0]!.id
  const out = outOn(rowId)
  const applied = settleOuts([out], view, { id: out.pressId, outcome: 'applied' }, NOW + 100)
  expect(applied).toEqual({ outs: [], notes: {}, lines: {}, toClaim: [] })
  const stale = settleOuts([out], view, { id: out.pressId, outcome: 'stale' }, NOW + 100)
  expect(stale.notes[rowId]?.note).toBe('stale')
  expect(settleOuts([out], view, { id: 'p6', outcome: 'applied' }, NOW + 100).outs).toEqual([out])
  const taken = outOn(rowId, { isTaken: true, reply: 'Call it hello' })
  expect(settleOuts([taken], view, { id: 'p4', outcome: 'applied' }, NOW + 100).outs).toEqual([taken])
  const passed = settleOuts([taken], view, { id: 'p6', outcome: 'applied' }, NOW + 100)
  expect(passed.outs).toEqual([])
  expect(passed.lines[rowId]?.text).toBe('Reply not confirmed: Call it hello')
})

test('every press button on a row with a press out draws out, and its row reads Sending… or the look’s own result', () => {
  const screen = demoScreen()
  const row = screen.view.needsYou.questions.find(r => r.state.is === 'open')!
  const blocks = tabBlocks(screen, uiOn('needsYou', { selected: row.id }))
  const drawn = rowsOf(blocks).find(b => b.id === row.id)!
  const presses = drawn.buttons.filter(b => b.does.is === 'press')
  expect(presses.length).toBeGreaterThan(1)
  const out = outOn(row.id)
  const after = rowsOf(drawOuts(blocks, [out], {})).find(b => b.id === row.id)!
  expect(after.buttons.filter(b => b.isOut).map(b => b.id)).toEqual(presses.map(b => b.id))
  expect(after.feedback?.text).toBe(SENDING)
  const open = [{ kind: 'open' as const, target: '/a/plan.md', name: 'plan.md' }]
  const failed = { ...pendingResult(open, NOW), state: 'failed' as const }
  failed.parts[0] = { ...failed.parts[0]!, error: 'no such file' }
  const ran = rowsOf(drawOuts(blocks, [outOn(row.id, { result: failed })], {})).find(b => b.id === row.id)!
  expect(ran.feedback).toEqual({ text: 'Could not open plan.md: no such file', tone: 'error' })
})

test('the PRs tab draws each PR’s and each selected row’s buttons in the shared plans’ order', () => {
  const screen = demoScreen()
  const { view } = screen
  const presses = { lastActions: view.lastActions, turns: view.turns, now: NOW }
  const isSent = threadSentIn(view.lastActions)
  const open = view.prs.drawn.filter(d => d.state.is === 'open').map(d => d.pr)
  const blocks = tabBlocks(screen, uiOn('prs'))
  for (const pr of open) {
    const drawn = blocks.find(b => b.kind === 'pr' && b.id === prMarkId(pr.ref))
    const planned = prBlockActions(pr, isSent, view.prs.branchRef, presses).map(a => a.label)
    expect(drawn?.kind === 'pr' && drawn.buttons.map(b => b.label)).toEqual(planned)
  }
  const selectable = rowsOf(blocks).filter(r => r.isSelectable)
  expect(selectable.length).toBeGreaterThan(0)
  for (const row of selectable) {
    const selected = rowsOf(tabBlocks(screen, uiOn('prs', { selected: row.id }))).find(r => r.id === row.id)!
    const planned = open.flatMap(pr => [
      ...pr.threads
        .filter(t => prThreadId(pr, t) === row.id)
        .map(t => splitFollowUps(threadActions(pr, t, presses)))
        .map(({ keys, more }) => [...keys, ...more]),
      ...pr.checks.filter(c => prCheckId(pr, c) === row.id).map(c => checkActions(pr, c, presses)),
    ])
    expect(planned.length).toBe(1)
    expect(selected.buttons.map(b => b.label)).toEqual(planned[0]!.map(a => a.label))
  }
})

test('keys switch tabs, step rows, press a selected row’s hotkey, and leave the look', () => {
  const screen = demoScreen()
  const tabs = [
    { id: 'needsYou' as const, label: 'Asks', badge: null, isSelected: true },
    { id: 'findings' as const, label: 'Finds', badge: null, isSelected: false },
  ]
  const blocks = tabBlocks(screen, uiOn('needsYou'))
  const rows = rowsOf(blocks).filter(r => r.isSelectable)
  const selected = rows.find(r => r.isSelected)!
  expect(keyMove('right', tabs, blocks, null)).toEqual({ is: 'tab', tab: 'findings' })
  expect(keyMove('left', tabs, blocks, null)).toEqual({ is: 'tab', tab: 'findings' })
  expect(keyMove('j', tabs, blocks, null)).toEqual({ is: 'select', id: rows[rows.indexOf(selected) + 1]!.id })
  const hotkeyed = selected.buttons.find(b => b.hotkey !== null)!
  expect(keyMove(hotkeyed.hotkey!, tabs, blocks, null)).toEqual({ is: 'press', button: hotkeyed })
  expect(keyMove('escape', tabs, blocks, null)).toEqual({ is: 'leave' })
})

test('while a field is open, keys type into it and escape closes it, and moving to another row or tab closes it', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const [first, second] = rowsOf(blocks).filter(r => r.isSelectable)
  const tabs = [{ id: 'needsYou' as const, label: 'Asks', badge: null, isSelected: true }]
  expect(['j', 'right', first!.buttons[0]!.hotkey ?? 'x'].map(k => keyMove(k, tabs, blocks, first!.id))).toEqual([
    null,
    null,
    null,
  ])
  expect(keyMove('escape', tabs, blocks, first!.id)).toEqual({ is: 'close' })
  const typing = uiOn('needsYou', { selected: first!.id, typing: first!.id })
  expect(withSelected(typing, first!.id).typing).toBe(first!.id)
  expect(withSelected(typing, second!.id).typing).toBeNull()
  expect(withTab(typing, 'findings').typing).toBeNull()
})

test('a sent field closes and drops its draft, and a refused one keeps both', () => {
  const ui = uiOn('needsYou', { typing: 'q1' })
  const drafts = { q1: { text: 'Call it hello', since: NOW }, q2: { text: 'Later', since: NOW } }
  expect(afterSend(ui, drafts, 'q1', false)).toEqual({ ui, drafts })
  expect(afterSend(ui, drafts, 'q1', true)).toEqual({ ui: { ...ui, typing: null }, drafts: { q2: drafts.q2 } })
})

test('a row the publish dropped stays drawn while it leaves, then goes', () => {
  const blocks = tabBlocks(demoScreen(), uiOn('needsYou'))
  const first = moveRows(blocks, new Map(), NOW, true)
  const gone = rowsOf(blocks)[0]!
  const without = blocks.filter(b => b.id !== gone.id)
  const leaving = moveRows(without, first.tracks, NOW + 1, false)
  expect(leaving.blocks.some(b => b.id === gone.id)).toBe(true)
  expect(leaving.motion.get(gone.id)?.state).toBe('leaving')
  expect(moveRows(without, leaving.tracks, NOW + 1 + EXIT_MS, false).blocks.some(b => b.id === gone.id)).toBe(false)
})

test('a relative open runs in the look against the session’s project folder, and goes to the host without one', async () => {
  const open = [{ kind: 'open', target: 'docs/plan.md', name: 'plan.md' }] as const
  expect(isRunHere([...open], null)).toBe(false)
  expect(isRunHere([...open], '/work/app')).toBe(true)
  expect(isRunHere([{ kind: 'open', target: 'https://example.com', name: 'example.com' }], null)).toBe(true)
  const ran: string[][] = []
  const io: HereIo = {
    run: async argv => {
      ran.push(argv)
      return { code: 0, stdout: '', stderr: '' }
    },
    probe: { stat: async () => ({ isFile: () => true }), isExecutable: async () => false },
    home: '/home/me',
    projectFolder: '/work/app',
    copy: () => undefined,
  }
  expect((await runHere([...open], pendingResult([...open], NOW), io)).state).toBe('done')
  expect(ran.flat()).toContain('/work/app/docs/plan.md')
})
