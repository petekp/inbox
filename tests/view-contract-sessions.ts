import type { Child, Closed, LastAction, Session, Subject } from '../types'
import { demoSession } from '../hooks/demo'

const MIN = 60_000
const DAY = 24 * 60 * MIN

function subject(
  id: string,
  status: Subject['status'],
  name: string,
  text: string,
  at: number,
  more: Partial<Subject> = {},
): Subject {
  const isClosed = status === 'done' || status === 'dropped'

  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: at,
    changedAt: at,
    closedAt: isClosed ? at : null,
    into: null,
    ...more,
  }
}

function running(id: string, name: string, subjectId: string, at: number): Child {
  return {
    id,
    ref: `contract-${id}`,
    kind: 'subagent',
    name,
    subjectId,
    startedAt: at,
    endedAt: null,
    lastActivityAt: at,
    delegateState: null,
  }
}

/** An open press whose file was gone, so the row's feedback names the file and why, in words no button repeats. */
function failedOpen(at: number): LastAction {
  const part = { kind: 'open' as const, name: 'calibration.md', isCommand: false, error: 'it no longer exists' }

  return {
    kind: 'local',
    action: 'step-0',
    text: 'Open calibration.md',
    at,
    result: { state: 'failed', parts: [part], at },
  }
}

/** The demo with a goal under way: a settled row, a recommendation's reason beside short answers, a failed open, an idle subject, merged and replaced plans, more children than show, and closed work past the rows drawn for it. */
function underWay(now: number, agent: string): Session {
  const s = demoSession(now, agent)
  const o = s.ledger.overview!
  const dismissed = s.ledger.items.find(i => i.id === 'd13')!
  const closed: Closed = {
    id: dismissed.id,
    kind: dismissed.kind,
    ask: dismissed.ask,
    outcome: 'dismissed',
    how: 'dismissed',
    at: now - 2000,
    item: dismissed,
  }

  return {
    ...s,
    ledger: {
      ...s.ledger,
      items: s.ledger.items
        .filter(i => i.id !== dismissed.id)
        .map(i => (i.id === 'd12' ? { ...i, recReason: 'looking back at it is often by chance' } : i)),
      closed: [...s.ledger.closed, closed],
      overview: {
        ...o,
        goal: o.goal && { ...o.goal, setAt: now - 10 * MIN, was: 'Pinch ships next month' },
        milestones: o.milestones.map(m => (m.id === 'm3' ? { ...m, was: 'flick ships too', changedAt: now - MIN } : m)),
        subjects: [
          ...o.subjects.map(x => (x.id === 's2' ? { ...x, merged: 'Lens pairing', changedAt: now - MIN } : x)),
          subject('s9', 'working', 'Glance sizes', 'sizes set per lens', now - 2 * DAY),
          subject('s10', 'done', 'Wake word', 'set to Hey glasses', now - 10 * MIN),
          subject('s11', 'done', 'Night mode', 'dims glances at night', now - 9 * MIN),
          subject('s12', 'done', 'Sun glare', 'boosts contrast outdoors', now - 8 * MIN),
        ],
        serves: { ...o.serves, s9: 'none', s10: 'm2', s11: 'm2', s12: 'm2' },
        children: [
          ...o.children,
          running('c20', 'Read the pairing logs', 's2', now - 3 * MIN),
          running('c21', 'Try the other radio', 's2', now - 4 * MIN),
          running('c22', 'Check the firmware', 's2', now - 5 * MIN),
        ],
      },
    },
    lastActions: { ...s.lastActions, d17: failedOpen(now - 30_000) },
    overviewFailure: { at: now - MIN, cause: 'no-answer', answer: null },
  }
}

/** The goal met, with its milestones folded, the head apart from it, a suggested next goal, and seen open work folded into counts. */
function met(now: number, agent: string): Session {
  const s = demoSession(now, agent)
  const o = s.ledger.overview!

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: {
        ...o,
        goal: o.goal && { ...o.goal, metAt: now - 20 * MIN },
        milestones: o.milestones.map(m => ({
          ...m,
          status: 'done',
          closedAt: now - 40 * MIN,
          changedAt: now - 40 * MIN,
        })),
        subjects: o.subjects.map(x =>
          o.serves[x.id] === 'none' ? x : { ...x, status: 'done', closedAt: now - 40 * MIN, changedAt: now - 40 * MIN },
        ),
        children: o.children.filter(c => c.endedAt !== null),
        suggestedGoal: 'Flick ships in the beta',
        changedAt: now - 3 * 60 * MIN,
        quietCalls: 5,
      },
    },
  }
}

/** A goal set a moment ago, whose milestones the Status call has not written yet. */
function justSet(now: number, agent: string): Session {
  const s = demoSession(now, agent)
  const o = s.ledger.overview!

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: { ...o, goal: o.goal && { ...o.goal, isAwaitingMilestones: true }, milestones: [], serves: {} },
    },
  }
}

/** The sessions every look's contract test draws. Together they give every field the contract says a look shows as words. */
export function contractSessions(now: number, agent: string): { name: string; session: Session }[] {
  return [
    { name: 'goal under way', session: underWay(now, agent) },
    { name: 'goal met', session: met(now, agent) },
    { name: 'goal just set', session: justSet(now, agent) },
  ]
}
