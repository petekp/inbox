import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyPress,
  markSentToAgent,
  refuseDoneNotification,
  finishedResult,
  pendingResult,
  runLocalEffects,
  runSends,
  withLasts,
} from '../../hooks/presses'
import type { EffectHost, PressResult, RowPress } from '../../hooks/presses'
import { applyPrPress } from '../../hooks/pr-tab'
import { demoView } from '../../hooks/demo'
import { recordClose, recordItem } from '../../hooks/tools'
import {
  closedShown,
  feedbackText,
  firstWaiting,
  keptOpen,
  listWaits,
  QUEUED_AFTER_MS,
  rowAfterClose,
  rowMark,
  SETTLED_MS,
} from '../../hooks/view'
import type { RowView, RowWait } from '../../hooks/view'
import type { Item, LastAction, LocalResult } from '../../types'
import { ARRIVAL_TABS, followTo } from '../../hooks/arrivals'
import { isShownEmpty, newRows, openRows } from '../src/arrivals'
import { endTurn, noteHook, notePrompt, noteToolCall, viewOf } from '../src/core'
import { demoState } from '../src/demo'
import { EXIT_MS, ROW_STATE_MS, stepRow } from '../src/rows'
import type { RowState, RowTarget, RowTrack } from '../src/rows'
import { drawnSettled, SETTLE_WINDOW_MS, settledIds, settledSeen } from '../src/settle'
import { emptyState, NOTHING_HEARD } from '../src/state'
import type { SessionState } from '../src/state'
import { CODEX } from '../src/texts'

function withItems(): SessionState {
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

function pressed(s: SessionState, p: RowPress): PressResult {
  return applyPress(s.ledger, s.lastActions[p.id], p, {
    now: 50,
    turnsStarted: s.presence.turnsStarted,
    extraSteps: [],
  })
}

function after(s: SessionState, p: RowPress): SessionState {
  const r = pressed(s, p)
  assert.ok(!('stale' in r))

  return { ...s, ledger: r.ledger, lastActions: r.last ? { ...s.lastActions, [p.id]: r.last } : s.lastActions }
}

test('an older same-time send failure does not claim a newer failed action', async () => {
  let lasts: Record<string, LastAction> = {
    i1: {
      kind: 'talk' as const,
      action: 'explain',
      text: 'Explain',
      at: 50,
      delivery: { state: 'failed' as const, reason: 'new send failed', id: 'new' },
    },
  }
  const host: EffectHost = {
    now: () => 50,
    deliveryId: () => 'old',
    perform: async () => null,
    send: async () => ({ state: 'rejected', reason: 'old send failed' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }
  const result = await runSends(host, [{ kind: 'send', text: 'same text', by: null }], 'i1', ['i1'], 50)
  assert.deepEqual(result, { state: 'rejected', reason: 'old send failed', isRowFailed: false })
  const finalDelivery = lasts.i1?.delivery
  assert.equal(finalDelivery?.state, 'failed')
  assert.equal(finalDelivery?.state === 'failed' ? finalDelivery.id : null, 'new')
})

test('an older same-time local completion cannot replace the newer press of the same action', async () => {
  const effect = { kind: 'open' as const, target: 'same', name: 'same' }
  const older = pendingResult([effect], 50, 'older')
  const newer = pendingResult([effect], 50, 'newer')
  let lasts: Record<string, LastAction> = {
    i1: { kind: 'local', action: 'step-0', text: 'Open same', at: 50, result: newer },
  }
  const host: EffectHost = {
    now: () => 50,
    deliveryId: () => '',
    perform: async () => 'older failed',
    send: async () => ({ state: 'accepted' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }

  await runLocalEffects(host, [effect], 'i1', older)
  assert.deepEqual(lasts.i1?.result, newer)

  host.perform = async () => null
  await runLocalEffects(host, [effect], 'i1', newer)
  assert.deepEqual(lasts.i1?.result, {
    state: 'done',
    parts: [{ kind: 'open', name: 'same', isCommand: false, error: null }],
    at: 50,
    pressId: 'newer',
  })
})

test('a rejected local effect records failure on the pressed row', async () => {
  const effect = { kind: 'open' as const, target: 'file.command', name: 'file.command' }
  const pending = pendingResult([effect], 50, 'press')
  let lasts: Record<string, LastAction> = {
    i1: { kind: 'local', action: 'step-0', text: 'Open file.command', at: 50, result: pending },
  }
  const host: EffectHost = {
    now: () => 51,
    deliveryId: () => '',
    perform: async () => {
      throw new Error('spawn failed')
    },
    send: async () => ({ state: 'accepted' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }

  await runLocalEffects(host, [effect], 'i1', pending)
  assert.deepEqual(lasts.i1?.result, {
    state: 'failed',
    parts: [{ kind: 'open', name: 'file.command', isCommand: false, error: 'spawn failed' }],
    at: 51,
    pressId: 'press',
  })
})

test('a review thread that stopped waiting rejects a stale Address press', () => {
  const d = demoView(100, 'Codex')
  const pr = Object.values(d.prViews.views).find(v => v.threads.some(t => t.isWaiting))!
  const thread = pr.threads.find(t => t.isWaiting)!
  const resolved = { ...pr, threads: pr.threads.map(t => (t.id === thread.id ? { ...t, isWaiting: false } : t)) }
  const prViews = { ...d.prViews, views: { ...d.prViews.views, [pr.ref]: resolved } }

  assert.deepEqual(
    applyPrPress(
      d.ledger,
      prViews,
      {},
      { action: 'thread-address', ref: pr.ref, thread: thread.id },
      { now: 200, turnsStarted: 0 },
    ),
    { stale: true },
  )
})

test('a delayed older press cannot replace a newer same-time last action', () => {
  const action = (id: string, pressOrder: number): LastAction => ({
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: 50,
    pressOrder,
    delivery: { state: 'queued', message: 'same text', id },
  })
  const newer = withLasts({}, { i1: action('new', 2) }, [], 2)
  const olderFinishesLast = withLasts(newer, { i1: action('old', 1) }, [], 1)
  assert.equal(olderFinishesLast.i1?.delivery?.state, 'queued')
  assert.equal(olderFinishesLast.i1?.delivery?.state === 'queued' ? olderFinishesLast.i1.delivery.id : null, 'new')
})

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

test('a press drawn for a row that left or changed is stale, and changes and sends nothing', () => {
  const s = withItems()
  const stale: unknown[] = [
    { action: 'answer', id: 'i9', option: 'Fix add.js' },
    { action: 'answer', id: 'i1', option: 'Delete the test' },
    { action: 'answer', id: 'i1', option: 0 },
    { action: 'step', id: 'i2', step: 0, label: 'Run the old script' },
    { action: 'undo', id: 'i1' },
  ]
  for (const p of stale) assert.deepEqual(pressed(s, p as RowPress), { stale: true })
  assert.deepEqual(pressed(s, { action: 'type', id: 'i2', text: '  ' }), { ledger: s.ledger, last: null, effects: [] })
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
  assert.equal(rowMark(folded.needsYou.tasks[0]!, 'codex').text, '✓')
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
  assert.equal(rowMark(unknown, 'codex').text, '')
  assert.equal(rowMark(unknown, 'terminal').text, '•')

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
  const rows = (list: RowView[]) => list.map(r => [r.id, r.handle, r.state.is])
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
    after.needsYou.questions.map(r => r.handle),
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

test('the tab reports active work separately from pending exchanges and failed updates', () => {
  const s = { ...withItems(), presence: { ...withItems().presence, isUpdating: false, ledgerState: 'failed' as const } }
  const waiting = endTurn(s, 'Done.', 50)
  assert.equal(waiting.pending.length, 1)
  assert.equal(viewOf(waiting, 60).status.isUpdating, false)
  assert.match(viewOf(waiting, 60).status.error ?? '', /Last update failed.*retries after your next message/)
  const running = { ...waiting, presence: { ...waiting.presence, isUpdating: true } }
  assert.deepEqual(viewOf(running, 60).status, { isUpdating: true, error: null })
  const scheduled = { ...waiting, presence: { ...waiting.presence, ledgerState: 'current' as const } }
  assert.deepEqual(viewOf(scheduled, 60).status, { isUpdating: false, error: null })
  assert.equal(viewOf(s, 60).status.error, 'Last update failed. Items from that reply may be missing.')
})

test('Fix hands a finding off and settles it as the choice made, then lists it in the Closed fold though an applied turn leaves it open; File issue folds it until the reply, which leaves it Still open or closes it with the issue; Discuss keeps it open; a close moves it to Closed', () => {
  const w = withItems()
  const s = {
    ...w,
    ledger: recordItem(
      CODEX,
      w.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      10,
    ).ledger,
  }
  const r = pressed(s, { action: 'address', id: 'f3' })
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    {
      kind: 'send',
      text: 'Please address this finding you recorded:\nIssue: No lint script\nOnly tests run.',
      by: null,
    },
  ])
  const sent = after(s, { action: 'address', id: 'f3' })
  const folded = viewOf(sent, 60).findings
  assert.deepEqual(
    folded.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'settled', null]],
  )
  assert.equal(folded.count, 0)
  assert.equal(folded.rows[0]?.state.is === 'settled' && folded.rows[0].state.label, 'Fix')
  const started = notePrompt(sent, 'Please address this finding you recorded:', 70).state
  const applied = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  const moved = viewOf(applied, 80 + SETTLE_WINDOW_MS).findings
  assert.deepEqual(moved.rows, [])
  assert.equal(moved.count, 0)
  assert.deepEqual(
    moved.closed.map(f => [f.id, f.outcome]),
    [['f3', 'Fix']],
  )
  const filing = pressed(s, { action: 'issue', id: 'f3' })
  assert.ok(!('stale' in filing))
  assert.equal(filing.effects.length, 1)
  const filingText = filing.effects[0]?.kind === 'send' ? filing.effects[0].text : ''
  assert.match(filingText, /^Please file an issue for this finding you recorded/)
  assert.ok(filingText.endsWith('\nIssue: No lint script\nOnly tests run.'))
  const filed = after(s, { action: 'issue', id: 'f3' })
  const filedRows = viewOf(filed, 60).findings
  assert.deepEqual(
    filedRows.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'handedOff', '✓ Asked to file']],
  )
  assert.equal(filedRows.count, 0)
  const filedStarted = notePrompt(filed, 'Please file an issue for this finding you recorded', 70).state
  const leftOpen: SessionState = {
    ...filedStarted,
    presence: { ...filedStarted.presence, turnsApplied: filedStarted.presence.turnsStarted },
    lastActions: {
      ...filedStarted.lastActions,
      f3: { ...filedStarted.lastActions.f3!, delivery: { state: 'arrived' } },
    },
  }
  const stillOpen = viewOf(leftOpen, 80 + SETTLE_WINDOW_MS).findings
  assert.deepEqual(
    stillOpen.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'open', 'Still open']],
  )
  assert.equal(stillOpen.count, 1)
  assert.deepEqual(stillOpen.closed, [])
  const filedAndClosed = {
    ...leftOpen,
    ledger: recordClose(CODEX, leftOpen.ledger, { id: 'f3', reason: 'LIN-12' }, 90).ledger,
  }
  assert.deepEqual(
    viewOf(filedAndClosed, 90 + SETTLE_WINDOW_MS).findings.closed.map(f => [f.id, f.outcome]),
    [['f3', 'closed by Codex: LIN-12']],
  )
  const discussed = viewOf(after(s, { action: 'discuss', id: 'f3' }), 60).findings
  assert.deepEqual(
    discussed.rows.map(r => [r.id, r.state.is, r.actions.find(a => a.press.action === 'discuss')?.label]),
    [['f3', 'open', 'Discuss']],
  )
  assert.equal(discussed.count, 1)
  const closedBy = { ...sent, ledger: recordClose(CODEX, sent.ledger, { id: 'f3', reason: 'fixed' }, 90).ledger }
  assert.deepEqual(
    viewOf(closedBy, 100).findings.rows.map(r => [r.id, r.state, r.actions]),
    [
      [
        'f3',
        { is: 'settled', label: 'Closed by Codex: fixed', at: 90, canUndo: false, delivery: null, isLapsed: false },
        [],
      ],
    ],
  )
  const closed = viewOf(closedBy, 90 + SETTLE_WINDOW_MS)
  assert.deepEqual(closed.findings.rows, [])
  assert.deepEqual(
    closed.findings.closed.map(f => [f.id, f.title, f.outcome]),
    [['f3', 'No lint script', 'closed by Codex: fixed']],
  )
  const dismissed = pressed(s, { action: 'dismiss', id: 'f3' })
  assert.ok(!('stale' in dismissed))
  assert.deepEqual(dismissed.effects, [])
  assert.deepEqual(
    dismissed.ledger.closedFindings.map(f => [f.id, f.how]),
    [['f3', 'dismissed']],
  )
})

test('Dismiss settles a row in place with Undo, and Undo puts it back open where it was; only a Done or Dismiss undoes', () => {
  const s = withItems()
  const dismissed = after(s, { action: 'dismiss', id: 'i1' })
  const settled = viewOf(dismissed, 60).needsYou
  assert.deepEqual(
    settled.questions.map(r => [r.id, r.state, r.actions.map(a => a.press)]),
    [
      [
        'i1',
        { is: 'settled', label: 'Dismissed', at: 50, canUndo: true, delivery: null, isLapsed: true },
        [{ action: 'undo', id: 'i1' }],
      ],
    ],
  )
  assert.equal(settled.count, 1)
  assert.equal(firstWaiting(listWaits(viewOf(dismissed, 60)).needsYou), 'i2')
  const undone = after(dismissed, { action: 'undo', id: 'i1' })
  const back = viewOf(undone, 70).needsYou
  assert.deepEqual(
    back.questions.map(r => [r.id, r.state.is, r.handle, r.item?.options]),
    [['i1', 'open', '1)', ['Fix add.js', 'Change test']]],
  )
  assert.equal(back.count, 2)
  assert.deepEqual(undone.ledger.closed, [])
  assert.ok('stale' in pressed(undone, { action: 'undo', id: 'i1' }))
  const answered = after(s, { action: 'answer', id: 'i1', option: 'Fix add.js' })
  assert.ok('stale' in pressed(answered, { action: 'undo', id: 'i1' }))
  const closedByCodex = { ...s, ledger: recordClose(CODEX, s.ledger, { id: 'i2', reason: 'done' }, 50).ledger }
  assert.ok('stale' in pressed(closedByCodex, { action: 'undo', id: 'i2' }))
  const expired = {
    ...s,
    ledger: {
      ...s.ledger,
      items: s.ledger.items.slice(1),
      closed: [
        {
          id: 'i1',
          kind: 'question' as const,
          ask: 'Fix add.js or the test?',
          outcome: 'expired',
          how: 'expired' as const,
          at: 40,
          item: s.ledger.items[0],
        },
      ],
    },
  }
  assert.ok('stale' in pressed(expired, { action: 'undo', id: 'i1' }))
  const withFinding = {
    ...s,
    ledger: recordItem(
      CODEX,
      s.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      10,
    ).ledger,
  }
  const restored = after(after(withFinding, { action: 'dismiss', id: 'f3' }), { action: 'undo', id: 'f3' })
  assert.deepEqual(
    viewOf(restored, 70).findings.rows.map(r => [r.id, r.state.is]),
    [['f3', 'open']],
  )
})

test('the tab draws a settled row for SETTLED_MS from its first poll, then lists it in the Closed fold while the server still lists it settled', () => {
  const s = withItems()
  const dismissed = after(s, { action: 'dismiss', id: 'i1' })
  let seen = settledSeen(new Map(), settledIds(viewOf(dismissed, 2050)), 2050)
  assert.deepEqual([...drawnSettled(seen, 2050)], ['i1'])
  const fold = (now: number) =>
    closedShown(viewOf(dismissed, now).needsYou.closed.questions, drawnSettled(seen, now)).map(d => d.id)
  assert.deepEqual(fold(2050), [])
  const later = 2050 + SETTLED_MS + EXIT_MS + 1
  seen = settledSeen(seen, settledIds(viewOf(dismissed, later)), later)
  assert.equal(viewOf(dismissed, later).needsYou.questions[0]?.state.is, 'settled')
  assert.deepEqual(fold(later), ['i1'])
})

test('a row Codex closes while the person types a reply stays held in place, out of the count and the Closed fold, Discard folds it at once, and its reply sends and settles it as Replied', () => {
  const s = withItems()
  const closed = { ...s, ledger: recordClose(CODEX, s.ledger, { id: 'i1', reason: 'settled in chat' }, 50).ledger }
  const held = viewOf(closed, 50 + SETTLE_WINDOW_MS + 1, { replies: { i1: 40 }, discarded: {} }).needsYou
  assert.deepEqual(
    held.questions.map(r => [r.id, r.state, r.feedback, r.actions.map(a => [a.label, a.kind])]),
    [
      [
        'i1',
        { is: 'held', label: 'Closed by Codex: settled in chat', at: 50 },
        { is: 'closed', label: 'Closed by Codex: settled in chat', at: 50 },
        [
          ['Reply', 'handoff'],
          ['Discard', 'view'],
        ],
      ],
    ],
  )
  assert.equal(held.count, 1)
  assert.deepEqual(held.closed.questions, [])
  assert.equal(firstWaiting(listWaits(viewOf(closed, 60, { replies: { i1: 40 }, discarded: {} })).needsYou), 'i2')
  assert.deepEqual(
    viewOf(closed, 50 + SETTLE_WINDOW_MS + 1, { replies: { i1: 51 }, discarded: {} }).needsYou.questions,
    [],
  )
  const discarded = viewOf(closed, 60, { replies: {}, discarded: { i1: 55 } }).needsYou
  assert.deepEqual(discarded.questions, [])
  assert.deepEqual(
    discarded.closed.questions.map(d => d.id),
    ['i1'],
  )

  const r = applyPress(
    closed.ledger,
    undefined,
    { action: 'type', id: 'i1', text: ' Fix add.js after all ' },
    {
      now: 70,
      turnsStarted: 1,
      extraSteps: [],
    },
  )
  assert.ok(!('stale' in r))
  assert.equal(r.ledger, closed.ledger)
  assert.deepEqual(r.effects, [{ kind: 'send', text: 'Re "Fix add.js or the test?": Fix add.js after all', by: null }])
  const replied = { ...closed, lastActions: { i1: r.last! } }
  assert.deepEqual(
    viewOf(replied, 70 + QUEUED_AFTER_MS, { replies: { i1: 40 }, discarded: {} }).needsYou.questions[0]?.state,
    {
      is: 'settled',
      label: 'Replied',
      at: 70,
      canUndo: false,
      delivery: 'queued',
      isLapsed: false,
    },
  )
  const later = 70 + SETTLE_WINDOW_MS
  assert.deepEqual(viewOf(replied, later).needsYou.questions, [])
  assert.deepEqual(
    viewOf(replied, later).needsYou.closed.questions.map(d => d.id),
    ['i1'],
  )
})

test('a held finding’s reply sends what a reply to the open finding sends, and a row the person closed holds nothing', () => {
  const s = withItems()
  const recorded = recordItem(
    CODEX,
    s.ledger,
    { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
    10,
  ).ledger
  const closed = recordClose(CODEX, recorded, { id: 'f3', reason: 'added one' }, 50).ledger
  const r = applyPress(
    closed,
    undefined,
    { action: 'type', id: 'f3', text: 'Use eslint' },
    {
      now: 70,
      turnsStarted: 1,
      extraSteps: [],
    },
  )
  assert.ok(!('stale' in r))
  assert.deepEqual(
    r.effects.map(e => e.kind === 'send' && e.text),
    ['About this finding you recorded:\nIssue: No lint script\nOnly tests run.\n\nUse eslint'],
  )
  assert.deepEqual(
    viewOf({ ...s, ledger: closed }, 50 + SETTLE_WINDOW_MS + 1, {
      replies: { f3: 40 },
      discarded: {},
    }).findings.rows.map(row => [row.id, row.state.is]),
    [['f3', 'held']],
  )

  const dismissed = after({ ...s, ledger: recorded }, { action: 'dismiss', id: 'f3' })
  assert.deepEqual(
    viewOf(dismissed, 50 + SETTLE_WINDOW_MS + 1, { replies: { f3: 40 }, discarded: {} }).findings.rows,
    [],
  )
  const answered = after(s, { action: 'answer', id: 'i1', option: 'Fix add.js' })
  assert.deepEqual(
    viewOf(answered, 50 + SETTLE_WINDOW_MS + 1, { replies: { i1: 40 }, discarded: {} }).needsYou.questions.map(
      row => row.id,
    ),
    [],
  )
})

test('Codex closing an item reads as Codex in its outcome', () => {
  const r = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'no longer applies' }, 50)
  assert.equal(r.ledger.closed[0]?.outcome, 'closed by Codex: no longer applies')
  assert.equal(
    recordClose(CODEX, withItems().ledger, { id: 'i9', reason: 'x' }, 50).result.startsWith('Not closed'),
    true,
  )
  const closed = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'a' }, 50)
  const again = recordClose(CODEX, closed.ledger, { id: 'i1', answer: 'b' }, 60)
  assert.equal(again.result, 'Already closed: you closed it earlier.')
  assert.equal(again.ledger, closed.ledger)
})

test('the tab says the hooks were not heard when none ran, when a tool call comes in a turn no prompt recorded, or when two prompts saw no Stop', () => {
  const s = withItems()
  assert.equal(viewOf(s, 10).heard, 'none')
  const started = noteHook(s, 'start', 10)
  assert.equal(viewOf(started, 10).heard, 'heard')
  const prompted = noteHook(started, 'prompt', 20, 't1')
  assert.equal(viewOf(noteToolCall(prompted, 't1', 30), 30).heard, 'heard')
  const missed = noteToolCall(prompted, 't2', 30)
  assert.equal(viewOf(missed, 30).heard, 'partial')
  assert.equal(viewOf(noteHook(noteHook(missed, 'stop', 35), 'prompt', 40, 't3'), 40).heard, 'heard')
  const twice = noteHook(prompted, 'prompt', 50, 't2')
  assert.equal(viewOf(twice, 50).heard, 'partial')
  assert.equal(viewOf(noteHook(twice, 'stop', 60), 60).heard, 'heard')
  assert.equal(viewOf(noteHook(prompted, 'prompt', 50, 't1'), 50).heard, 'heard')
  assert.equal(viewOf(noteHook(noteHook(s, 'prompt', 20, 't1'), 'stop', 30), 30).heard, 'partial')
  const stopped = noteHook(prompted, 'stop', 40)
  assert.equal(viewOf(noteToolCall(stopped, null, 45), 45).heard, 'partial')
  assert.equal(viewOf(noteToolCall(prompted, null, 25), 25).heard, 'heard')
  assert.equal(viewOf(demoState(10), 10).heard, 'heard')
})

test('a tool call in a turn the prompt hook recorded, after a Stop sent Codex back, is not read as a skipped prompt', () => {
  const prompted = noteHook(noteHook(withItems(), 'start', 10), 'prompt', 20, 't1')
  const sentBack = noteHook(prompted, 'stop', 30)
  const called = noteToolCall(sentBack, 't1', 40)
  assert.equal(called.heard.promptMissedAt, null)
  assert.equal(viewOf(called, 40).heard, 'heard')
})

test('the tab moves from an empty Asks to Finds when it opens on a finding or a poll brings one, and counts as new only rows added since its first view', () => {
  const s = noteHook(emptyState('s1'), 'start', 1)
  const first = newRows({}, viewOf(s, 10), false)
  assert.deepEqual(first.added, { needsYou: [], findings: [], prs: [] })
  const withFinding = {
    ...s,
    ledger: recordItem(
      CODEX,
      s.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      20,
    ).ledger,
  }
  const next = newRows(first.seen, viewOf(withFinding, 20), false)
  assert.deepEqual(next.added, { needsYou: [], findings: ['f1'], prs: [] })
  const followed = (state: SessionState) =>
    followTo(
      ARRIVAL_TABS,
      'needsYou',
      isShownEmpty(viewOf(state, 20), 'needsYou', new Set(), new Set(), false),
      next.added,
    )
  assert.equal(followed(withFinding), 'findings')
  const opened = viewOf(withFinding, 20)
  assert.equal(
    followTo(ARRIVAL_TABS, 'needsYou', isShownEmpty(opened, 'needsYou', new Set(), new Set(), false), openRows(opened)),
    'findings',
  )
  assert.equal(viewOf({ ...withFinding, heard: NOTHING_HEARD }, 20).heard, 'none')
  assert.equal(followed({ ...withFinding, heard: NOTHING_HEARD }), null)
  assert.equal(followed({ ...withFinding, ledger: withItems().ledger }), null)
  assert.deepEqual(newRows(next.seen, viewOf(withFinding, 30), false).added, { needsYou: [], findings: [], prs: [] })
  const closed = recordClose(CODEX, withFinding.ledger, { id: 'f1', reason: 'fixed' }, 30)
  const afterClose = { ...withFinding, ledger: closed.ledger }
  const settled = viewOf(afterClose, 31)
  assert.equal(isShownEmpty(settled, 'findings', new Set(['f1']), new Set(), false), false)
  assert.equal(isShownEmpty(settled, 'findings', new Set(), new Set(), false), true)
  const history = viewOf(afterClose, 30_000)
  assert.equal(isShownEmpty(history, 'findings', new Set(), new Set(['issue']), false), false)
  assert.equal(isShownEmpty(history, 'findings', new Set(), new Set(), false), true)
})

test('a new PR counts as a new row, moves an empty tab to PRs, and counts nothing while PRs load', () => {
  const s = noteHook(emptyState('s1'), 'start', 1)
  const pr = (ref: string) => ({
    ref,
    number: 1,
    title: 'Fix it',
    url: `https://github.com/${ref}`,
    isDraft: false,
    state: 'OPEN',
    base: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: '',
    checks: [],
    threads: [],
    isYours: true,
    wasSeenOpen: true,
    error: null,
  })
  const withPrs = (refs: string[]) => {
    const v = viewOf(s, 10)

    return { ...v, prs: { ...v.prs, drawn: refs.map(ref => ({ pr: pr(ref), isSettled: false })) } }
  }
  const first = newRows({}, withPrs([]), false)
  const loading = newRows(first.seen, withPrs(['a/b#1']), true)
  assert.deepEqual(loading.added.prs, [])
  const arrived = newRows(first.seen, withPrs(['a/b#1']), false)
  assert.equal(arrived.added.prs.length, 1)
  const followed = (shown: 'needsYou' | 'prs', v: ReturnType<typeof withPrs>, added: typeof arrived.added) =>
    followTo(ARRIVAL_TABS, shown, isShownEmpty(v, shown, new Set(), new Set(), false), added)
  assert.equal(followed('needsYou', withPrs(['a/b#1']), arrived.added), 'prs')
  assert.equal(followed('needsYou', withPrs(['a/b#1']), openRows(withPrs(['a/b#1']))), null)
  assert.equal(followed('prs', withPrs(['a/b#1']), arrived.added), null)
  const emptied = withPrs([])
  assert.equal(isShownEmpty(emptied, 'prs', new Set(), new Set(), true), false)
  assert.equal(followed('prs', emptied, { needsYou: [], findings: ['f1'], prs: [] }), 'findings')
  assert.equal(followed('prs', emptied, { needsYou: [], findings: [], prs: [] }), null)
})

test('after a close the next waiting row opens, else the nearest one before it, and a row that arrives above leaves the open row open', () => {
  const w = (id: string, isWaiting = true): RowWait => ({ id, isWaiting })
  assert.equal(rowAfterClose([w('i1', false), w('i2', false), w('i3')], 'i1'), 'i3')
  assert.equal(rowAfterClose([w('i1'), w('i2', false), w('i3', false)], 'i3'), 'i1')
  assert.equal(rowAfterClose([w('i1', false), w('i2', false)], 'i2'), null)
  assert.equal(rowAfterClose([w('i1')], 'i9'), null)
  assert.equal(keptOpen([w('i3'), w('i1'), w('i2')], ['i3']), 'i1')
  assert.equal(keptOpen([w('i3'), w('i1', false)], ['i3']), null)
})

const ROW_STATES: RowState[] = [
  'entering',
  'closed',
  'opening',
  'open',
  'closing',
  'settling',
  'settled',
  'undoing',
  'leaving',
]
const ROW_TARGETS: RowTarget[] = ['closed', 'open', 'settled', 'undoing', 'gone']
const RESTS: Record<RowTarget, RowState | null> = {
  closed: 'closed',
  open: 'open',
  settled: 'settled',
  undoing: 'undoing',
  gone: null,
}

const WITH_PANEL = new Set<RowState>(['opening', 'open', 'closing', 'settling'])
const trackOf = (state: RowState, hasPanel = WITH_PANEL.has(state)): RowTrack => ({ state, since: 0, hasPanel })

test('every row state reaches every target, and a row drawing its panel keeps it until its height has shrunk over it', () => {
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS) {
      const first = stepRow(trackOf(state), target, 0)
      if (WITH_PANEL.has(state) && first)
        assert.ok(
          first.hasPanel && (WITH_PANEL.has(first.state) || first.state === 'leaving'),
          `${state} toward ${target} dropped its panel as ${first.state}`,
        )
      let track = first
      for (let n = 0; n < 2 && track && track.state !== RESTS[target]; n++)
        track = stepRow(track, target, track.since + ROW_STATE_MS[track.state])
      assert.equal(track?.state ?? null, RESTS[target], `${state} toward ${target}`)
      if (track) assert.equal(track.hasPanel, track.state === 'open', `${state} toward ${target}`)
    }
  assert.equal(stepRow(trackOf('open'), 'gone', 0)?.hasPanel, true)
  assert.equal(stepRow(trackOf('closed'), 'gone', 0)?.hasPanel, false)
})

test('a row turned around mid-move starts the new move at once, and with reduced motion every move ends as it starts', () => {
  assert.equal(stepRow(trackOf('closing'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('opening'), 'closed', 50)?.state, 'closing')
  assert.equal(stepRow(trackOf('settling'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('entering', false), 'open', 50)?.state, 'opening')
  const closing = trackOf('closing')
  assert.equal(stepRow(closing, 'closed', 50), closing)
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS)
      assert.equal(
        stepRow(trackOf(state), target, 0, false, true)?.state ?? null,
        RESTS[target],
        `${state} toward ${target}`,
      )
  assert.deepEqual(stepRow(undefined, 'open', 0, true), { state: 'entering', since: 0, hasPanel: true })
  assert.equal(stepRow(undefined, 'closed', 0, true)?.hasPanel, false)
  assert.equal(stepRow(undefined, 'closed', 0, true, true)?.state, 'closed')
  assert.equal(stepRow(undefined, 'open', 0)?.state, 'open')
})

test('a refused Done attempt cannot change a later close of the same task', () => {
  const initial = withItems().ledger
  const first = applyPress(
    initial,
    undefined,
    { id: 'i2', action: 'done' },
    { now: 20, turnsStarted: 1, extraSteps: [] },
  )
  assert.ok(!('stale' in first))
  const sent = markSentToAgent(first.ledger, ['i2'], 'old-attempt')
  const refused = refuseDoneNotification(sent, 'old-attempt', 'Refused')
  const undo = applyPress(
    refused,
    undefined,
    { id: 'i2', action: 'undo' },
    { now: 20, turnsStarted: 1, extraSteps: [] },
  )
  assert.ok(!('stale' in undo))
  const second = applyPress(
    undo.ledger,
    undefined,
    { id: 'i2', action: 'done' },
    { now: 20, turnsStarted: 1, extraSteps: [] },
  )
  assert.ok(!('stale' in second))
  const newer = markSentToAgent(second.ledger, ['i2'], 'new-attempt')
  const result = refuseDoneNotification(newer, 'old-attempt', 'Late refusal')
  assert.deepEqual(result, newer)
  assert.equal(result.closed[0]?.isSentToAgent, true)
})
