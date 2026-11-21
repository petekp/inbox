import { EMPTY_SESSION_STATUS } from '../core/domain/status-limits'
import { emptySession } from '../core/view/session-files'
import { statusPage } from '../core/view/status-page'
import type { StatusPage } from '../core/view/status-page'
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
