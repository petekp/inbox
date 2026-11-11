import { afterEach, beforeEach, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { NO_HOLDS } from '../../hooks/timing'
import { createInbox } from '../src/host'
import { stopOf } from '../src/omp-messages'
import { reportedLabels, reportedTokens } from '../../tests/session-script'
import {
  call,
  deps,
  endAgent,
  endWorld,
  makeCtx,
  pi,
  prompt,
  record,
  settle,
  startWorld,
  state,
  w,
} from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

test('Done schedules the wake and the wake tells the agent after the settle window', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await endAgent('Done.')
  await settle()
  const id = state().ledger.items[0].id
  const outcome = await inbox.press(makeCtx(), { action: 'done', id }, NO_HOLDS)
  expect(outcome.wakesAfterSettle).toBe(true)
  expect(w.timers).toHaveLength(1)
  expect(w.timers[0]!.ms).toBeGreaterThan(1000)
  expect(w.sent).toEqual([])

  w.clock += 5000
  w.timers[0]!.fn()
  await settle()
  expect(w.sent).toHaveLength(1)
  expect(w.sent[0]!.text).toContain('Try the CLI by hand')
  expect(state().sent.map((x: { phase: string }) => x.phase)).toEqual(['accepted'])
})

test('a turn runs from agent_start to the run’s end, and a Done message waits for Esc to end the run', async () => {
  const inbox = createInbox(pi(), deps())
  const now = async () => (state().presence.isTurnRunning ? 'running' : null)
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await endAgent('Done.')
  await settle()
  await inbox.press(makeCtx(), { action: 'done', id: state().ledger.items[0].id }, NO_HOLDS)
  await call('agent_start', { type: 'agent_start' })
  expect(await now()).toBe('running')

  w.clock += 5000
  w.timers[0]!.fn()
  await settle()
  expect(w.sent).toEqual([])
  await endAgent('', { willContinue: true })
  expect(await now()).toBe('running')

  await endAgent('', { messages: [{ role: 'assistant', content: [], stopReason: 'aborted' }] })
  await settle()
  expect(await now()).toBeNull()
  expect(w.sent).toHaveLength(1)
  expect(w.sent[0]!.text).toContain('Try the CLI by hand')
})

const endOnError = (fields: Record<string, unknown>) =>
  call('agent_end', {
    type: 'agent_end',
    messages: [{ role: 'assistant', content: [], stopReason: 'error', ...fields }],
  })

test('a turn that ends on an error saves why it stopped, queues no exchange, and the next turn clears it', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await call('message_end', { message: { role: 'assistant', content: [{ type: 'text', text: 'Should I use Node?' }] } })
  await endOnError({ errorStatus: 401, errorMessage: 'invalid x-api-key' })
  await settle()
  expect((await inbox.screen(makeCtx())).stop).toMatchObject({ kind: 'sign-in', detail: '401' })
  expect(w.completions).toEqual([])
  await call('turn_start', { type: 'turn_start' })
  expect(state().stop).toBeNull()
})

const herdrReports = () =>
  w.execCalls
    .filter(c => c.command === 'herdr')
    .map(c => ({ target: c.args.slice(0, 5).join(' '), tokens: reportedTokens(c.args) }))

test('in a Herdr app terminal, the shown session is published and labelled, a switch moves both, and shutdown removes them', async () => {
  const appHome = join(w.dir, 'herdr-app')
  const target = { kind: 'terminal', terminal: 't1', appHome, hc: ['hc'] } as const
  createInbox(pi(), { ...deps(), herdrTarget: target })
  const labels = () => reportedLabels(['hc', ...w.execCalls.filter(c => c.command === 'hc').at(-1)!.args])
  const published = (id: string) => join(appHome, 'inbox/sessions', `${id}.json`)

  await call('session_start', { type: 'session_start' })
  await settle()
  expect(labels()).toMatchObject({ 'inbox.session': 's1', 'inbox.needs-you': '' })
  expect(JSON.parse(readFileSync(published('s1'), 'utf8'))).toMatchObject({ format: 1, host: 'omp', terminal: 't1' })

  await record({ kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await settle()
  expect(labels()).toMatchObject({ 'inbox.session': 's1', 'inbox.needs-you': '1', 'inbox.status': 'Ship it?' })
  expect(JSON.parse(readFileSync(published('s1'), 'utf8')).session.ledger.items).toHaveLength(1)

  await call('session_switch', { type: 'session_switch', reason: 'resume' }, makeCtx('s2'))
  await settle()
  expect(labels()).toMatchObject({ 'inbox.session': 's2', 'inbox.needs-you': '' })
  expect(readdirSync(join(appHome, 'inbox/sessions'))).toEqual(['s2.json'])

  await call('session_shutdown', { type: 'session_shutdown' }, makeCtx('s2'))
  expect(labels()).toMatchObject({ 'inbox.session': '', 'inbox.status': '' })
  expect(readdirSync(join(appHome, 'inbox/sessions'))).toEqual([])
})

test('in a Herdr pane, each change reports the tab counts, a stop replaces them until it clears, and shutdown clears every token', async () => {
  createInbox(pi(), { ...deps(), herdrTarget: { kind: 'pane', pane: 'p1' } })
  const cleared = {
    inbox: null,
    'inbox-stop': null,
    'inbox-focus': null,
    'inbox-needs-you': null,
    'inbox-findings': null,
    'inbox-prs': null,
  }
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(herdrReports().at(-1)).toEqual({ target: 'pane report-metadata p1 --source inbox', tokens: cleared })

  await record({ kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await record({ kind: 'finding', title: 'The retry loop never ends', detail: 'It retries forever on a 401.' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toEqual({
    ...cleared,
    inbox: 'Ship it?',
    'inbox-needs-you': '1',
    'inbox-findings': '1',
  })

  await endOnError({ errorStatus: 401, errorMessage: 'invalid x-api-key' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toEqual({
    ...cleared,
    inbox: '! Signed out: /login',
    'inbox-stop': '! Signed out: /login',
  })
  await call('turn_start', { type: 'turn_start' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toMatchObject({
    'inbox-stop': null,
    'inbox-needs-you': '1',
    'inbox-findings': '1',
  })

  const reports = herdrReports().length
  await record({ kind: 'task', ask: 'Sign in again' }, makeCtx('other'))
  await settle()
  expect(herdrReports()).toHaveLength(reports)

  await call('session_shutdown', { type: 'session_shutdown' })
  expect(herdrReports().at(-1)?.tokens).toEqual(cleared)
})

test('a stop is a usage limit, a sign-in or an API error, from the failed message', async () => {
  const isUsageLimit = deps().isUsageLimit
  const kindOf = async (fields: Record<string, unknown>) =>
    stopOf({ role: 'assistant', content: [], stopReason: 'error', ...fields }, isUsageLimit, 5)
  expect(await kindOf({ errorStatus: 429, errorMessage: 'You have hit your usage limit' })).toMatchObject({
    kind: 'usage-limit',
  })
  expect(await kindOf({ errorStatus: 403, errorMessage: 'forbidden' })).toMatchObject({ kind: 'sign-in' })
  expect(await kindOf({ errorStatus: 529, errorMessage: 'Overloaded' })).toMatchObject({
    kind: 'api-error',
    detail: 'overloaded',
  })
  expect(await kindOf({ errorMessage: 'socket hang up\nat fetch' })).toMatchObject({
    kind: 'api-error',
    detail: 'socket hang up',
  })
  expect(await stopOf({ role: 'assistant', content: [], stopReason: 'aborted' }, isUsageLimit, 5)).toBeNull()
})

test('Resume sends Continue to the agent', async () => {
  const inbox = createInbox(pi(), deps())
  w.isIdle = true
  expect(await inbox.resume(makeCtx())).toBeNull()
  expect(w.sent).toEqual([{ text: 'Continue', options: undefined }])
})

test('a subagent runs as a child from its started frame to its end, its progress moves its activity, and a new session start ends one left running', async () => {
  createInbox(pi(), deps())
  type Saved = { name: string; endedAt: number | null; lastActivityAt: number }
  const children = (): Saved[] => state().ledger.overview.children
  const running = () => children().map(c => [c.name, c.endedAt === null])
  await call('session_start', { type: 'session_start' })
  await call('task:subagent:lifecycle', { id: 'Scout', agent: 'task', description: 'Map the repo', status: 'started' })
  expect(running()).toEqual([['Map the repo', true]])
  const startedActivity = children()[0]!.lastActivityAt
  w.clock += 60_000
  await call('task:subagent:progress', { progress: { id: 'Scout' } })
  expect(children()[0]!.lastActivityAt).toBeGreaterThan(startedActivity + 60_000 - 1)
  await call('task:subagent:lifecycle', { id: 'Scout', agent: 'task', status: 'completed' })
  expect(running()).toEqual([['Map the repo', false]])

  await call('task:subagent:lifecycle', { id: 'Reader', agent: 'task', status: 'started' })
  await call('session_start', { type: 'session_start' })
  expect(running()).toEqual([
    ['Map the repo', false],
    ['task', false],
  ])
})

test('a Herdr report that failed before the person switched sessions is retried with the session now shown', async () => {
  const retries: (() => Promise<unknown>)[] = []
  createInbox(pi(), {
    ...deps(),
    herdrTarget: { kind: 'pane', pane: 'p1' },
    after: (_ms, retry) => void retries.push(retry),
  })
  await call('session_start', { type: 'session_start' })
  await settle()
  w.execResults.set('herdr', { code: 1 })
  await record({ kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await settle()
  expect(herdrReports().at(-1)?.tokens.inbox).toBe('Ship it?')
  expect(retries).toHaveLength(1)

  await call('session_switch', { type: 'session_switch', reason: 'new' }, makeCtx('s2'))
  await settle()
  w.execResults.delete('herdr')
  const reports = herdrReports().length
  await retries.shift()!()

  expect(herdrReports()).toHaveLength(reports + 1)
  expect(herdrReports().at(-1)?.tokens).toMatchObject({ inbox: null, 'inbox-needs-you': null })
})

test('a Herdr delegate runs as a child from the bash call that starts it until a wait on it returns, or Herdr shows it no longer working at the turn’s end', async () => {
  createInbox(pi(), deps())
  const delegates = () =>
    state().ledger.overview.children.map((c: { name: string; endedAt: number | null }) => [c.name, c.endedAt === null])
  const bash = (command: string) => call('tool_result', { toolName: 'bash', input: { command } })
  await prompt('Hand it off')
  await bash('herdr agent start fixer --cmd omp')
  await bash('herdr agent start reviewer --cmd omp && herdr agent start helper --cmd omp')
  expect(delegates()).toEqual([
    ['fixer', true],
    ['reviewer', true],
    ['helper', true],
  ])
  await bash('herdr agent wait fixer')
  expect(delegates()[0]).toEqual(['fixer', false])
  w.clock += 60_000
  await bash('herdr agent prompt scout "look around"')
  w.clock += 5_000
  const agents = [
    { name: 'reviewer', agent_status: 'idle' },
    { name: 'helper', agent_status: 'working' },
    { name: 'scout', agent_status: 'idle' },
  ]
  w.execResults.set('herdr', { code: 0, stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents } }) })
  await endAgent('Done.')
  expect(w.execCalls.filter(c => c.command === 'herdr').map(c => c.args)).toEqual([['agent', 'list']])
  expect(delegates()).toEqual([
    ['fixer', false],
    ['reviewer', false],
    ['helper', true],
    ['scout', true],
  ])
})

test('the agent task list at a reply is the latest todo entry on the branch, including a /todo edit and a deleted list', async () => {
  createInbox(pi(), deps())
  const todo = (op: string, tasks: { content: string; status: string }[]) => ({
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'todo',
      isError: false,
      details: { op, phases: [{ name: 'Fix', tasks }] },
    },
  })
  w.branch = [
    todo('add', [
      { content: 'Read the parser', status: 'completed' },
      { content: 'Fix it', status: 'in_progress' },
    ]),
  ]
  await prompt('hello')
  await endAgent('Working.')
  await settle()
  expect(state().hostTasks).toEqual([
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix it', status: 'in-progress' },
  ])

  w.branch.push({
    type: 'custom',
    customType: 'user_todo_edit',
    data: { phases: [{ name: 'Fix', tasks: [{ content: 'Fix it', status: 'pending' }] }] },
  })
  await prompt('again')
  await endAgent('Still working.')
  await settle()
  expect(state().hostTasks).toEqual([{ id: '1', text: 'Fix it', status: 'pending' }])

  w.branch = []
  await prompt('and again')
  await endAgent('Done.')
  await settle()
  expect(state().hostTasks).toEqual([])
})
