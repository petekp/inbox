import { expect, test } from 'claude-code/testing'

import { flattenConversation } from '../hooks/conversation'
import { EMPTY, applyUpdate, parseReply, upgradeLedger } from '../hooks/ledger'
import { applyOverview, parseOverview, withChild } from '../hooks/overview'
import { CLAUDE_CODE } from '../hooks/model-text'
import {
  appliedCatchUp,
  appliedOverview,
  cleared,
  emptySession,
  endTurn,
  failedOverview,
  forkedFrom,
  hasLedger,
  isUnseen,
  noteCommandOutput,
  notePrompt,
  pressOn,
  recordPrompt,
  recorded,
  sessionView,
  startContext,
  turnEnded,
  turnStarted,
  upgradeSession,
} from '../hooks/session'
import type { Session } from '../hooks/session'
import type { RowNote } from '../types'
import { press, runUpdates, wakeForDone } from '../hooks/session-host'
import type { CatchUpReply } from '../hooks/session-host'
import { allRows, COMPARE_LIMIT_MS, feedbackText, footerStatus, NO_HOLDS } from '../hooks/view'
import { demoSession, demoView, isDemoCopy } from '../hooks/demo'
import { fakeHost } from './session-fake-host'
import { runSessionScript } from './session-script'

test('one scripted session runs through the shared session functions', async () => {
  await runSessionScript(fakeHost, (actual, expected, label) => expect(actual, label).toEqual(expected))
})

test('a refused Done message leaves its row reading Not sent, with Undo', async () => {
  let clock = 1_000_000
  const scripted = fakeHost(async () => null).host
  const host = {
    ...scripted,
    now: () => clock,
    deliver: async () => ({ state: 'rejected' as const, reason: 'queue refused' }),
  }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'done', id }, false, NO_HOLDS)
  clock += host.settleWindowMs
  await wakeForDone(host)
  const view = sessionView(await host.read(), clock, host.settleWindowMs, true)

  expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual([{ error: 'queue refused', canUndo: true }])
})

test('Compare reads Comparing… after its reply until the agent records the question again with its page, or until its limit passes', async () => {
  const { host, delivered } = fakeHost(async () => 'NONE')
  const record = async (args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, 'record', args, await host.now())
      result = r.result
      return r.state
    })
    return result
  }
  const turn = async (prompt: string, reply: string) => {
    await host.update(s => notePrompt(CLAUDE_CODE, s, prompt, false).state)
    await host.update(s => endTurn(CLAUDE_CODE, s, reply, false))
    await runUpdates(host)
  }
  const question = {
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    design_choice: true,
  }
  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add caching to the API', false).state)
  await record(question)
  await host.update(s => endTurn(CLAUDE_CODE, s, 'Which cache should the API use?', false))
  await runUpdates(host)
  const id = (await host.read()).ledger.items[0]!.id
  const row = async (later = 0) => {
    const view = sessionView(await host.read(), (await host.now()) + later, host.settleWindowMs, true)
    const r = allRows(view).find(x => x.id === id)!

    return { feedback: r.feedback && feedbackText(r.feedback, 'terminal'), actions: r.actions.map(a => a.label) }
  }

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  })
  expect(await row(COMPARE_LIMIT_MS)).toEqual({
    feedback: 'No comparison came back',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  const reported = await record({ ...question, steps: ['/tmp/project/.scratch/compare/caches.html', 'npm test'] })
  expect(reported).toBe(
    'Already open, so this record updated it and added its new steps. Some steps were not an absolute file path or a link, so they are left out.',
  )
  expect(await row()).toEqual({
    feedback: '✓ Compared',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches again.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })
})

test('while a press is out, its button stays out and a second press sends nothing, even when a newer note shows on the row', async () => {
  const { host } = fakeHost(async () => null)
  const question = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, 1).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'explain', id }, false, NO_HOLDS)
  const s = await host.read()
  const at = await host.now()
  const explainOf = (notes: Record<string, RowNote>) => {
    const row = allRows(sessionView(s, at, host.settleWindowMs, true, NO_HOLDS, notes)).find(r => r.id === id)!
    const explain = row.actions.find(a => a.press.action === 'explain')!

    return { feedback: row.feedback?.is, label: explain.label, isOut: explain.isOut }
  }
  const again = pressOn(
    s,
    { action: 'explain', id },
    at,
    { settleWindowMs: host.settleWindowMs, holds: NO_HOLDS },
    host,
  )

  expect('stale' in again ? null : again.effects).toEqual([])
  expect(explainOf({})).toEqual({ feedback: 'working', label: 'Explain', isOut: true })
  expect(explainOf({ [id]: { note: 'stale', at } })).toEqual({ feedback: 'note', label: 'Explain', isOut: true })
})

test('a command that prints local URLs notes each once, and gh pr create links the PR it names', () => {
  const printed = 'Local: http://localhost:5173/app\nAlso http://localhost:5173/app and http://api.localhost:3000.\n'
  const served = noteCommandOutput(emptySession(), 'npm run dev', printed)
  expect(served.turn.activity).toEqual([
    'URL in output: http://localhost:5173/app',
    'URL in output: http://api.localhost:3000.',
  ])
  expect(served.ledger.prs).toEqual([])

  const opened = noteCommandOutput(served, 'gh pr create --fill', 'https://github.com/acme/app/pull/12\n')
  expect(opened.ledger.prs).toEqual(['acme/app#12'])
  expect(opened.turn.activity).toEqual(served.turn.activity)

  const echoed = noteCommandOutput(opened, 'echo done', 'https://github.com/acme/app/pull/99\n')
  expect(echoed).toBe(opened)
})

test('a PR already linked keeps its place when gh pr create names it again with a new one', () => {
  const linked = noteCommandOutput(emptySession(), 'gh pr create', 'https://github.com/acme/app/pull/1\n')
  const second = noteCommandOutput(linked, 'gh pr create', 'https://github.com/acme/app/pull/2\n')
  const again = noteCommandOutput(second, 'gh pr create', 'https://github.com/acme/app/pull/1\n')
  expect(again.ledger.prs).toEqual(['acme/app#1', 'acme/app#2'])
})

const LEDGER_REPLY = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'

const finishTurn = (s: Session, reply: string) =>
  endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, 'go', false).state, reply, false)

const reading = (reply: CatchUpReply, calls: { catchUps: number; asks: number }) => ({
  ask: async () => (calls.asks++, null),
  catchUp: async () => (calls.catchUps++, reply),
})

test('a failed update catches up over the whole conversation instead of retrying its exchange', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => {
    const finished = finishTurn(s, 'Which runtime?')

    return { ...finished, presence: { ...finished.presence, ledgerState: 'failed' as const } }
  })
  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: 'Person: go', overview: async () => null }, calls),
  })

  const after = await host.read()
  expect(calls).toEqual({ catchUps: 1, asks: 0 })
  expect(after.pending).toEqual([])
  expect(after.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
  expect(after.presence).toMatchObject({ ledgerState: 'current', turnsApplied: 1, isUpdating: false })
})

test('a conversation that cannot be read runs the pending exchanges, and ends the run when none are left', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => LEDGER_REPLY)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({ ...host, catchUp: reading({ kind: 'unreadable' }, calls).catchUp })
  expect(calls.catchUps).toBe(1)
  expect((await host.read()).presence.isUpdating).toBe(false)

  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: reading({ kind: 'unreadable' }, calls).catchUp })
  expect(calls.catchUps).toBe(2)
  expect((await host.read()).ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
})

test('a catch-up that gets no usable answer ends the run, and the next update tries it again', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: 'not a ledger', source: null, overview: async () => null }, calls),
  })
  expect(calls.catchUps).toBe(1)
  expect((await host.read()).presence.ledgerState).toBe('failed')

  await runUpdates({ ...host, ...reading({ kind: 'failed' }, calls) })
  expect(calls.catchUps).toBe(2)
})

test('an exchange that ends during a catch-up is still run afterward', async () => {
  const { host } = fakeHost(async () => LEDGER_REPLY)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({
    ...host,
    catchUp: async () => {
      await host.update(s => finishTurn(s, 'Which runtime?'))
      return { kind: 'reply', text: 'NONE', source: null, overview: async () => null }
    },
  })

  const after = await host.read()
  expect(after.pending).toEqual([])
  expect(after.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
})

test('a dropped reply keeps the warning through later good updates, until a catch-up covers it', async () => {
  const calls = { catchUps: 0, asks: 0 }
  let answer: string | null = null
  const { host } = fakeHost(async () => answer)
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates(host)
  await runUpdates(host)
  expect((await host.read()).pending).toEqual([])
  expect((await host.read()).presence).toMatchObject({ ledgerState: 'failed', hasDroppedReply: true })

  answer = LEDGER_REPLY
  await host.update(s => finishTurn(s, 'Done.'))
  await runUpdates(host)
  const kept = await host.read()
  expect(kept.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
  const retryPromise = 'retries after your next message'
  expect(sessionView(kept, 0, host.settleWindowMs, false).status.error).toContain('Last update failed')
  expect(sessionView(kept, 0, host.settleWindowMs, false).status.error).not.toContain(retryPromise)
  expect(sessionView(kept, 0, host.settleWindowMs, true).status.error).toContain(retryPromise)

  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null, overview: async () => null }, calls),
  })
  expect((await host.read()).presence).toMatchObject({ ledgerState: 'current', hasDroppedReply: false })
  expect(calls.catchUps).toBe(1)
})

test('the conversation keeps its newest lines when it is too long, and leaves out the inbox notes', () => {
  const long = 'x'.repeat(6000)
  const turns = Array.from({ length: 20 }, (_, i) => [
    { role: 'person' as const, text: `question ${i}`, activity: [] },
    { role: 'agent' as const, text: long, activity: [`ran: step ${i}`] },
  ]).flat()
  const text = flattenConversation([{ role: 'person', text: 'inbox: nothing waits', activity: [] }, ...turns])

  expect(text.startsWith('(earlier conversation left out)')).toBe(true)
  expect(text.endsWith('Agent ran: step 19')).toBe(true)
  expect(text).not.toContain('inbox: nothing waits')
})

const answer = parseOverview('GOAL: Work offline\nNEW: working | Offline mode | queue built')!

const withOverview = (s: Session): Session => ({
  ...s,
  ledger: { ...EMPTY, overview: applyOverview(null, answer, 1000) },
})

test('an Overview answer is written to the ledger after later updates and clears a saved failure, and both are dropped when their update is gone', () => {
  const later = { ...emptySession(), presence: { ...emptySession().presence, turnsApplied: 5 } }
  const failed = failedOverview(later, 'The person wants a CLI.', 3, 900)

  expect(failed.overviewFailure).toEqual({ at: 900, cause: 'refused', answer: 'The person wants a CLI.' })
  expect(failedOverview(later, null, 3, 900).overviewFailure).toEqual({ at: 900, cause: 'no-answer', answer: null })
  expect(appliedOverview(failed, answer, 3, 1000).ledger.overview?.goal).toBe('Work offline')
  expect(appliedOverview(failed, answer, 3, 1000).overviewFailure).toBeNull()
  expect(appliedOverview(emptySession(), answer, 3, 1000).ledger.overview).toBeNull()
  expect(failedOverview(emptySession(), null, 3, 900).overviewFailure).toBeNull()
  expect(cleared(failed).overviewFailure).toBeNull()
})

test('a session whose only record is an Overview has a ledger, is not unseen, is copied by a fork and is cleared', () => {
  const parent = withOverview(emptySession())
  const onlyChildren = withChild(
    null,
    { ref: 't1', kind: 'subagent', name: 'Review', startedAt: 1, endedAt: null, lastActivityAt: 1 },
    1,
  )

  expect(hasLedger(emptySession())).toBe(false)
  expect(isUnseen(emptySession())).toBe(true)
  expect(hasLedger(parent)).toBe(true)
  expect(isUnseen(parent)).toBe(false)
  expect(hasLedger({ ...emptySession(), ledger: { ...EMPTY, overview: onlyChildren } })).toBe(false)
  expect(forkedFrom(emptySession(), parent).ledger.overview).toEqual(parent.ledger.overview)
  expect(cleared(parent).ledger.overview).toBeNull()
})

test('the Overview page is empty for a new session, reads Working… while the main turn runs, and the last reply after', () => {
  const view = (s: Session) => sessionView(s, 10_000, 1000, true, NO_HOLDS).overviewPage
  const idle = emptySession()

  expect(view(idle).isEmpty).toBe(true)
  expect(view(turnStarted(idle, 9_000)).isEmpty).toBe(false)
  expect(view(turnStarted(idle, 9_000)).live).toBe('Working…')
  expect(view(turnEnded(turnStarted(idle, 9_000), 9_500)).live).toBe('Idle · last reply just now')
  expect(view(withOverview(idle)).goal).toBe('Work offline')
  expect(view(idle).error).toBeNull()
})

test('a failed Overview call shows in the status line on the Overview tab, in place of a failed update, and on no other tab', () => {
  const failed = failedOverview(
    { ...emptySession(), presence: { ...emptySession().presence, ledgerState: 'failed' } },
    null,
    0,
    900,
  )
  const v = sessionView(failed, 1000, 1000, true, NO_HOLDS)
  const prs = { isFetching: false, hasPrs: false }

  expect(v.overviewPage.error).not.toBeNull()
  expect(footerStatus('overview', v.status, prs, v.overviewPage.error).error).toBe(v.overviewPage.error)
  expect(footerStatus('needsYou', v.status, prs, v.overviewPage.error).error).toBe(v.status.error)
  expect(footerStatus('prs', v.status, prs, v.overviewPage.error).error).toBeNull()
})

test('the Overview page draws each status with its mark and tone', () => {
  const statuses = ['working', 'queued', 'waits-on-you', 'waits-on-other', 'problem'] as const
  const opened = applyOverview(
    null,
    parseOverview(statuses.map((st, n) => `NEW: ${st} | Part ${n} | step`).join('\n'))!,
    1000,
  )
  const closed = applyOverview(opened, parseOverview('DONE: s1 | built')!, 2000)
  const rows = sessionView(
    { ...emptySession(), ledger: { ...EMPTY, overview: closed } },
    3000,
    1000,
    true,
    NO_HOLDS,
  ).overviewPage.rows.flatMap(r => (r.kind === 'subject' ? [[r.name, r.mark, r.tone]] : []))

  expect(rows).toEqual([
    ['Part 0', '✓', 'done'],
    ['Part 1', '○', null],
    ['Part 2', '◆', 'needsYou'],
    ['Part 3', '◌', null],
    ['Part 4', '!', 'issue'],
  ])
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

test('a sample saved without an Overview is replaced, and the sample session carries its own', () => {
  const old = demoView(1_000_000, 'Claude')

  expect(isDemoCopy(old)).toBe(true)
  expect(isDemoCopy({ ...old, presence: { isTurnRunning: false } })).toBe(true)
  expect(isDemoCopy({ ...old, ledger: { ...old.ledger, overview: undefined } })).toBe(false)
  const page = sessionView(demoSession(1_000_000, 'Claude'), 1_000_000, 1000, true, NO_HOLDS).overviewPage
  expect(page.identity).toBe('visor · pinch-dismiss')
  expect(page.goal).toBe('Pinch to dismiss glances')
  expect(page.rows.map(r => r.kind)).toEqual([
    'subject',
    'child',
    'child',
    'subject',
    'child',
    'subject',
    'subject',
    'look',
    'subject',
    'fold',
  ])
})

test('a conversation start carries the goal and where each open subject stands, not on a resume the guidance, and nothing for an empty session', () => {
  const described = emptySession()
  const ledger = { ...described.ledger, overview: applyOverview(null, answer, 1000) }
  const carried = startContext(CLAUDE_CODE, { ...described, ledger }, 'resume')
  expect(carried).toContain('Working on: Work offline')
  expect(carried).toContain('- Offline mode: queue built (working)')
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
