import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { emptySession } from '../hooks/session-files'
import { statusListRows } from '../hooks/status-folds'
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

function ask(id: string, text: string): Item {
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
      askSubjects: { i1: ['s2'] },
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
    readSetAt: scene.step.call ? (scene.before.goal?.setAt ?? null) : null,
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
    source: 'inferred',
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

/** The same inferred goal before the step and after it, with its work open. */
function withGoalBefore(s: Scene) {
  withGoal(s)
  s.before = { ...s.before, goal: s.after.goal, milestones: s.after.milestones, serves: s.after.serves }
}

/** An inferred goal before the step and still after it, which the facts say the work has left. */
function withLeftGoal(s: Scene) {
  withGoalBefore(s)
  s.facts.goal = { ...s.facts.goal!, milestones: [], isLeft: true }
}

/** A typed goal before the step, with its work open, and none after it. */
function withTypedGoalBefore(s: Scene) {
  withGoal(s)
  s.before = {
    ...s.before,
    goal: { ...s.after.goal!, source: 'typed' },
    milestones: s.after.milestones,
    serves: s.after.serves,
  }
  s.after.goal = null
}

/** The engine's child is a delegate that finished, and the engine still works, with `text` as where it stands. */
function childFinished(s: Scene, text: string) {
  s.after.children[0] = { ...s.after.children[0]!, kind: 'delegate', endedAt: minutes(8), delegateState: 'finished' }
  s.after.subjects[0]!.text = text
  s.facts.pieces[0]!.left = '\\bmerg(e|ing)\\b'
}

/** A second child of the engine, a subagent that still runs. */
function secondChildRunning(s: Scene) {
  const running = { id: 'c2', ref: 'toolu_b', kind: 'subagent', endedAt: null, delegateState: null } as const
  s.after.children.push({ ...s.after.children[0]!, ...running })
}

const CLEAR = { text: 'Get offline sync into both stores', match: 'offline sync' }

const s1Of = (s: Scene) => s.after.subjects[0]!
const s2Of = (s: Scene) => s.after.subjects[1]!

export const SCENES: Record<string, { bad: (s: Scene) => void; good?: (s: Scene) => void }> = {
  'no-time-words': { bad: s => (s1Of(s).text = 'synced 5m ago') },
  'short-names': { bad: s => (s1Of(s).name = 'The offline sync engine work') },
  'text-no-ids': { bad: s => (s1Of(s).text = 'retries in sync-queue.ts') },
  'no-semicolons': { bad: s => (s1Of(s).text = 'engine done; retries left') },
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
  'asks-linked': { bad: s => (s.after.askSubjects = { i1: ['s1'] }) },
  'ask-holds-several': { bad: s => (s.facts.asks[0]!.holdsUp = ['conflicts', 'engine']) },
  'children-linked': { bad: s => (s.after.children[0]!.subjectId = 's2') },
  'child-labels': { bad: s => (s.after.children[0]!.name = 'pdfx2') },
  'step-left-named': {
    good: s => childFinished(s, 'syncs, merge left'),
    bad: s => childFinished(s, 'syncs on reconnect'),
  },
  'no-news-no-move': { bad: s => (s.facts.changed = []) },
  'changes-move': { bad: s => (s1Of(s).changedAt = minutes(0)) },
  'was-on-reversal': { bad: s => (s.step.facts = { pieces: [{ id: 'conflicts', was: 'manual merge' }] }) },
  'was-not-cut': { bad: s => (s2Of(s).was = 'Show the banner on hover and keep…') },
  'failure-shown': { bad: s => (s.isStatusFailed = true) },
  'head-title': { bad: s => (s.after.head = { title: 'Offline sync', description: 'offline sync' }) },
  'answer-readable': {
    good: s => (s.calls = [statusCall('SET: s1 | working | syncs on reconnect')]),
    bad: s => (s.calls = [statusCall('The engine now syncs on reconnect.')]),
  },
  'goal-kept': {
    good: withGoalBefore,
    bad: s => {
      withGoalBefore(s)
      s.after.goal = null
      s.after.milestones = []
      s.after.serves = {}
    },
  },
  'goal-left': {
    good: s => {
      withLeftGoal(s)
      s.after.goal = null
      s.after.milestones = []
      s.after.serves = {}
    },
    bad: withLeftGoal,
  },
  'goal-only-when-clear': { bad: withGoal },
  'goal-when-clear': {
    good: s => {
      s.facts.goalClear = CLEAR
      withGoal(s)
    },
    bad: s => (s.facts.goalClear = CLEAR),
  },
  'goal-suggested': {
    good: s => {
      s.facts.goalSuggested = CLEAR
      s.after = { ...s.after, suggestedGoal: 'Offline sync in both stores' }
    },
    bad: s => (s.facts.goalSuggested = CLEAR),
  },
  'milestones-true': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.milestones[1]!.status = 'done'
    },
  },
  'milestones-shape': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.milestones[1]!.name = 'Sync conflicts'
    },
  },
  'milestone-size': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      const extra = Array.from({ length: 7 }, (_, n) =>
        subject(`x${n}`, n < 5 ? 'done' : 'working', `Fix ${n}`, 'merged', 0),
      )
      s.after.subjects = [...s.after.subjects, ...extra]
      s.after.serves = { ...s.after.serves, ...Object.fromEntries(extra.map(x => [x.id, 'm1'])) }
      s.before = {
        ...s.before,
        goal: s.after.goal,
        milestones: s.after.milestones,
        serves: s.after.serves,
        subjects: s.after.subjects,
      }
    },
  },
  'milestone-next': {
    good: s => {
      withGoal(s)
      s.facts.goal!.next = 'resolved'
    },
    bad: s => {
      withGoal(s)
      s.facts.goal!.next = 'resolved'
      s.after.milestones[1]!.status = 'working'
    },
  },
  'serves-linked': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.serves = { s2: 'm2' }
    },
  },
  'typed-goal-kept': {
    good: s => {
      withTypedGoalBefore(s)
      s.step.events = [{ press: 'type', text: 'Sync in the web app' }]
    },
    bad: withTypedGoalBefore,
  },
  'goal-not-repeated': {
    good: withGoal,
    bad: s => {
      withGoal(s)
      s.after.removedGoals = [nameKey(s.after.goal!.text)]
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
  'other-work-place': {
    good: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
    },
    bad: s => {
      withGoal(s)
      s.after.serves.s1 = 'none'
      s.page = p => {
        const s2 = statusListRows(p).find(r => r.kind === 'subject' && r.id === 's2')!
        p.rows.push({ ...s2, depth: 0 })
      }
    },
  },
  'finished-named': {
    good: s => {
      s.after.subjects.push(
        subject('s3', 'done', 'Login timeout', 'fixed', 8),
        subject('s4', 'done', 'Crash on launch', 'fixed', 9),
        subject('s5', 'done', 'Backup restore', 'works', 10),
        subject('s6', 'dropped', 'Offline banner', 'not needed', 7),
        subject('s7', 'done', 'Sync merge', 'merges', 11),
        subject('s8', 'done', 'Search speed', 'faster', 12),
      )
    },
    bad: s => {
      s.after.subjects.push(
        subject('s3', 'done', 'Login timeout', 'fixed', 8),
        subject('s4', 'done', 'Crash on launch', 'fixed', 9),
        subject('s5', 'done', 'Backup restore', 'works', 10),
        subject('s6', 'dropped', 'Offline banner', 'not needed', 7),
        subject('s7', 'done', 'Sync merge', 'merges', 11),
        subject('s8', 'done', 'Search speed', 'faster', 12),
      )
      s.page = p => (p.rows = p.rows.filter(r => !(r.kind === 'fold' && r.id === 'also-dropped')))
    },
  },
  'no-number-names': {
    bad: s => {
      s1Of(s).name = 'PR 3655'
    },
  },
}

function milestoneOnly(s: Scene) {
  withGoal(s)
  s.after.subjects.pop()
  delete s.after.serves.s2
  s.after.askSubjects = { i1: ['m2'] }
}

function oneMilestoneForBoth(s: Scene, survive: 'working' | 'done', status: SubjectStatus) {
  withGoal(s)
  s.after.milestones = [{ ...s.after.milestones[0]!, name: 'Offline sync built', status }]
  s.after.serves = { s1: 'm1', s2: 'm1' }
  s.facts.goal!.milestones[0]!.state = survive
}

function renamedMilestone(s: Scene, status: SubjectStatus) {
  withGoal(s)
  s.after.milestones[0] = { ...s.after.milestones[0]!, name: 'Offline editing works', status }
}

function milestoneChanged(s: Scene, at: number) {
  milestoneOnly(s)
  s.facts.changed = ['conflicts']
  s.after.milestones[1]!.changedAt = minutes(at)
}

function linkedToMilestones(s: Scene, holdsUp: string[], ids: string[]) {
  withGoal(s)
  s.facts.asks[0]!.holdsUp = holdsUp
  s.after.askSubjects = ids.length > 0 ? { i1: ids } : {}
}

export const PATH_SCENES: { rule: string; path: string; good: (s: Scene) => void; bad: (s: Scene) => void }[] = [
  {
    rule: 'open-pieces-kept',
    path: 'a queued piece that is the only one serving its milestone',
    good: milestoneOnly,
    bad: s => {
      milestoneOnly(s)
      s.facts.pieces[0]!.servesAlso = 'resolved'
    },
  },
  {
    rule: 'open-pieces-kept',
    path: 'a queued piece whose milestone is closed',
    good: milestoneOnly,
    bad: s => {
      milestoneOnly(s)
      s.after.milestones[1]!.status = 'done'
    },
  },
  {
    rule: 'asks-linked',
    path: 'a link to the milestone a held piece is the whole of',
    good: milestoneOnly,
    bad: s => {
      milestoneOnly(s)
      s.after.askSubjects = { i1: ['m1'] }
    },
  },
  {
    rule: 'asks-linked',
    path: 'a link to a milestone a held piece also serves',
    good: s => {
      linkedToMilestones(s, ['conflicts'], ['s2', 'm1'])
      s.facts.pieces[1]!.servesAlso = 'survive'
    },
    bad: s => linkedToMilestones(s, ['conflicts'], ['s2', 'm1']),
  },
  {
    rule: 'asks-linked',
    path: 'an ask that holds up nothing',
    good: s => linkedToMilestones(s, [], []),
    bad: s => linkedToMilestones(s, [], ['m1']),
  },
  {
    rule: 'milestones-true',
    path: 'a milestone named its own way, found by the subject it holds',
    good: s => renamedMilestone(s, 'working'),
    bad: s => renamedMilestone(s, 'queued'),
  },
  {
    rule: 'milestones-true',
    path: 'one milestone for a working and a queued milestone',
    good: s => oneMilestoneForBoth(s, 'working', 'working'),
    bad: s => oneMilestoneForBoth(s, 'working', 'queued'),
  },
  {
    rule: 'milestones-true',
    path: 'one milestone for a done and a queued milestone',
    good: s => oneMilestoneForBoth(s, 'done', 'queued'),
    bad: s => oneMilestoneForBoth(s, 'done', 'done'),
  },
  {
    rule: 'step-left-named',
    path: 'a subject with one child finished and one still running',
    good: s => {
      childFinished(s, 'syncs on reconnect')
      secondChildRunning(s)
    },
    bad: s => childFinished(s, 'syncs on reconnect'),
  },
  {
    rule: 'step-left-named',
    path: 'a subject an open ask holds up',
    good: s => {
      childFinished(s, 'syncs on reconnect')
      s.after.askSubjects = { i1: ['s1'] }
    },
    bad: s => childFinished(s, 'syncs on reconnect'),
  },
  {
    rule: 'changes-move',
    path: 'a changed piece drawn as its milestone',
    good: s => milestoneChanged(s, 10),
    bad: s => milestoneChanged(s, 0),
  },
]
