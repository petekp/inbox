import assert from 'node:assert/strict'
import { test } from 'node:test'

import { finishedResult } from '../../hooks/press-effects'
import type { RowPress } from '../../hooks/presses'
import {
  feedbackText,
  firstWaiting,
  listWaits,
  QUEUED_AFTER_MS,
  rowHandle,
  rowResultMark,
  SETTLED_MS,
} from '../../hooks/view'
import type { RowView } from '../../hooks/view'
import type { Item, LocalResult } from '../../types'
import { notePrompt, viewOf } from '../src/core'
import { emptyState } from '../src/state'
import type { SessionState } from '../src/state'
import { after, pressed, withItems } from './press-fixtures'

test('an answer names its option by text: it closes the question and sends the answer as a press', () => {
  const r = pressed(withItems(), { action: 'answer', id: 'i1', option: 'Fix add.js' })
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    { kind: 'send', text: 'Re "Fix add.js or the test?": Fix add.js', by: { id: 'i1', action: 'answer' } },
  ])
  assert.deepEqual(
    r.ledger.closed.map(d => [d.id, d.outcome, d.how]),
    [['i1', 'Fix add.js', 'answered']],
  )
  assert.equal(r.last?.kind, 'mark')
})

test('the person’s own numbered answer gets the note that maps it to the question', () => {
  const { notes } = notePrompt(withItems(), '1. fix add.js', 60)
  assert.match(notes[0] ?? '', /1 → "Fix add.js or the test\?"/)
})

test('a run step hands the task to Codex: it folds until the turn it started is summarized', () => {
  const p: RowPress = { action: 'step', id: 'i2', step: 0, label: 'Run seed script' }
  const r = pressed(withItems(), p)
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    {
      kind: 'send',
      text: 'For "Sign in to npm", run this:\n```\nnpm run seed\n```',
      by: { id: 'i2', action: 'run' },
    },
  ])
  const s = after(withItems(), p)
  const folded = viewOf(s, 60)
  assert.deepEqual(folded.needsYou.tasks[0]?.state, { is: 'handedOff' })
  assert.deepEqual(viewOf(s, 50 + QUEUED_AFTER_MS).needsYou.tasks[0]?.feedback, {
    is: 'queued',
    label: 'Run seed script',
    at: 50,
  })
  assert.deepEqual(rowResultMark(folded.needsYou.tasks[0]!), { text: '●', isRunning: true })
  assert.equal(folded.needsYou.count, 1)

  const message = r.effects[0]
  assert.equal(message?.kind, 'send')
  const unconfirmed: SessionState = {
    ...s,
    lastActions: {
      ...s.lastActions,
      i2: {
        ...s.lastActions.i2!,
        delivery: { state: 'unconfirmed', message: message?.kind === 'send' ? message.text : '' },
      },
    },
  }
  const unknown = viewOf(unconfirmed, 60).needsYou.tasks[0]!
  assert.equal(unknown.state.is, 'handedOff')
  assert.equal(unknown.feedback?.is, 'unconfirmed')
  assert.deepEqual(rowResultMark(unknown), { text: '', isRunning: false })

  const started = notePrompt(s, 'For "Sign in to npm", run this:', 70).state
  const summarized = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  assert.deepEqual(viewOf(summarized, 80).needsYou.tasks[0]?.state, { is: 'open' })
})

test('a run step on a question sends its command and folds the question, which stays open in the ledger, and a step that copies and opens sends nothing and reads as one note', () => {
  const w = withItems()
  const question = w.ledger.items[0]!
  const s: SessionState = {
    ...w,
    ledger: {
      ...w.ledger,
      items: [
        {
          ...question,
          helps: [
            { kind: 'run', command: 'npm test', name: 'tests' },
            { kind: 'copy', text: 'API_KEY=x', name: 'env line' },
            { kind: 'open', path: '.env.local' },
          ],
        },
      ],
    },
  }
  const run = pressed(s, { action: 'step', id: 'i1', step: 0, label: 'Run tests' })
  assert.ok(!('stale' in run))
  assert.deepEqual(
    run.effects.map(e => e.kind),
    ['send'],
  )
  assert.equal(run.last?.kind, 'handoff')
  assert.deepEqual(
    run.ledger.items.map(i => i.id),
    ['i1'],
  )
  assert.equal(viewOf(after(s, { action: 'step', id: 'i1', step: 0, label: 'Run tests' }), 60).needsYou.count, 0)

  const copyOpen = pressed(s, { action: 'step', id: 'i1', step: 1, label: 'Copy env line and open .env.local' })
  const pending = {
    state: 'pending' as const,
    parts: [
      { kind: 'copy' as const, name: 'env line', isCommand: false, error: null },
      { kind: 'open' as const, name: '.env.local', isCommand: false, error: null },
    ],
    at: 50,
  }
  assert.deepEqual(copyOpen, {
    ledger: s.ledger,
    last: {
      kind: 'local',
      action: 'step-1',
      text: 'Copy env line and open .env.local',
      at: 50,
      result: { ...pending, action: 'step-1' },
    },
    effects: [
      { kind: 'copy', text: 'API_KEY=x', name: 'env line', isCommand: false },
      { kind: 'open', target: '.env.local', name: '.env.local' },
    ],
  })
  const local = (result: LocalResult) => feedbackText({ is: 'local', result }, 'codex')
  assert.equal(local(pending), 'Copying env line\u2007·\u2002Opening .env.local…')
  assert.equal(local(finishedResult(pending, [null, null], 60)), '✓ Copied env line\u2007·\u2002Opened .env.local')
  assert.equal(
    local(finishedResult(pending, [null, 'it no longer exists'], 60)),
    'Copied env line\u2007·\u2002Could not open .env.local: it no longer exists',
  )
})

test('an open or copy on a handed-off task keeps it folded and out of the count, and its note says where to run a command', () => {
  const w = withItems()
  const task = w.ledger.items[1]!
  const s: SessionState = {
    ...w,
    ledger: {
      ...w.ledger,
      items: [{ ...task, helps: [...task.helps, { kind: 'terminal', command: 'npm login', name: null }] }],
    },
  }
  const handedOff = after(s, { action: 'step', id: 'i2', step: 0, label: 'Run seed script' })
  const copied = after(handedOff, { action: 'step', id: 'i2', step: 1, label: 'Copy npm login' })
  assert.deepEqual({ ...copied.lastActions.i2, result: undefined }, { ...handedOff.lastActions.i2, result: undefined })
  const row = viewOf(copied, 60).needsYou.tasks[0]
  assert.deepEqual(row?.state, { is: 'handedOff' })
  assert.equal(viewOf(copied, 60).needsYou.count, 0)
  const result = finishedResult(copied.lastActions.i2!.result!, [null], 55)
  assert.equal(
    feedbackText({ is: 'local', result }, 'terminal'),
    '✓ Copied npm login. Run it in a terminal, or type ! and paste.',
  )
  assert.equal(feedbackText({ is: 'local', result }, 'desktop'), '✓ Copied npm login. Run it in Terminal.')
  const done = { ...copied, lastActions: { i2: { ...copied.lastActions.i2!, result } } }
  assert.equal(viewOf(done, 60).needsYou.tasks[0]?.feedback?.is, 'local')
  assert.deepEqual(viewOf(done, 55 + SETTLED_MS).needsYou.tasks[0]?.feedback, {
    is: 'queued',
    label: 'Run seed script',
    at: 50,
  })
})

function asked(id: string, kind: Item['kind'], turn: number): Item {
  return {
    id,
    kind,
    label: null,
    from: 'record',
    ask: `Ask ${id}`,
    options: [],
    rec: null,
    helps: [],
    turn,
    at: turn,
  }
}

test('Asks lists the newest reply first and keeps each older reply in the order it asked', () => {
  const s = emptyState('s1')
  const state: SessionState = {
    ...s,
    ledger: {
      ...s.ledger,
      turn: 3,
      batchTurn: 3,
      nextId: 6,
      items: [
        asked('i1', 'question', 1),
        asked('i2', 'question', 1),
        asked('i3', 'task', 2),
        asked('i4', 'task', 2),
        asked('i5', 'question', 3),
      ],
    },
  }
  const v = viewOf(state, 10)
  assert.deepEqual(
    v.needsYou.questions.map(r => r.id),
    ['i5', 'i1', 'i2'],
  )
  assert.deepEqual(
    v.needsYou.tasks.map(r => r.id),
    ['i3', 'i4'],
  )
})

test('the tab lists Asks in the mod’s order, numbers only the questions a typed number answers, and counts what waits', () => {
  const s = emptyState('s1')
  const state: SessionState = {
    ...s,
    ledger: {
      ...s.ledger,
      turn: 2,
      batchTurn: 2,
      nextId: 6,
      items: [
        asked('i1', 'task', 1),
        asked('i2', 'question', 1),
        asked('i3', 'question', 2),
        asked('i4', 'task', 2),
        asked('i5', 'question', 2),
      ],
    },
    lastActions: { i1: { kind: 'handoff', action: 'type', text: 'Reply', at: 1, turnsStarted: 2 } },
    presence: { ...s.presence, turnsStarted: 2, turnsApplied: 2 },
  }
  const v = viewOf(state, 10)
  const rows = (list: RowView[]) => list.map(r => [r.id, rowHandle(r), r.state.is])
  assert.deepEqual(rows(v.needsYou.questions), [
    ['i3', '1)', 'open'],
    ['i5', '3)', 'open'],
    ['i2', '•', 'open'],
  ])
  assert.deepEqual(rows(v.needsYou.tasks), [
    ['i4', '•', 'open'],
    ['i1', '•', 'handedOff'],
  ])
  assert.equal(v.needsYou.count, 4)
  assert.equal(firstWaiting(listWaits(v).needsYou), 'i3')

  const after = viewOf(notePrompt(state, 'thanks', 20).state, 30)
  assert.deepEqual(
    after.needsYou.questions.map(r => rowHandle(r)),
    ['•', '•', '•'],
  )
})

test('a question lists every option, folds those past the fourth of 7, marks the recommended one, and lists its steps before its other actions', () => {
  const s = emptyState('s1')
  const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet']
  const state: SessionState = {
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        {
          ...asked('i1', 'question', 1),
          options: colors,
          rec: 'Green',
          isDesignChoice: true,
          helps: [{ kind: 'run', command: './a.sh', name: 'a script' }],
        },
      ],
    },
  }
  const actions = viewOf(state, 10).needsYou.questions[0]?.actions ?? []
  assert.deepEqual(
    actions.map(a => [a.label, a.kind, a.isPrimary, a.isFolded]),
    [
      ['Green', 'mark', true, false],
      ['Red', 'mark', false, false],
      ['Orange', 'mark', false, false],
      ['Yellow', 'mark', false, false],
      ['Blue', 'mark', false, true],
      ['Indigo', 'mark', false, true],
      ['Violet', 'mark', false, true],
      ['Run a script', 'handoff', false, false],
      ['Reply', 'mark', false, false],
      ['Explain', 'talk', false, false],
      ['Compare', 'talk', false, false],
      ['Dismiss', 'mark', false, false],
    ],
  )
})
