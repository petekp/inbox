import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { parseStatus } from '../hooks/status'
import { applyStatus } from '../hooks/status-ops'
import { CLAUDE_CODE } from '../hooks/model-text'
import { emptySession, upgradeSession } from '../hooks/session-files'
import { startContext } from '../hooks/session-turns'
import {
  appliedCatchUp,
  forkedFrom,
  hasLedger,
  isUnseen,
  lookEndedOn,
  lookReportedOn,
  withLook,
} from '../hooks/session-status'
import { pruned } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import type { Item, Session, TaskNode } from '../types'
import { allRows } from '../hooks/rows'
import { NO_HOLDS } from '../hooks/timing'
import { prMarkId } from '../hooks/pr-rows'
import { demoSession, demoView, isDemoCopy } from '../hooks/demo'
import { demoTaskTree } from '../hooks/demo-timeline'
import { drawnState } from '../hooks/mod-sessions'
import { TOOL_FIELDS } from '../hooks/tool-schemas'
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
  const taskTree: TaskNode[] = statuses.map((status, n) => ({
    id: `s${n + 1}`,
    parentId: null,
    status,
    weight: 1,
    title: `Part ${n}`,
    detail: 'step',
    notes: [],
    createdAt: 1000,
    updatedAt: 1000,
    history: [],
  }))
  const opened = applyStatus(null, parseStatus(`LINK: ${ITEM.id} | s4`)!, 1000, asks, null, taskTree)!
  const held = { ...emptySession(), taskTree, ledger: { ...EMPTY, items: [ITEM], overview: opened } }
  const rows = sessionView(held, 3000, 1000, NO_HOLDS).statusPage.rows.flatMap(r =>
    r.kind === 'subject' ? [[r.name, r.mark, r.tone]] : [],
  )

  expect(rows).toEqual([
    ['Part 3', '◆', 'needsYou'],
    ['Part 0', '◐', null],
    ['Part 2', '◌', null],
    ['Part 1', '○', null],
  ])
  expect(allRows(sessionView(held, 3000, 1000, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBe(
    'Holds up Part 3',
  )
  const heldDone = {
    ...held,
    taskTree: taskTree.map(task => (task.id === 's4' ? { ...task, status: 'done' as const } : task)),
  }
  expect(allRows(sessionView(heldDone, 3000, 1000, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBeNull()
})

test('one ask linked to two subjects marks both ◆, and its Asks row names each open one', () => {
  const asks = new Set([ITEM.id])
  const tree: TaskNode[] = [
    {
      id: 's1',
      parentId: null,
      status: 'working',
      weight: 1,
      title: '2.4 release',
      detail: '',
      notes: [],
      createdAt: 1000,
      updatedAt: 1000,
      history: [],
    },
    {
      id: 's2',
      parentId: null,
      status: 'working',
      weight: 1,
      title: 'Hotfix release',
      detail: '',
      notes: [],
      createdAt: 1000,
      updatedAt: 1000,
      history: [],
    },
  ]
  const linked = applyStatus(
    null,
    parseStatus(`LINK: ${ITEM.id} | s1\nLINK: ${ITEM.id} | s2`)!,
    1000,
    asks,
    null,
    tree,
  )!
  const sessionOf = (overview: typeof linked, taskTree = tree) => ({
    ...emptySession(),
    taskTree,
    ledger: { ...EMPTY, items: [ITEM], overview },
  })
  const view = sessionView(sessionOf(linked), 3000, 1000, NO_HOLDS)
  const oneDone = sessionView(
    sessionOf(
      linked,
      tree.map(task => (task.id === 's1' ? { ...task, status: 'done' as const } : task)),
    ),
    3000,
    1000,
    NO_HOLDS,
  )

  expect(view.statusPage.rows.flatMap(r => (r.kind === 'subject' ? [[r.name, r.mark]] : []))).toEqual([
    ['2.4 release', '◆'],
    ['Hotfix release', '◆'],
  ])
  expect(allRows(view).find(r => r.id === ITEM.id)?.holdsUpLine).toBe('Holds up 2.4 release, Hotfix release')
  expect(allRows(oneDone).find(r => r.id === ITEM.id)?.holdsUpLine).toBe('Holds up Hotfix release')
})

test('task freshness keeps the prior seen time for rows missed in a look, including after a save and a late Herdr report', () => {
  const taskTree: TaskNode[] = ['s1', 's2'].map(id => ({
    id,
    parentId: null,
    status: 'done',
    weight: 1,
    title: id,
    detail: '',
    notes: [],
    createdAt: 900,
    updatedAt: 900,
    history: [],
  }))
  const overview = applyStatus(null, parseStatus('HEAD: Focus | Current work')!, 900, new Set())!
  const session = {
    ...emptySession(),
    taskTree,
    ledger: { ...EMPTY, overview: { ...overview, lastLookAt: 800 } },
  }
  const started = withLook(session, true, 1000, {})
  const ended = lookEndedOn(started, 6000, { s1: 6000 })
  expect(ended.ledger.overview?.missedInLastLook).toMatchObject({ s2: 800 })
  expect(upgradeSession(ended).ledger.overview?.missedInLastLook).toMatchObject({ s2: 800 })

  const late = lookReportedOn(
    {
      ...session,
      ledger: {
        ...session.ledger,
        overview: { ...overview, lastLookAt: 6000, missedInLastLook: { s2: null } },
      },
    },
    { startedAt: 0, endedAt: 5500, shown: { s2: 5000 } },
  )
  expect(late.ledger.overview?.missedInLastLook.s2).toBe(5500)
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

test('a session saved before sessions kept their tool fields, or with fields that are not lists of names, loads knowing none of them, and one saved with them keeps them', () => {
  const saved = (toolFields: unknown) => upgradeSession({ ...emptySession(), toolFields } as never).toolFields

  expect(upgradeSession({}).toolFields).toBeNull()
  expect(saved({ record: 'kind,ask', close: [], order_prs: [], tasks: [] })).toBeNull()
  expect(saved({ record: [1], close: [], order_prs: [], tasks: [] })).toBeNull()
  expect(saved({ record: ['kind'], close: [] })).toBeNull()
  expect(saved({ record: [], close: [], order_prs: [], tasks: 'operation' })).toBeNull()
  expect(saved({ record: ['kind'], close: [], order_prs: [] })).toMatchObject({ tasks: [] })
  expect(saved(TOOL_FIELDS)).toEqual(TOOL_FIELDS)
})

test('a sample saved without a Status is replaced, and the sample session carries its own', () => {
  const old = demoView(1_000_000, 'Claude')

  expect(isDemoCopy(old)).toBe(true)
  expect(isDemoCopy({ ...old, timelineTaskTree: undefined })).toBe(false)
  expect(isDemoCopy({ ...old, presence: { isTurnRunning: false } })).toBe(true)
  expect(isDemoCopy({ ...old, ledger: { ...old.ledger, overview: undefined } })).toBe(false)
  const page = sessionView(demoSession(1_000_000, 'Claude'), 1_000_000, 1000, NO_HOLDS).statusPage
  expect(page.head?.title).toBe('Pinch to dismiss')
  expect(page.goal?.milestones).toEqual([])
  expect(page.rows.flatMap(r => (r.kind === 'subject' ? [r.id] : []))).toEqual(['s2', 'm3', 'm2', 's5'])
})

test('the Timeline demo tree has neutral English and Japanese task titles', () => {
  const now = 1_000_000
  const titles = demoTaskTree(now).map(task => task.title)
  expect(titles).toContain('Ship the image review flow')
  expect(titles).toContain('選択位置を保存する')

  const drawn = drawnState(emptySession(), {}, demoView(now, 'Claude'), false, null, 'demo', now, NO_HOLDS, 1000)
  expect(drawn.view.timeline.rows.map(row => row.task.title)).toContain('選択位置を保存する')
})

test('a conversation start carries the head and where each open subject stands, not on a resume the guidance, and nothing for an empty session', () => {
  const described = emptySession()
  const ledger = { ...described.ledger, overview: applyStatus(null, answer, 1000, new Set()) }
  const carried = startContext(CLAUDE_CODE, { ...described, ledger }, 'resume')
  expect(carried).toContain('Working on: Work offline: Letting the app work without a connection')
  expect(carried).not.toContain('Offline mode')
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

test('a session write keeps every closed ask and finding and prunes only unneeded PR views', () => {
  const tasks = Array.from({ length: 14 }, (_, n) => `NEW: do | - | Task ${n} | - | -`).join('\n')
  const opened = applyUpdate(EMPTY, parseReply(tasks)!, 10, 1)
  const ids = opened.items.map(i => i.id)
  const closes = (some: string[]) => parseReply(some.map(id => `CLOSED: ${id} | done`).join('\n'))!
  const ledger = applyUpdate(applyUpdate(opened, closes(ids.slice(0, 2)), 20, 2), closes(ids.slice(2)), 50, 3)
  const demo = demoView(0, 'Claude')
  const [ref, linked] = Object.keys(demo.prViews.views) as [string, string]
  const closedFindings = Array.from({ length: 14 }, (_, n) => ({
    id: `f${n + 1}`,
    kind: 'issue' as const,
    title: `Problem ${n + 1}`,
    detail: '',
    path: null,
    at: n + 1,
    how: 'expired' as const,
    outcome: 'list full',
    closedAt: n + 1,
  }))
  const s = {
    ...emptySession(),
    ledger: { ...ledger, closedFindings, prs: [linked] },
    prViews: { ...demo.prViews, branchRef: null },
    lastActions: { [prMarkId(ref)]: { kind: 'mark' as const, action: 'pr-dismiss', text: 'Dismissed', at: 30 } },
  }
  const closedIds = (x: Session) => x.ledger.closed.map(c => c.id)
  const closedFindingIds = (x: Session) => x.ledger.closedFindings.map(c => c.id)

  const shownEarly = pruned({ ...s, shownSince: 20 })
  expect(closedIds(shownEarly)).toEqual(ids)
  expect(closedFindingIds(shownEarly)).toEqual(closedFindings.map(f => f.id))
  expect(Object.keys(shownEarly.prViews.views).sort()).toEqual([ref, linked].sort())
  expect(closedIds(pruned({ ...s, shownSince: 50, heldRows: [ids[0]!] }))).toEqual(ids)
  const left = pruned({ ...s, shownSince: null })
  expect(closedIds(left)).toEqual(ids)
  expect(closedFindingIds(left)).toEqual(closedFindings.map(f => f.id))
  expect(Object.keys(left.prViews.views)).toEqual([linked])
})
