import type { Child, Closed, LastAction, Session, Subject } from '../types'
import { demoSession } from '../core/view/demo'

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

function inPlace(now: number, agent: string): Session {
  const s = demoSession(now, agent)
  const o = s.ledger.overview
  if (!o) throw new Error('the demo session has no Status')
  const names: Record<string, string> = { m3: 'Flick option chosen', m5: 'Glasses trial passed' }

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: {
        ...o,
        milestones: o.milestones.map(m => ({ ...m, name: names[m.id] ?? m.name })),
        subjects: o.subjects.map(x =>
          x.id === 's3'
            ? { ...x, merged: 'Swipe option', changedAt: now - MIN }
            : x.id === 's5'
              ? { ...x, changedAt: now - 2 * DAY }
              : x,
        ),
      },
    },
  }
}

function distinctAges<T extends { at: number | null }>(rows: T[], now: number, used: Set<number>): T[] {
  return rows.map(row => {
    if (row.at === null) return row
    let at = row.at

    while (used.has(Math.round((now - at) / MIN))) at -= MIN
    used.add(Math.round((now - at) / MIN))

    return { ...row, at }
  })
}

function distinct(s: Session, now: number): Session {
  const o = s.ledger.overview!
  const used = new Set<number>()
  const items = distinctAges(s.ledger.items, now, used)
  const closed = s.ledger.closed.map(c => (c.item ? { ...c, item: distinctAges([c.item], now, used)[0] } : c))
  const heldUp = new Set<string>()
  const askSubjects = Object.fromEntries(
    Object.entries(o.askSubjects).map(([ask, ids]) => {
      const first = ids.filter(id => !heldUp.has(id))

      first.forEach(id => heldUp.add(id))

      return [ask, first]
    }),
  )
  const subjectTexts = new Set(o.subjects.map(x => x.text))
  const { d18: _handOff, ...lastActions } = s.lastActions
  const explained: LastAction = {
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: now - 3 * MIN,
    turnsStarted: 13,
  }

  return {
    ...s,
    ledger: {
      ...s.ledger,
      items,
      closed,
      findings: distinctAges(s.ledger.findings, now, new Set()),
      overview: {
        ...o,
        askSubjects,
        milestones: o.milestones.map(m => (subjectTexts.has(m.text) ? { ...m, text: 'needs your choice' } : m)),
      },
    },
    lastActions: { ...lastActions, d11: explained },
  }
}

export function contractSessions(now: number, agent: string): { name: string; session: Session }[] {
  return [
    { name: 'goal under way', session: underWay(now, agent) },
    { name: 'goal met', session: met(now, agent) },
    { name: 'goal just set', session: justSet(now, agent) },
    { name: 'subjects in milestones’ places', session: inPlace(now, agent) },
  ].map(({ name, session }) => ({ name, session: distinct(session, now) }))
}
