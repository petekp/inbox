import assert from 'node:assert/strict'
import { after } from 'node:test'
import { Window } from 'happy-dom'
import { EMPTY } from '../../hooks/ledger'
import type { Ledger } from '../../types'
import { inboxView } from '../../hooks/view'

export const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

export function task() {
  const ledger: Ledger = {
    ...EMPTY,
    items: [
      {
        id: 'i1',
        kind: 'task' as const,
        label: null,
        from: 'record',
        ask: 'Check the build',
        options: [],
        rec: null,
        helps: [{ kind: 'run' as const, command: 'npm test', name: 'tests' }],
        turn: 1,
        at: 1,
      },
    ],
  }
  const view = inboxView({
    ledger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
    shownSince: null,
    lastTypedMessageAt: null,
  })
  return { ledger, row: view.needsYou.tasks[0]! }
}

export function buttons(root: HTMLElement) {
  return [...root.querySelectorAll('button')]
}

export function named(root: HTMLElement, label: string) {
  const button = buttons(root).find(b => b.textContent === label)
  assert.ok(button, `${label} is available`)
  return button
}
