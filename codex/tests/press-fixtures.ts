import assert from 'node:assert/strict'

import { applyPress } from '../../core/view/press-reducer'
import type { PressResult } from '../../core/view/press-reducer'
import type { RowPress } from '../../core/domain/presses'
import { NO_HOLDS } from '../../core/view/timing'
import { emptyState } from '../src/state'
import type { SessionState } from '../src/state'
import { NO_SESSION_PRS } from '../../core/domain/help-steps'

export const SHOWN = { ...NO_HOLDS, shownSince: 0 }

export function withItems(): SessionState {
  const s = emptyState('s1')

  return {
    ...s,
    root: '/repo',
    ledger: {
      ...s.ledger,
      turn: 1,
      nextId: 3,
      batchTurn: 1,
      items: [
        {
          id: 'i1',
          kind: 'question',
          label: '1',
          from: 'update',
          ask: 'Fix add.js or the test?',
          options: ['Fix add.js', 'Change test'],
          rec: 'Fix add.js',
          helps: [],
          turn: 1,
          at: 1,
        },
        {
          id: 'i2',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Sign in to npm',
          options: [],
          rec: null,
          helps: [{ kind: 'run', command: 'npm run seed', name: 'seed script' }],
          turn: 1,
          at: 1,
        },
      ],
    },
    presence: { ...s.presence, turnsStarted: 1, turnsApplied: 1 },
  }
}

export function pressed(s: SessionState, p: RowPress): PressResult {
  return applyPress(s.ledger, s.lastActions[p.id], p, {
    now: 50,
    turnsStarted: s.presence.turnsStarted,
    sessionPrs: NO_SESSION_PRS,
    comparePage: '/plugin/dist/compare-page.html',
    compareInBackground: false,
    holdMs: 1000,
  })
}

export function after(s: SessionState, p: RowPress): SessionState {
  const r = pressed(s, p)
  assert.ok(!('stale' in r))

  return { ...s, ledger: r.ledger, lastActions: r.last ? { ...s.lastActions, [p.id]: r.last } : s.lastActions }
}

export function released(s: SessionState, id: string, sentAt?: number): SessionState {
  const last = s.lastActions[id]
  const held = last?.delivery
  assert.ok(last && held?.state === 'held')

  return {
    ...s,
    lastActions: {
      ...s.lastActions,
      [id]: { ...last, delivery: { state: 'queued', message: held.message, ...(sentAt !== undefined && { sentAt }) } },
    },
  }
}
