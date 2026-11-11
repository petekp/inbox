import { expect, test } from 'bun:test'

import { pressFile } from '../../hooks/herdr'
import { prMarkId } from '../../hooks/pr-rows'
import { checkActions, prBlockActions, threadActions } from '../../hooks/pr-tab'
import { splitFollowUps, threadSentIn } from '../../hooks/pr-rows'
import { EXIT_MS } from '../../hooks/row-motion'
import { NO_HOLDS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import { keyMove } from '../src/keys'
import { moveRows } from '../src/motion'
import { GIVE_UP_MS, SENDING, STALE_AFTER_TAKEN_MS, drawOuts, outAction, rowSignature, settleOuts } from '../src/out'
import type { Out } from '../src/out'
import { pressFileText } from '../src/press-file'
import { AGENT, NOW, demoScreen, uiOn } from './fixtures'

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
    pressId: 'p1',
    rowId,
    path: '/x',
    action: 'done',
    pending: null,
    since: NOW,
    before: rowSignature(view, rowId),
    takenAt: null,
    ...overrides,
  }
}

test('a press ends when its row changes, reads stale once the host took it unchanged, and gives up unanswered', () => {
  const { view } = demoScreen()
  const rowId = view.needsYou.questions[0]!.id
  expect(settleOuts([outOn(rowId, { before: 'other' })], view, null, NOW, AGENT).outs).toEqual([])
  const waiting = settleOuts([outOn(rowId)], view, null, NOW + 100, AGENT)
  expect(waiting.outs.length).toBe(1)
  const taken = settleOuts([outOn(rowId, { takenAt: NOW })], view, null, NOW + STALE_AFTER_TAKEN_MS, AGENT)
  expect(taken.notes[rowId]?.note).toBe('stale')
  const lost = settleOuts([outOn(rowId)], view, null, NOW + GIVE_UP_MS, AGENT)
  expect(lost.errors[rowId]).toContain(AGENT)
})

test('the host’s last press ends the press it names at once, as applied or as stale', () => {
  const { view } = demoScreen()
  const rowId = view.needsYou.questions[0]!.id
  const out = outOn(rowId)
  const applied = settleOuts([out], view, { id: out.pressId, outcome: 'applied' }, NOW + 100, AGENT)
  expect(applied).toEqual({ outs: [], notes: {}, errors: {} })
  const stale = settleOuts([out], view, { id: out.pressId, outcome: 'stale' }, NOW + 100, AGENT)
  expect(stale.outs).toEqual([])
  expect(stale.notes[rowId]?.note).toBe('stale')
  const other = settleOuts([out], view, { id: 'another press', outcome: 'applied' }, NOW + 100, AGENT)
  expect(other.outs).toEqual([out])
})

test('a pressed button and those with its action draw out, and its row reads Sending… until the press settles', () => {
  const screen = demoScreen()
  const row = screen.view.needsYou.questions.find(r => r.state.is === 'open')!
  const blocks = tabBlocks(screen, uiOn('needsYou', { selected: row.id }))
  const drawn = rowsOf(blocks).find(b => b.id === row.id)!
  const pressed = drawn.buttons.find(b => b.does.is === 'press')!
  if (pressed.does.is !== 'press') throw new Error('no press')
  const out = outOn(row.id, { action: outAction(pressed.does.press) })
  const after = rowsOf(drawOuts(blocks, [out], {}, 'herdr')).find(b => b.id === row.id)!
  const sameAction = drawn.buttons.filter(b => b.does.is === 'press' && outAction(b.does.press) === out.action)
  expect(after.buttons.filter(b => b.isOut).map(b => b.id)).toEqual(sameAction.map(b => b.id))
  expect(after.feedback?.text).toBe(SENDING)
})

test('the PRs tab draws each PR’s and each selected row’s buttons in the shared plans’ order', () => {
  const screen = demoScreen()
  const { view } = screen
  const presses = { lastActions: view.lastActions, turns: view.turns, now: NOW }
  const isSent = threadSentIn(view.lastActions)
  const open = view.prs.drawn.filter(d => d.state.is === 'open')
  expect(open.length).toBeGreaterThan(0)
  for (const { pr } of open) {
    const blocks = tabBlocks(screen, uiOn('prs'))
    const drawn = blocks.find(b => b.kind === 'pr' && b.id === prMarkId(pr.ref))
    const planned = prBlockActions(pr, isSent, view.prs.branchRef, presses).map(a => a.label)
    expect(drawn?.kind === 'pr' && drawn.buttons.map(b => b.label)).toEqual(planned)
    for (const row of rowsOf(blocks).filter(r => r.isSelectable)) {
      const selected = rowsOf(tabBlocks(screen, uiOn('prs', { selected: row.id }))).find(r => r.id === row.id)!
      const thread = pr.threads.find(t => row.id.endsWith(t.id))
      const check = pr.checks.find(c => row.id === `${pr.ref} ${c.workflow ? `${c.workflow} / ` : ''}${c.name}`)
      if (thread) {
        const { keys, more } = splitFollowUps(threadActions(pr, thread, presses))
        expect(selected.buttons.map(b => b.label)).toEqual([...keys, ...more].map(a => a.label))
      } else if (check)
        expect(selected.buttons.map(b => b.label)).toEqual(checkActions(pr, check, presses).map(a => a.label))
    }
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
  expect(keyMove('right', tabs, blocks)).toEqual({ is: 'tab', tab: 'findings' })
  expect(keyMove('left', tabs, blocks)).toEqual({ is: 'tab', tab: 'findings' })
  expect(keyMove('j', tabs, blocks)).toEqual({ is: 'select', id: rows[rows.indexOf(selected) + 1]!.id })
  const hotkeyed = selected.buttons.find(b => b.hotkey !== null)!
  expect(keyMove(hotkeyed.hotkey!, tabs, blocks)).toEqual({ is: 'press', button: hotkeyed })
  expect(keyMove('escape', tabs, blocks)).toEqual({ is: 'leave' })
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
