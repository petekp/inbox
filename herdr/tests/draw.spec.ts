import { expect, test } from 'bun:test'

import { rowKeyPlan } from '../../hooks/action-plan'
import { CLEAR_FINISHED_ID } from '../../hooks/pr-rows'
import { actionLabel } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import { demoSession } from '../../hooks/demo'
import { sessionView } from '../../hooks/session-view'
import { goalKeyPlan, statusKeyPlan } from '../../hooks/status-keys'
import { shownTabs } from '../../hooks/tabs'
import { NO_HOLDS, SETTLED_MS } from '../../hooks/timing'
import type { LastAction } from '../../types'
import { agedText } from '../src/blocks'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks, tabCells } from '../src/draw'
import { readSession } from '../src/files'
import { NO_LINES_ABOVE, holdLinesAbove } from '../src/held-line'
import { keyMove } from '../src/keys'
import { screenOf } from '../src/screen'
import type { Followed } from '../src/follow'
import { AGENT, NOW, demoEnvelopeText, demoScreen, finishedScreen, uiOn } from './fixtures'

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

test('a selected question draws why it came up first under its title, and a collapsed one draws none', () => {
  const screen = demoScreen()
  const question = screen.view.needsYou.questions.find(r => r.contextLine)!
  const selected = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(
    b => b.id === question.id,
  )!
  expect(selected.body[0]).toMatchObject({ text: question.contextLine!, tone: 'muted' })
  const other = screen.view.needsYou.questions.find(r => r.id !== question.id && r.state.is === 'open')!
  const collapsed = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: other.id }))).find(b => b.id === question.id)!
  expect(collapsed.body.some(l => l.text === question.contextLine)).toBe(false)
})

test('a selected question with described answers draws its context, answers and Holds up line on one tree, with the last line ending it', () => {
  const screen = demoScreen()
  const question = screen.view.needsYou.questions.find(r => r.id === 'd11')!
  const selected = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(
    b => b.id === question.id,
  )!
  const recommended = selected.body.find(l => l.text.startsWith('Pinch: '))!
  expect(recommended.text).toContain('Recommended: a flick fires by accident while walking')
  const trees = selected.body.filter(l => l.tree !== undefined).map(l => l.tree)
  expect(trees[0]).toBe('trunk')
  expect(trees.at(-1)).toBe('last')
  expect(trees.slice(1, -1).every(t => t === 'tee' || t === 'trunk')).toBe(true)
})

test('the tabs follow the shared tab plan, with their counts', () => {
  const cells = tabCells(demoScreen(), 'needsYou')
  expect(cells.map(c => c.label)).toEqual(shownTabs().map(t => t.label))
  expect(cells.filter(c => c.isSelected).map(c => c.id)).toEqual(['needsYou'])
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

test('the Status page draws the goal’s milestones on a path: a seen done one as its fold, the line from each to the next and beside its work, dashed into the one that reads next, each word, and Later above the ones that wait', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const drawn = screen.view.statusPage.goal!.milestones.map(m => blocks.find(b => b.id === m.id)!)
  expect(drawn.map(b => b.kind)).toEqual(['fold', 'status', 'status', 'status', 'status'])
  expect(drawn.map(b => ('path' in b ? b.path : null))).toEqual([
    { is: 'milestone', above: null, below: 'continues' },
    { is: 'milestone', above: 'continues', below: 'continues' },
    { is: 'milestone', above: 'continues', below: 'to-next' },
    { is: 'milestone', above: 'to-next', below: null },
    { is: 'milestone', above: null, below: null },
  ])
  expect(drawn.map(b => (b.kind === 'status' ? b.word : null))).toEqual([
    null,
    undefined,
    'now · 1h',
    'next',
    undefined,
  ])
  expect(blocks.find(b => b.id === 's1')).toMatchObject({ path: { is: 'work', line: 'to-next' } })
  expect(blocks.findIndex(b => b.id === 'goal later')).toBe(blocks.findIndex(b => b.id === 'm5') - 1)
})

test('a met goal draws a ✓ in the met tone beside its Goal met label, its lines at the text column, and its milestones folded into a line that names them with the chevron after, which opens to the milestones, and its field at the text column', () => {
  const s = demoSession(NOW, AGENT)
  const o = s.ledger.overview!
  const met = {
    ...o,
    goal: { ...o.goal!, metAt: NOW },
    milestones: o.milestones.map(m => ({ ...m, status: 'done' as const })),
    subjects: o.subjects.map(x => ({ ...x, status: 'done' as const, closedAt: NOW - 1 })),
    children: [],
    lastLookAt: NOW,
  }
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const view = sessionView({ ...s, ledger: { ...s.ledger, overview: met } }, NOW, SETTLED_MS, holds)
  const screen = { ...demoScreen(), view }
  const fold = view.statusPage.goal!.milestonesFold!
  const shut = tabBlocks(screen, uiOn('overview'))
  const open = tabBlocks(screen, uiOn('overview', { statusUnfolded: [fold.id] }))
  const milestoneIds = view.statusPage.goal!.milestones.map(m => m.id)

  expect(shut.find(b => b.id === 'goal heading')).toMatchObject({ text: 'Goal met', mark: { text: '✓', tone: 'met' } })
  expect(shut.find(b => b.id === 'goal text')).toMatchObject({ isAtEdge: false })
  expect(shut.find(b => b.id === fold.id)).toMatchObject({
    kind: 'fold',
    text: fold.text,
    isLabelFirst: true,
    isOpen: false,
  })
  expect(shut.some(b => milestoneIds.includes(b.id))).toBe(false)
  expect(open.find(b => b.id === fold.id)).toMatchObject({ isOpen: true })
  expect(open.filter(b => milestoneIds.includes(b.id)).map(b => b.id)).toEqual(milestoneIds)
  expect(shut.some(b => b.id === 'head title')).toBe(true)
  expect(tabBlocks(screen, uiOn('overview', { typing: 'goal' })).find(b => b.id === 'goal field')).toMatchObject({
    isAtEdge: false,
  })
})

test('the Status page joins each parent to the rows under it: work beside the path’s line by an arm, other work by the milestone’s connector down to an elbow at its last row with nothing past it, and a subject’s children by its own connector', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const treeOf = (id: string) => {
    const b = blocks.find(b => b.id === id)
    return b && 'tree' in b ? b.tree : undefined
  }
  expect(screen.view.statusPage.goal!.milestones.map(m => treeOf(m.id))).toEqual([
    undefined,
    undefined,
    undefined,
    [{ depth: 0, is: 'down' }],
    [{ depth: 0, is: 'down' }],
  ])
  expect(['s1', 'c1', 'c4', 's3', 's2', 'c5'].map(treeOf)).toEqual([
    [
      { depth: 0, is: 'arm' },
      { depth: 1, is: 'down' },
    ],
    [{ depth: 1, is: 'mid' }],
    [{ depth: 1, is: 'last' }],
    [{ depth: 0, is: 'last' }],
    [{ depth: 0, is: 'down' }],
    [{ depth: 0, is: 'last' }],
  ])
  const page = screen.view.statusPage
  const milestones = page.goal!.milestones.map(m => (m.rows.some(r => r.id === 's1') ? { ...m, line: null } : m))
  const ended = { ...screen, view: { ...screen.view, statusPage: { ...page, goal: { ...page.goal!, milestones } } } }
  const endedBlocks = tabBlocks(ended, uiOn('overview'))
  const endedTreeOf = (id: string) => {
    const b = endedBlocks.find(b => b.id === id)
    return b && 'tree' in b ? b.tree : undefined
  }
  expect(['s1', 'c1', 'c4'].map(endedTreeOf)).toEqual([
    [
      { depth: 0, is: 'last' },
      { depth: 1, is: 'down' },
    ],
    [{ depth: 1, is: 'mid' }],
    [{ depth: 1, is: 'last' }],
  ])
})

test('each case of the followed terminal draws its own message, and a read session draws the inbox', () => {
  const read = readSession(demoEnvelopeText())
  const o = {
    now: NOW,
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

const earlierReply: LastAction = {
  kind: 'handoff',
  action: 'type',
  text: 'Send',
  reply: 'Not yet',
  at: NOW - 600_000,
  turnsStarted: 13,
}
const discuss: LastAction = { kind: 'talk', action: 'discuss', text: 'Discuss', at: NOW - 1000, turnsStarted: 14 }

function heldAcross(draws: [LastAction | null, number, string][]) {
  const session = demoSession(NOW, AGENT)
  const { d23: _, ...others } = session.lastActions
  let held = NO_LINES_ABOVE
  return draws.map(([last, applied, selected]) => {
    const s = {
      ...session,
      lastActions: last ? { ...others, d23: last } : others,
      presence: { ...session.presence, turnsStarted: 14, turnsApplied: applied },
    }
    const screen = { ...demoScreen(), view: sessionView(s, NOW, SETTLED_MS, NO_HOLDS) }
    const drawn = holdLinesAbove(tabBlocks(screen, uiOn('findings', { selected })), held, NOW)
    held = drawn.held
    const row = rowsOf(drawn.blocks).find(b => b.id === 'd23')!
    const line = row.heldLine
    const status = row.feedback ? `${row.isStatusHeldUnder ? 'under ' : ''}${row.feedback.text}` : null
    return [status, line ? `${line.isHidden ? 'hidden ' : ''}${line.text}` : null]
  })
}

test('a row keeps its status line above its buttons while the host shows its press under way, until the press ends', () => {
  expect(
    heldAcross([
      [earlierReply, 14, 'd23'],
      [discuss, 14, 'd23'],
      [discuss, 15, 'd23'],
    ]),
  ).toEqual([
    ['Still open', null],
    ['Discussing…', 'Still open'],
    ['✓ Discussed', null],
  ])
})

test('a row deselected while its press is under way keeps its held line for when it is selected again', () => {
  expect(
    heldAcross([
      [earlierReply, 14, 'd23'],
      [discuss, 14, 'd22'],
      [discuss, 14, 'd23'],
    ]),
  ).toEqual([
    ['Still open', null],
    ['Discussing…', null],
    ['Discussing…', 'Still open'],
  ])
})

test('a held failure keeps its space without its words, also once the press ends with its status under the buttons', () => {
  const failed: LastAction = {
    ...discuss,
    at: NOW - 600_000,
    turnsStarted: 13,
    delivery: { state: 'failed', reason: 'the terminal was closed' },
  }
  const queued: LastAction = { ...discuss, delivery: { state: 'queued', message: 'Discuss' } }
  const unconfirmed: LastAction = { ...discuss, delivery: { state: 'unconfirmed', message: 'Discuss' } }
  expect(
    heldAcross([
      [failed, 14, 'd23'],
      [queued, 14, 'd23'],
      [unconfirmed, 14, 'd23'],
    ]),
  ).toEqual([
    ['Not sent: the terminal was closed', null],
    ['Queued: Discuss', 'hidden Not sent: the terminal was closed'],
    ['Not confirmed: Discuss', 'hidden Not sent: the terminal was closed'],
  ])
})

test('a row with no line above its buttons keeps its press’s done status under them until it is closed', () => {
  expect(
    heldAcross([
      [null, 14, 'd23'],
      [discuss, 14, 'd23'],
      [discuss, 15, 'd23'],
      [discuss, 15, 'd22'],
      [discuss, 15, 'd23'],
    ]),
  ).toEqual([
    [null, null],
    ['Discussing…', null],
    ['under ✓ Discussed', null],
    ['✓ Discussed', null],
    ['✓ Discussed', null],
  ])
})

test('a held line that ends with its age keeps counting it', () => {
  const row = { ...rowsOf(tabBlocks(demoScreen(), uiOn('findings', { selected: 'd23' }))).find(r => r.isSelected)! }
  const aged = { lead: '✓ Replied', at: NOW - 120_000 }
  const done: RowBlock = {
    ...row,
    feedback: {
      text: agedText(aged, NOW),
      tone: 'muted',
      source: { is: 'done', label: '✓ Replied', at: aged.at },
      aged,
    },
  }
  const sending: RowBlock = {
    ...row,
    feedback: { text: 'Sending…', tone: 'muted', source: { is: 'sending', label: 'Sending…', at: NOW } },
  }
  const first = holdLinesAbove([done], NO_LINES_ABOVE, NOW)
  const later = holdLinesAbove([sending], first.held, NOW + 60_000)
  expect(rowsOf(later.blocks)[0]?.heldLine?.text).toBe(agedText(aged, NOW + 60_000))
  expect(agedText(aged, NOW + 60_000)).not.toBe(agedText(aged, NOW))
})
