import { afterEach, beforeEach, expect, test } from 'bun:test'

import { NO_HOLDS } from '../../hooks/timing'
import { createInbox } from '../src/host'
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

async function withQuestion() {
  const inbox = createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  const [item] = state().ledger.items
  return { inbox, id: item.id as string }
}

test('only what the person submits in the editor counts as a typed message, not a press’s message or other input', async () => {
  const { inbox, id } = await withQuestion()
  const typedAt = () => state().presence.lastTypedMessageAt
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  await prompt(w.sent[0]!.text)
  await call('input', { type: 'input', text: 'from a client', source: 'rpc' })
  await call('input', { type: 'input', text: 'from an extension', source: 'extension' })
  expect(typedAt()).toBeNull()

  await call('input', { type: 'input', text: 'what next?', source: 'interactive' })
  const first = typedAt()
  expect(first).toBeNumber()
  await call('input', { type: 'input', text: 'and then?', source: 'interactive' })
  expect(typedAt()).toBeGreaterThan(first!)
})

test('an answer press sends one follow-up while a turn runs, and the arriving prompt matches it', async () => {
  const { inbox, id } = await withQuestion()
  const outcome = await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  expect(outcome).toEqual({
    copy: null,
    error: null,
    note: null,
    isUnconfirmed: false,
    isRowFailed: false,
    wakesForDone: false,
  })
  expect(w.sent).toEqual([{ text: 'Re "Use Node or Python?": Node', options: { deliverAs: 'followUp' } }])
  expect(state().sent.map((x: { phase: string }) => x.phase)).toEqual(['accepted'])

  await prompt(w.sent[0]!.text)
  expect(state().sent).toEqual([])
  expect(state().turn.press).toMatchObject({ id, action: 'answer' })
  const screen = await inbox.screen(makeCtx())
  expect(screen.view.lastActions[id]?.delivery?.state).toBe('arrived')
})

test('a follow-up that starts inside a running turn matches its press once', async () => {
  const { inbox, id } = await withQuestion()
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  const started = {
    type: 'message_start',
    message: { role: 'user', content: [{ type: 'text', text: w.sent[0]!.text }] },
  }
  await call('message_start', started)
  expect(state().sent).toEqual([])
  expect(state().presence.turnsStarted).toBe(2)
  expect(state().turn.press).toMatchObject({ id, action: 'answer' })
  expect((await inbox.screen(makeCtx())).view.lastActions[id]?.delivery?.state).toBe('arrived')

  await call('message_start', started)
  expect(state().presence.turnsStarted).toBe(2)
})

const userMessage = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
const assistantMessage = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }] })

test('a press queued during a turn gets its own update, after one for the reply the turn gave before it', async () => {
  const { inbox, id } = await withQuestion()
  const opened = 'Opened https://github.com/acme/app/pull/12 for the fix.'
  await prompt('Open a PR for the fix')
  await call('agent_start', { type: 'agent_start' })
  await call('message_end', { type: 'message_end', message: assistantMessage(opened) })
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  const pressed = w.sent[0]!.text
  await prompt(pressed)
  await call('message_start', { type: 'message_start', message: userMessage(pressed) })
  expect(state().ledger.prs).toEqual(['acme/app#12'])

  await call('message_end', { type: 'message_end', message: assistantMessage('Using Node.') })
  await call('agent_end', {
    type: 'agent_end',
    messages: [
      userMessage('Open a PR for the fix'),
      assistantMessage(opened),
      userMessage(pressed),
      assistantMessage('Using Node.'),
    ],
  })
  await settle()
  expect(w.completions).toHaveLength(3)
  expect(w.completions[1]!.prompt).toContain(opened)
  expect(w.completions[1]!.prompt).not.toContain(pressed)
  expect(w.completions[2]!.prompt).toContain(pressed)
  expect(w.completions[2]!.prompt).toContain('Using Node.')
  expect(w.completions[2]!.prompt).not.toContain(opened)
  expect(state().pending).toEqual([])
  expect(state().presence).toMatchObject({ turnsStarted: 3, turnsApplied: 3, isTurnRunning: false })
})

test('two presses that start before any new reply share one turn and its reply', async () => {
  const { inbox, id } = await withQuestion()
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const task = state().ledger.items.find((i: { kind: string }) => i.kind === 'task').id
  await prompt('Add a test')
  await call('agent_start', { type: 'agent_start' })
  await call('message_end', { type: 'message_end', message: assistantMessage('Test added.') })
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  await inbox.press(makeCtx(), { action: 'explain', id: task }, NO_HOLDS)
  const answered = w.sent[0]!.text
  const explained = w.sent[1]!.text
  await call('message_start', { type: 'message_start', message: userMessage(answered) })
  await call('message_start', { type: 'message_start', message: userMessage(explained) })
  await call('message_end', { type: 'message_end', message: assistantMessage('Both handled.') })
  await endAgent('Both handled.')
  await settle()
  expect(w.completions).toHaveLength(3)
  expect(w.completions[1]!.prompt).toContain('Test added.')
  expect(w.completions[2]!.prompt).toContain(answered)
  expect(w.completions[2]!.prompt).toContain(explained)
  expect(w.completions[2]!.prompt).toContain('Both handled.')
  expect(w.completions[2]!.prompt).not.toContain('Test added.')
})

test('a message that arrives after the agent’s tool calls, before it replies, stays in the running turn', async () => {
  createInbox(pi(), deps())
  await prompt('Add a test')
  await call('agent_start', { type: 'agent_start' })
  await call('message_end', {
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Running the tests.' }, { type: 'toolCall' }] },
  })
  await prompt('Also run the linter')
  await call('message_end', { type: 'message_end', message: assistantMessage('Tests and lint pass.') })
  await endAgent('Tests and lint pass.')
  await settle()
  expect(w.completions).toHaveLength(1)
  expect(w.completions[0]!.prompt).toContain('Add a test')
  expect(w.completions[0]!.prompt).toContain('Also run the linter')
  expect(w.completions[0]!.prompt).toContain('Tests and lint pass.')
})

test('a user message that no press sent is left to before_agent_start', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await call('message_start', { type: 'message_start', message: { role: 'user', content: 'hello' } })
  await call('message_start', { type: 'message_start', message: { role: 'assistant', content: [] } })
  expect(state().presence.turnsStarted).toBe(1)
})

test('a press while the agent is idle sends the message with no delivery option', async () => {
  const { inbox, id } = await withQuestion()
  w.isIdle = true
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  expect(w.sent[0]!.options).toBeUndefined()
})

test('a press for a row that is gone reports it stale and sends nothing', async () => {
  const { inbox } = await withQuestion()
  const outcome = await inbox.press(makeCtx(), { action: 'answer', id: 'nope', option: 'Node' }, NO_HOLDS)
  expect(outcome.note).toBe('stale')
  expect(w.sent).toEqual([])
})

async function withSteps() {
  const inbox = createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Run it and read the page', steps: ['npm start', 'https://example.com/x'] })
  const screen = await inbox.screen(makeCtx())
  const row = screen.view.needsYou.tasks[0]!
  const stepPress = (index: number) => ({
    action: 'step' as const,
    id: row.id,
    step: index,
    label: row.steps[index]!.label,
  })
  return { inbox, stepPress }
}

test('a copy step hands the command to the clipboard and reports the copy', async () => {
  const { inbox, stepPress } = await withSteps()
  const outcome = await inbox.press(makeCtx(), stepPress(0), NO_HOLDS)
  expect(w.copied).toEqual(['npm start'])
  expect(outcome.copy).toMatchObject({ text: 'npm start' })
  expect(outcome.error).toBeNull()
})

test('an open step for a link runs open on it', async () => {
  const { inbox, stepPress } = await withSteps()
  const outcome = await inbox.press(makeCtx(), stepPress(1), NO_HOLDS)
  expect(w.execCalls).toEqual([{ command: 'open', args: ['https://example.com/x'] }])
  expect(outcome.error).toBeNull()
})

test('an open that fails leaves the reason on the row', async () => {
  const { inbox, stepPress } = await withSteps()
  w.execResults.set('open', { code: 1, stderr: 'no browser' })
  await inbox.press(makeCtx(), stepPress(1), NO_HOLDS)
  const screen = await inbox.screen(makeCtx())
  const last = screen.view.lastActions[screen.view.needsYou.tasks[0]!.id]
  expect(JSON.stringify(last?.result)).toContain('no browser')
})

test('a proposed goal’s Set as goal and a typed goal set the saved goal, Not now declines a proposal, and none sends a message', async () => {
  const inbox = createInbox(pi(), deps())
  w.statusReply = 'HEAD: Pilot | Shipping the pilot\nGOAL: Pilot ready to announce | done Fixes built; queued Announced'
  await prompt('get the pilot ready to announce')
  await endAgent('Fixes built.')
  await settle()
  expect(state().ledger.overview.proposedGoal?.text).toBe('Pilot ready to announce')

  await inbox.press(makeCtx(), { action: 'use-goal', id: 'goal' }, NO_HOLDS)
  expect(state().ledger.overview).toMatchObject({ goal: { text: 'Pilot ready to announce' }, proposedGoal: null })
  expect(state().ledger.overview.milestones.map((m: { name: string }) => m.name)).toEqual(['Fixes built', 'Announced'])

  await inbox.press(makeCtx(), { action: 'type', id: 'goal', text: 'Pilot live for every team' }, NO_HOLDS)
  expect(state().ledger.overview.goal).toMatchObject({ text: 'Pilot live for every team', isAwaitingMilestones: true })
  expect(w.sent).toEqual([])
})
