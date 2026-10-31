import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { parseStatus } from '../hooks/status'
import { applyStatus } from '../hooks/status-ops'
import { CLAUDE_CODE } from '../hooks/model-text'
import {
  appliedCatchUp,
  emptySession,
  forkedFrom,
  hasLedger,
  isUnseen,
  pruned,
  sessionView,
  startContext,
  upgradeSession,
} from '../hooks/session'
import type { Session } from '../hooks/session'
import type { Item } from '../types'
import { allRows, NO_HOLDS } from '../hooks/view'
import { prMarkId } from '../hooks/pr-rows'
import { demoSession, demoView, isDemoCopy } from '../hooks/demo'
import { answer } from './session-helpers'

const ITEM: Item = {
  id: 'i1',
  kind: 'question',
  label: null,
  ask: 'Use Node or Python?',
  options: ['Node', 'Python'],
  rec: 'Node',
  helps: [],
  turn: 1,
  at: null,
  from: 'record',
}

test('the Status page draws each status with its mark and tone, and ◆ on a subject an open ask holds up, whose Asks row names it until the subject closes', () => {
  const statuses = ['working', 'queued', 'waits-on-other', 'queued'] as const
  const asks = new Set([ITEM.id])
  const opened = applyStatus(
    null,
    parseStatus([...statuses.map((st, n) => `NEW: ${st} | Part ${n} | step`), `LINK: ${ITEM.id} | s4`].join('\n'))!,
    1000,
    asks,
  )
  const closed = applyStatus(opened, parseStatus('DONE: s1 | built')!, 2000, asks)
  const held = { ...emptySession(), ledger: { ...EMPTY, items: [ITEM], overview: closed } }
  const rows = sessionView(held, 3000, 1000, true, NO_HOLDS).statusPage.rows.flatMap(r =>
    r.kind === 'subject' ? [[r.name, r.mark, r.tone]] : [],
  )

  expect(rows).toEqual([
    ['Part 3', '◆', 'needsYou'],
    ['Part 2', '◌', null],
    ['Part 1', '○', null],
    ['Part 0', '✓', 'done'],
  ])
  expect(allRows(sessionView(held, 3000, 1000, true, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBe(
    'Holds up Part 3',
  )
  const heldDone = {
    ...held,
    ledger: { ...held.ledger, overview: applyStatus(closed, parseStatus('DONE: s4 | built')!, 2500, asks) },
  }
  expect(allRows(sessionView(heldDone, 3000, 1000, true, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBeNull()
})

test('a session saved by the Progress trial build loads without its results, subagents and stated step', () => {
  const saved = {
    ...emptySession(),
    overviewFailure: undefined,
    ledger: { ...EMPTY, milestones: [{ id: 'm1', source: 'done', text: 'Reducer built' }] },
    subagents: [{ id: 'a1', task: 'Find the handler' }],
    presence: { turnsStarted: 2, isTurnRunning: true, statedStep: 'Reading x' },
  } as never
  const loaded = upgradeSession(saved) as unknown as Record<string, unknown>

  expect(loaded).not.toHaveProperty('subagents')
  expect(loaded.ledger).not.toHaveProperty('milestones')
  expect(loaded.presence).not.toHaveProperty('statedStep')
  expect(loaded.presence).toMatchObject({ turnsStarted: 2, isTurnRunning: true })
  expect(loaded.overviewFailure).toBeNull()
})

test('a sample saved without a Status is replaced, and the sample session carries its own', () => {
  const old = demoView(1_000_000, 'Claude')

  expect(isDemoCopy(old)).toBe(true)
  expect(isDemoCopy({ ...old, presence: { isTurnRunning: false } })).toBe(true)
  expect(isDemoCopy({ ...old, ledger: { ...old.ledger, overview: undefined } })).toBe(false)
  const page = sessionView(demoSession(1_000_000, 'Claude'), 1_000_000, 1000, true, NO_HOLDS).statusPage
  expect(page.head?.title).toBe('Pinch to dismiss')
  expect(page.rows.map(r => r.kind)).toEqual([
    'subject',
    'child',
    'child',
    'subject',
    'subject',
    'child',
    'child',
    'child',
    'subject',
    'look',
    'subject',
    'fold',
  ])
})

test('a conversation start carries the head and where each open subject stands, not on a resume the guidance, and nothing for an empty session', () => {
  const described = emptySession()
  const ledger = { ...described.ledger, overview: applyStatus(null, answer, 1000, new Set()) }
  const carried = startContext(CLAUDE_CODE, { ...described, ledger }, 'resume')
  expect(carried).toContain('Working on: Work offline: Letting the app work without a connection')
  expect(carried).toContain('- Offline mode: queue built (working)')
  expect(startContext(CLAUDE_CODE, { ...described, ledger }, 'startup')).toContain('Working on: Work offline')
  expect(startContext(CLAUDE_CODE, described, 'resume')).toBeNull()
})

test('an applied model answer that changes nothing still makes the session seen, and a fork takes the parent task list', () => {
  const begun = { ...emptySession(), presence: { ...emptySession().presence, turnsStarted: 1 } }
  const prompted = { ...begun, ledger: { ...begun.ledger, turn: 1 } }
  expect(hasLedger(prompted)).toBe(false)
  const none = appliedCatchUp(prompted, prompted, parseReply('NONE'), 5)
  expect(hasLedger(none)).toBe(true)
  expect(isUnseen(none)).toBe(false)

  const parent = { ...none, hostTasks: [{ id: '1', text: 'Fix it', status: 'pending' as const }] }
  expect(forkedFrom(emptySession(), parent).hostTasks).toEqual(parent.hostTasks)
})

test('a prune keeps the closed records of held rows and of rows closed since the showing began, a linked PR’s view, and a dismissed PR’s view only while the showing that dismissed it lasts', () => {
  const tasks = Array.from({ length: 14 }, (_, n) => `NEW: do | - | Task ${n} | - | -`).join('\n')
  const opened = applyUpdate(EMPTY, parseReply(tasks)!, 10, 1)
  const ids = opened.items.map(i => i.id)
  const closes = (some: string[]) => parseReply(some.map(id => `CLOSED: ${id} | done`).join('\n'))!
  const ledger = applyUpdate(applyUpdate(opened, closes(ids.slice(0, 2)), 20, 2), closes(ids.slice(2)), 50, 3)
  const demo = demoView(0, 'Claude')
  const [ref, linked] = Object.keys(demo.prViews.views) as [string, string]
  const s = {
    ...emptySession(),
    ledger: { ...ledger, prs: [linked] },
    prViews: { ...demo.prViews, branchRef: null },
    lastActions: { [prMarkId(ref)]: { kind: 'mark' as const, action: 'pr-dismiss', text: 'Dismissed', at: 30 } },
  }
  const closedIds = (x: Session) => x.ledger.closed.map(c => c.id)

  const shownEarly = pruned({ ...s, shownSince: 20 })
  expect(closedIds(shownEarly)).toEqual(ids)
  expect(Object.keys(shownEarly.prViews.views).sort()).toEqual([ref, linked].sort())
  expect(closedIds(pruned({ ...s, shownSince: 50, heldRows: [ids[0]!] }))).toEqual([ids[0], ...ids.slice(2)])
  const left = pruned({ ...s, shownSince: null })
  expect(closedIds(left)).toEqual(ids.slice(2))
  expect(Object.keys(left.prViews.views)).toEqual([linked])
})
