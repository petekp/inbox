import { expect, test } from 'claude-code/testing'

import { flattenConversation } from '../hooks/conversation'
import { EMPTY, applyUpdate, listResults, parseReply, upgradeLedger } from '../hooks/ledger'
import { CLAUDE_CODE } from '../hooks/model-text'
import {
  appliedCatchUp,
  cleared,
  emptySession,
  endTurn,
  forkedFrom,
  hasLedger,
  isUnseen,
  noteCommandOutput,
  notePrompt,
  pressOn,
  recordPrompt,
  recorded,
  sessionView,
  turnEnded,
  turnStarted,
  upgradeSession,
} from '../hooks/session'
import type { Session } from '../hooks/session'
import { press, runUpdates, wakeForDone } from '../hooks/session-host'
import type { CatchUpReply } from '../hooks/session-host'
import { NO_HOLDS } from '../hooks/view'
import { demoSession, demoView, isDemoCopy, upgradeDemoCopy } from '../hooks/demo'
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

const LEDGER_REPLY =
  'GOAL: Add a greeting CLI\nNOW: Waiting on one choice\nNEW: decide | 1 | Use Node or Python? | Node / Python | Node'

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
  await runUpdates({ ...host, ...reading({ kind: 'reply', text: LEDGER_REPLY, source: 'Person: go' }, calls) })

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
  await runUpdates({ ...host, ...reading({ kind: 'reply', text: 'not a ledger', source: null }, calls) })
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
      return { kind: 'reply', text: 'GOAL: Add a greeting CLI', source: null }
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

  await runUpdates({ ...host, ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null }, calls) })
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

const withMilestone = (s: Session): Session => ({
  ...s,
  ledger: {
    ...EMPTY,
    milestones: [{ id: 'm1', source: 'done', text: 'Reducer built', detail: null, ref: null, at: 5 }],
  },
})

test('a catch-up writes up to six results with no time, and an update after one reply keeps three', () => {
  const lines = [1, 2, 3, 4, 5, 6, 7].map(n => `DONE: Result number ${n}`).join('\n')
  const parsed = parseReply(`GOAL: g\n${lines}`)!
  const caught = appliedCatchUp(emptySession(), emptySession(), parsed, 100)

  expect(caught.ledger.milestones.map(m => [m.text, m.at])).toEqual(
    [2, 3, 4, 5, 6, 7].map(n => [`Result number ${n}`, null]),
  )
  expect(applyUpdate(EMPTY, parsed, 100, 0).milestones).toHaveLength(3)
})

test('a session whose only record is a result has a ledger, is not unseen, is copied by a fork and is cleared', () => {
  const parent = withMilestone(emptySession())

  expect(hasLedger(emptySession())).toBe(false)
  expect(isUnseen(emptySession())).toBe(true)
  expect(hasLedger(parent)).toBe(true)
  expect(isUnseen(parent)).toBe(false)
  expect(forkedFrom(emptySession(), parent).ledger.milestones).toEqual(parent.ledger.milestones)
  expect(cleared(parent).ledger.milestones).toEqual([])
})

test('a ledger saved with milestones, then updated by 0.2.10, keeps the result 0.2.10 wrote', () => {
  const saved = applyUpdate(EMPTY, parseReply('GOAL: g\nDONE: Reducer built')!, 5, 0)
  const byOlderBuild = { ...saved, card: { ...saved.card!, done: [...saved.card!.done, 'Tests added'] } }
  const upgraded = upgradeLedger(byOlderBuild)

  expect(upgraded.milestones.map(m => [m.text, m.at])).toEqual([
    ['Tests added', null],
    ['Reducer built', 5],
  ])
})

const subagent = (over: Partial<Session['subagents'][number]>): Session['subagents'][number] => ({
  id: 'a1',
  task: 'Find the handler',
  state: 'running',
  toolStep: 'Reading handler.ts',
  statedStep: null,
  result: null,
  startedAt: 1_000,
  at: 5_000,
  transcriptPath: null,
  ...over,
})

test('the progress page is empty for a new session and reads Working… only while the main turn runs', () => {
  const view = (s: Session) => sessionView(s, 10_000, 1000, true, NO_HOLDS).progressPage
  const idle = emptySession()

  expect(view(idle).isEmpty).toBe(true)
  expect(view(turnStarted(idle)).isEmpty).toBe(false)
  expect(view(turnStarted(idle)).now).toBe('Working…')
  expect(view(turnEnded(turnStarted(idle))).now).toBeNull()
  expect(
    view({ ...turnStarted(idle), presence: { ...idle.presence, isTurnRunning: true, statedStep: 'Reading x' } }).now,
  ).toBe('Reading x')
  expect(
    turnEnded({ ...idle, presence: { ...idle.presence, isTurnRunning: true, statedStep: 'Reading x' } }).presence,
  ).toMatchObject({
    isTurnRunning: false,
    statedStep: null,
  })
})

test('the progress page lists subagents with their step or result, and results with the done tone', () => {
  const ledger = applyUpdate(EMPTY, parseReply('GOAL: g\nDONE: Reducer built')!, 5_000, 0)
  const s: Session = {
    ...emptySession(),
    ledger,
    subagents: [
      subagent({}),
      subagent({ id: 'a2', task: 'Run tests', state: 'done', result: 'All pass', startedAt: 2_000, at: 8_000 }),
      subagent({ id: 'a3', task: 'Lint', state: 'stopped', at: 9_000 }),
      subagent({ id: 'a4', task: 'Docs', statedStep: 'Writing the intro' }),
    ],
  }
  const page = sessionView(s, 10_000, 1000, true, NO_HOLDS).progressPage

  expect(page.subagents?.rows.map(r => [r.text, r.mark, r.detail])).toEqual([
    ['Find the handler', '●', 'Reading handler.ts'],
    ['Run tests', '✓', 'All pass'],
    ['Lint', '✕', null],
    ['Docs', '●', 'Writing the intro'],
  ])
  expect(page.milestones?.rows.map(r => [r.text, r.tone])).toEqual([['Reducer built', 'done']])
})

test('a session saved before the progress fields reads with them empty; a fork and a clear leave the running turn alone', () => {
  const saved = { ...emptySession(), presence: { turnsStarted: 2 } } as never
  const loaded = upgradeSession(saved)

  expect(loaded.subagents).toEqual([])
  expect(loaded.presence).toMatchObject({ turnsStarted: 2, isTurnRunning: false, statedStep: null })
  const running = { ...turnStarted(emptySession()), subagents: [subagent({})] }
  expect(forkedFrom(emptySession(), running).subagents).toEqual([])
  expect(forkedFrom(emptySession(), running).presence.isTurnRunning).toBe(false)
  expect(cleared(running)).toMatchObject({ subagents: [], presence: { isTurnRunning: false, statedStep: null } })
})

test('a sample saved without the progress fields is kept with them empty, and the sample session carries its own', () => {
  const { subagents: _s, presence: _p, ...old } = demoView(1_000_000)

  expect(isDemoCopy(old)).toBe(true)
  expect(upgradeDemoCopy(old)).toMatchObject({ subagents: [], presence: { isTurnRunning: false, statedStep: null } })
  const session = demoSession(1_000_000)
  const page = sessionView(session, 1_000_000, 1000, true, NO_HOLDS).progressPage
  expect(page.subagents?.rows.map(r => r.mark)).toEqual(['●', '✓'])
  expect(page.milestones?.rows.map(r => r.detail)).toEqual([
    null,
    null,
    null,
    'You answered: Wristband',
    'Fixed: It now redraws only the glance that changed',
  ])
  expect(page.now).toBe('Wiring the pinch into the dismiss animation')
})

test('two quick button answers and a typed message between them each get the turn their own message starts', () => {
  const asked = applyUpdate(
    { ...EMPTY, turn: 3 },
    parseReply(
      'GOAL: g\nNEW: decide | 1 | Which license should the CLI use? | MIT / Apache-2.0 | MIT\nNEW: decide | 2 | Which port should the server use? | 8080 / 9090 | 8080',
    )!,
    1,
    3,
  )
  const answers = pressOn({ ...emptySession(), ledger: asked }, { action: 'answer', id: 'i1', option: 'MIT' }, 5)
  if ('stale' in answers) throw new Error('stale')
  const both = pressOn({ ...emptySession(), ledger: answers.ledger }, { action: 'answer', id: 'i2', option: '8080' }, 6)
  if ('stale' in both) throw new Error('stale')
  const arrive = (s: Session, press: { id: string; action: 'answer' } | null) =>
    recordPrompt(CLAUDE_CODE, s, 'message', false, press ? { press } : null).state
  const first = arrive({ ...emptySession(), ledger: both.ledger }, { id: 'i1', action: 'answer' })
  const typed = arrive(first, null)
  const second = arrive(typed, { id: 'i2', action: 'answer' })

  expect(second.ledger.milestones.map(m => [m.ref, m.turn])).toEqual([
    ['i1', 4],
    ['i2', 6],
  ])
  const done = (turn: number, text: string) =>
    applyUpdate({ ...second.ledger, turn }, parseReply(`GOAL: g\nDONE: ${text}`)!, 9, turn, 9)
  const reply = done(6, 'Opened port 8080 for the server')
  expect(listResults(reply.milestones).map(r => [r.ref, r.merged])).toEqual([
    ['i2', ['Opened port 8080 for the server']],
    ['i1', []],
  ])
})
