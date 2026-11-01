import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { emptySession } from '../hooks/session-files'
import { statusPage } from '../hooks/status-page'
import type { StatusPage } from '../hooks/status-page'
import { HELD_MARK } from '../hooks/help'
import { nameKey } from '../hooks/status-limits'
import type { Item, Session, SessionStatus, Subject, SubjectStatus } from '../types'
import type { Facts } from '../evals/status-facts'
import { minutes } from '../evals/status-replay'
import type { CallLog, Step, StepResult } from '../evals/status-replay'
import type { RuleContext } from '../evals/status-rules'

export function subject(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Subject {
  const isClosed = status === 'done' || status === 'dropped'
  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: minutes(0),
    changedAt: minutes(changedAt),
    closedAt: isClosed ? minutes(changedAt) : null,
    into: null,
  }
}

export function statusOf(subjects: Subject[], more: Partial<SessionStatus> = {}): SessionStatus {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }
  return { ...EMPTY_SESSION_STATUS, head, subjects, nextId: subjects.length + 1, ...more }
}

export function sessionOf(o: SessionStatus, items: Item[], at: number): Session {
  const base = emptySession()
  return {
    ...base,
    ledger: { ...base.ledger, overview: o, items },
    presence: { ...base.presence, lastReplyAt: minutes(at) },
  }
}

export function ask(id: string, text: string): Item {
  return {
    id,
    kind: 'question',
    label: null,
    ask: text,
    options: [],
    rec: null,
    helps: [],
    turn: 1,
    at: 0,
    from: 'record',
  }
}

export type Scene = {
  before: SessionStatus
  after: SessionStatus
  items: Item[]
  facts: Facts
  step: Step
  isStatusFailed: boolean
  calls?: CallLog[]
  /** Breaks the drawn page, for a code hold the page code itself would never break. */
  page?: (p: StatusPage) => void
}

export function baseScene(): Scene {
  const before = statusOf([
    subject('s1', 'working', 'Sync engine', 'queues edits offline', 0),
    subject('s2', 'queued', 'Sync conflicts', 'not started', 0),
  ])
  const after = statusOf(
    [
      subject('s1', 'working', 'Sync engine', 'syncs on reconnect', 10),
      subject('s2', 'queued', 'Sync conflicts', 'not started', 0),
    ],
    {
      askSubjects: { i1: 's2' },
      nextChildId: 2,
      children: [
        {
          id: 'c1',
          ref: 'toolu_a',
          kind: 'subagent',
          name: 'Review the sync engine diff',
          subjectId: 's1',
          startedAt: minutes(5),
          endedAt: null,
          lastActivityAt: minutes(9),
          delegateState: null,
        },
      ],
    },
  )
  const facts: Facts = {
    focus: 'adding offline sync',
    focusMatch: 'offline|sync',
    pieces: [
      { id: 'engine', names: ['Sync engine'], match: 'engine', state: 'working', stands: 'syncs on reconnect' },
      { id: 'conflicts', names: ['Sync conflicts'], match: 'conflict', state: 'queued', stands: 'not started' },
    ],
    asks: [{ match: 'manual merge', text: 'Last-write-wins or manual merge?', holdsUp: ['conflicts'] }],
    notWork: [],
    children: [{ ref: 'toolu_a', does: 'Review the sync engine diff', serves: 'engine' }],
    changed: ['engine'],
  }
  const step: Step = {
    label: 'the engine works',
    at: 10,
    call: { kind: 'reply', person: null, activity: [], reply: '' },
  }

  return { before, after, items: [ask('i1', 'Last-write-wins or manual merge?')], facts, step, isStatusFailed: false }
}

export function contextOf(scene: Scene): RuleContext {
  const session = sessionOf(scene.after, scene.items, 10)
  const page = statusPage(session, minutes(10))
  scene.page?.(page)
  const result: StepResult = {
    index: 0,
    label: scene.step.label,
    now: minutes(10),
    session,
    page,
    text: '',
    facts: scene.facts,
    calls: scene.calls ?? [],
    isStatusFailed: scene.isStatusFailed,
  }
  const beforeFacts = { ...scene.facts, changed: [] }

  return { step: scene.step, result, before: { overview: scene.before, facts: beforeFacts } }
}

function statusCall(answer: string): CallLog {
  return { kind: 'status', answers: [answer], model: null, ms: 0, outputTokens: null, overLimit: null }
}

function withGoal(s: Scene) {
  const milestone = (id: string, name: string, status: SubjectStatus) => ({
    id,
    name,
    status,
    text: 'under way',
    was: null,
    changedAt: minutes(0),
    closedAt: null,
  })
  s.after.goal = {
    text: 'Offline sync in both stores',
    setAt: minutes(0),
    metAt: null,
    was: null,
    isAwaitingMilestones: false,
  }
  s.after.milestones = [
    milestone('m1', 'Edits survive offline', 'working'),
    milestone('m2', 'Conflicts resolved', 'queued'),
  ]
  s.after.serves = { s1: 'm1', s2: 'm2' }
  s.facts.goal = {
    text: 'Offline sync in both stores',
    match: 'offline sync',
    milestones: [
      { id: 'survive', name: 'Edits survive offline', match: 'survive', state: 'working' },
      { id: 'resolved', name: 'Conflicts resolved', match: 'conflict', state: 'queued' },
    ],
  }
  s.facts.pieces[0]!.serves = 'survive'
  s.facts.pieces[1]!.serves = 'resolved'
}

function withProposal(s: Scene, names: string[]) {
  s.after.proposedGoal = {
    text: 'Offline sync in both stores',
    milestones: names.map(name => ({ name, status: 'queued' as SubjectStatus })),
    at: minutes(10),
  }
}

const STATED = { text: 'Get offline sync into both stores', match: 'offline sync' }

const s1Of = (s: Scene) => s.after.subjects[0]!
const s2Of = (s: Scene) => s.after.subjects[1]!

export const SCENES: Record<string, { bad: (s: Scene) => void; good?: (s: Scene) => void }> = {
  'no-time-words': { bad: s => (s1Of(s).text = 'synced 5m ago') },
  'short-names': { bad: s => (s1Of(s).name = 'The offline sync engine work') },
  'text-no-ids': { bad: s => (s1Of(s).text = 'retries in sync-queue.ts') },
  'head-no-status': { bad: s => (s.after.head = { title: 'Offline sync', description: 'Offline sync ready' }) },
  'head-follows': { bad: s => (s.after.head = { title: 'Lint error', description: 'Fixing the lint error' }) },
  'no-duplicates': { bad: s => s.after.subjects.push(subject('s3', 'working', 'Sync engine work', 'tests', 10)) },
  'piece-once': { bad: s => s.after.subjects.push(subject('s3', 'working', 'Engine queue', 'syncs', 10)) },
  'open-pieces-kept': { bad: s => s.after.subjects.pop() },
  'marks-true': { bad: s => (s2Of(s).status = 'working') },
  'not-work': {
    bad: s => {
      s.facts.notWork.push({ kind: 'finding', text: 'The settings test is flaky', match: 'flaky' })
      s.after.subjects.push(subject('s3', 'queued', 'Flaky test', 'fails now and then', 10))
    },
  },
  'held-text': { bad: s => (s2Of(s).text = 'needs your decision') },
  'asks-linked': { bad: s => (s.after.askSubjects = { i1: 's1' }) },
  'ask-holds-several': { bad: s => (s.facts.asks[0]!.holdsUp = ['conflicts', 'engine']) },
  'children-linked': { bad: s => (s.after.children[0]!.subjectId = 's2') },
  'child-labels': { bad: s => (s.after.children[0]!.name = 'pdfx2') },
  'no-news-no-move': { bad: s => (s.facts.changed = []) },
  'changes-move': { bad: s => (s1Of(s).changedAt = minutes(0)) },
  'was-on-reversal': { bad: s => (s.step.facts = { pieces: [{ id: 'conflicts', was: 'manual merge' }] }) },
  'was-not-cut': { bad: s => (s2Of(s).was = 'Show the banner on hover and keep…') },
  'failure-shown': { bad: s => (s.isStatusFailed = true) },
  'head-title': { bad: s => (s.after.head = { title: 'Offline sync', description: 'offline sync' }) },
  'filed-mark': {
    good: s => {
      s.facts.pieces[1]!.state = 'filed'
      s2Of(s).status = 'filed' as SubjectStatus
    },
    bad: s => {
      s.facts.pieces[1]!.state = 'filed'
      s2Of(s).status = 'done'
    },
  },
  'answer-readable': {
    good: s => (s.calls = [statusCall('SET: s1 | working | syncs on reconnect')]),
    bad: s => (s.calls = [statusCall('The engine now syncs on reconnect.')]),
  },
  'proposal-only-when-stated': { bad: s => withProposal(s, ['Edits survive offline', 'Conflicts resolved']) },
  'proposal-when-stated': {
    good: s => {
      s.facts.goalStated = STATED
      withProposal(s, ['Edits survive offline', 'Conflicts resolved'])
    },
    bad: s => (s.facts.goalStated = STATED),
  },
  'milestones-true': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.milestones[1]!.status = 'done'
    },
  },
  'milestones-shape': { bad: s => withProposal(s, ['Edits survive offline']) },
  'serves-linked': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.serves = { s1: 'none', s2: 'm2' }
    },
  },
  'goal-on-press': {
    good: s => {
      withGoal(s)
      s.step.events = [{ press: 'use-goal' }]
    },
    bad: withGoal,
  },
  'proposal-not-repeated': {
    bad: s => {
      withProposal(s, ['Edits survive offline', 'Conflicts resolved'])
      s.after.declinedGoals = [nameKey(s.after.proposedGoal!.text)]
    },
  },
  'met-follows': {
    good: s => {
      withGoal(s)
      for (const m of s.after.milestones) m.status = 'done'
      s.after.goal!.metAt = minutes(10)
    },
    bad: s => {
      withGoal(s)
      for (const m of s.after.milestones) m.status = 'done'
    },
  },
  'held-milestone': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.page = p => (p.goal!.milestones[0]!.mark = HELD_MARK.mark)
    },
  },
  'other-work-shows-news': {
    good: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
    },
    bad: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
      s.page = p => (p.rows = p.rows.filter(r => !(r.kind === 'subject' && r.id === 's1')))
    },
  },
  'unlinked-in-main': {
    good: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
    },
    bad: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
      s.page = p => {
        const s2 = p.rows.find(r => r.kind === 'subject' && r.id === 's2')!
        p.rows.push({ ...s2 })
      }
    },
  },
  'finished-named': {
    bad: s => {
      s.after.subjects.push(
        subject('s3', 'done', 'Login timeout', 'fixed', 8),
        subject('s4', 'done', 'Crash on launch', 'fixed', 9),
        subject('s5', 'done', 'Backup restore', 'works', 10),
      )
    },
  },
}

export const GOOD_RUNS: Record<string, string[]> = {
  'coordinator-day': [
    'DONE: s1 | merges edits on reconnect',
    'DONE: s2 | live in both stores',
    [
      'HEAD: Vanishing notes | Fixing the archive bug, then shipping 2.5',
      'DONE: s6 | filed for later',
      'DONE: s7 | filed for later',
      'NEW: working | Vanishing notes | cause unknown',
      'NEW: queued | 2.5 release | after the bug fix',
      'LINK: c3 | Vanishing notes',
    ].join('\n'),
    'SET: s11 | working | cause found',
    'LINK: i2 | 2.5 release',
    'SET: s12 | queued | waits for the archive fix',
    'UNCHANGED',
    'UNCHANGED',
    'SET: s11 | working | fix in review\nLINK: c4 | Vanishing notes',
    'DONE: s11 | fixed\nSET: s12 | working | release candidate on the way\nHEAD: 2.5 release | Shipping 2.5 to both stores',
    'NEW: queued | Export folder | cause found',
    'DONE: s12 | live in both stores',
    'SET: s13 | working | setting moves to a file\nHEAD: Export folder | Fixing the export folder on Windows',
    'DONE: s13 | keeps the folder after an update\nSET: s5 | working | index rebuilds on each keystroke\nHEAD: Search speed | Speeding up note search',
    'SET: s5 | working | fast on large libraries',
  ],
  'single-task': [
    'NONE',
    [
      'HEAD: Offline sync | Adding offline sync to the notes app',
      'NEW: working | Sync engine | queues edits offline',
      'NEW: queued | Sync conflicts | not started',
      'NEW: queued | Sync toggle | not started',
    ].join('\n'),
    'NEW: decide | - | Last-write-wins or manual merge for conflicts? | Last-write-wins / Manual merge | -',
    'SET: s1 | working | syncs on reconnect\nLINK: c1 | Sync engine\nLINK: c2 | Sync engine\nLINK: i1 | Sync conflicts',
    'CLOSED: i1 | manual merge',
    'SET: s2 | working | manual merge under way',
    'NONE',
    'SET: s2 | working | last-write-wins with backup\nWAS: s2 | manual merge',
    'NONE',
    'SET: s2 | working | works on both test devices\nSET: s3 | queued | set aside\nNEW: working | Offline banner | first version',
    'NONE',
    'UNCHANGED',
    'NEW: decide | - | Should the offline banner show on web too? | Yes / No | -',
    'SET: s4 | working | shows on phones\nLINK: i2 | Offline banner',
    'CLOSED: i2 | the person dropped it',
    'DONE: s4 | shows on phones\nSET: s1 | working | Android syncs; iOS loses last edit',
    'NONE',
    'DONE: s1 | syncs after a crash on Android and iOS',
  ],
  'long-turn': [
    'DONE: s1 | fast on large libraries\nSET: s2 | working | under way',
    'UNCHANGED',
    'SET: s2 | working | sorts by last edit',
    'DONE: s2 | pinned first, then by last edit\nSET: s3 | working | short typos match',
  ],
  'catch-up-from-empty': [
    [
      'HEAD: Attachments | Attaching images and PDFs to notes',
      'NEW: working | Image attachments | show inline',
      'NEW: working | PDF attachments | attach as a file row',
      'DONE: Image attachments | show inline',
      'LINK: i1 | PDF attachments',
    ].join('\n'),
  ],
}
