import { expect, test } from 'bun:test'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { NO_HOLDS, SETTLED_MS } from '../../core/view/timing'
import type { LastAction } from '../../types'
import { agedText } from '../src/blocks'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import type { LookUi } from '../src/draw'
import { NO_LINES_ABOVE, holdLinesAbove } from '../src/held-line'
import type { LinesAbove } from '../src/held-line'
import { AGENT, NOW, demoScreen, dismissedSession, uiOn } from './fixtures'

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

const earlierReply: LastAction = {
  kind: 'handoff',
  action: 'type',
  text: 'Send',
  reply: 'Not yet',
  at: NOW - 600_000,
  turnsStarted: 13,
}
const discuss: LastAction = { kind: 'talk', action: 'discuss', text: 'Discuss', at: NOW - 1000, turnsStarted: 14 }

function heldAcross(draws: [LastAction | null, number, string, number?][]) {
  const session = demoSession(NOW, AGENT)
  const { d23: _, ...others } = session.lastActions
  let held = NO_LINES_ABOVE
  return draws.map(([last, applied, selected, at = NOW]) => {
    const s = {
      ...session,
      lastActions: last ? { ...others, d23: last } : others,
      presence: { ...session.presence, turnsStarted: 14, turnsApplied: applied },
    }
    const screen = { ...demoScreen(), view: sessionView(s, NOW, SETTLED_MS, NO_HOLDS) }
    const drawn = holdLinesAbove(tabBlocks(screen, uiOn('findings', { selected })), held, at)
    held = drawn.held
    const row = rowsOf(drawn.blocks).find(b => b.id === 'd23')!
    const line = row.heldLine
    const status = row.feedback ? `${row.isStatusHeldUnder ? 'under ' : ''}${row.feedback.text}` : null
    const form = `${line?.leftAt === undefined ? '' : 'leaving '}${line?.isHidden ? 'hidden ' : ''}`
    return [status, line ? `${form}${line.text}` : null]
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

test('a held failure keeps its space without its words while the press is under way, then lets its space close', () => {
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
      [discuss, 14, 'd23'],
      [queued, 14, 'd23'],
      [unconfirmed, 14, 'd23'],
      [unconfirmed, 14, 'd23', NOW + 1000],
    ]),
  ).toEqual([
    ['Not sent: the terminal was closed', null],
    ['Discussing…', 'hidden Not sent: the terminal was closed'],
    ['Queued: Discuss', 'leaving hidden Not sent: the terminal was closed'],
    ['Not confirmed: Discuss', 'leaving hidden Not sent: the terminal was closed'],
    ['Not confirmed: Discuss', null],
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

test('a row that settles holds nothing from its open form, so its Undo sits under its settled line', () => {
  const drawn = (session: ReturnType<typeof demoSession>, ui: LookUi, held: LinesAbove) => {
    const s = {
      ...session,
      lastActions: { ...session.lastActions, d13: earlierReply },
      presence: { ...session.presence, turnsStarted: 14, turnsApplied: 14 },
    }
    const view = sessionView(s, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - 1000 })
    const shown = holdLinesAbove(tabBlocks({ ...demoScreen(), view, shownSince: NOW - 1000 }, ui), held, NOW)

    return { row: rowsOf(shown.blocks).find(r => r.id === 'd13'), held: shown.held }
  }
  const open = drawn(demoSession(NOW, AGENT), uiOn('needsYou', { selected: 'd13' }), NO_LINES_ABOVE)
  const { row } = drawn(dismissedSession('d13', NOW - 500), uiOn('needsYou'), open.held)

  expect(open.row?.feedback?.text).toBe('Still open')
  expect(row?.settled).not.toBeNull()
  expect(row?.buttons.map(b => b.label)).toEqual(['Undo'])
  expect(row?.heldLine).toBeUndefined()
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
