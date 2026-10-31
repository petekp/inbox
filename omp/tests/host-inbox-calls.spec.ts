import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { systemText } from '../../hooks/model-text'
import { STATUS_REFRESH_MS } from '../../hooks/session'
import { createInbox } from '../src/host'
import { OMP } from '../src/texts'
import {
  call,
  deps,
  endAgent,
  endWorld,
  makeCtx,
  MODEL_ANSWER,
  pi,
  prompt,
  retiredSonnet,
  settle,
  smol,
  sonnet,
  startWorld,
  state,
  w,
} from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

test('a turn that ends queues the exchange and the inbox model fills the ledger', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().pending).toEqual([])
  expect(state().presence).toMatchObject({ turnsStarted: 1, turnsApplied: 1, isUpdating: false })
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
  expect(w.completions).toHaveLength(1)
  expect(w.completions[0]!.prompt).toContain('Plan written. Which runtime?')
})

const assistant = (text: string, isWorking = false) => ({
  message: { role: 'assistant', content: [{ type: 'text', text }, ...(isWorking ? [{ type: 'toolCall' }] : [])] },
})

test('the inbox model reads the text of each assistant message in the turn, in order, including one that called tools', async () => {
  createInbox(pi(), deps())
  await prompt('Fix the parser')
  await call('agent_start', { type: 'agent_start' })
  await call('message_end', assistant('The parser is fixed. Should I also rename the helper?', true))
  await call('message_end', assistant('Saved the notes.'))
  await endAgent('Saved the notes.')
  await settle()
  expect(w.completions).toHaveLength(1)
  expect(w.completions[0]!.prompt).toContain(
    'The parser is fixed. Should I also rename the helper?\n\nSaved the notes.',
  )
})

test('a follow-up that arrives after a finished reply ends that turn with all its text, and the next turn reads only its own', async () => {
  createInbox(pi(), deps())
  await prompt('Check the old build')
  await call('agent_start', { type: 'agent_start' })
  await call('message_end', assistant('Checking the old build.', true))
  await call('message_end', assistant('The old build passes.'))
  await prompt('Now fix the parser')
  await call('message_end', assistant('The parser is fixed.'))
  await endAgent('The parser is fixed.')
  await settle()
  const replies = w.completions.map(c => c.prompt.split('<reply>\n')[1]?.split('\n</reply>')[0])
  expect(replies).toEqual(['Checking the old build.\n\nThe old build passes.', 'The parser is fixed.'])
})

test('a reply’s Status comes from the separate Status call, after the ledger update', async () => {
  createInbox(pi(), deps())
  w.statusReply = 'HEAD: Adding a greeting CLI | Building a CLI that greets by name'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().ledger.overview.head?.title).toBe('Adding a greeting CLI')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
  expect(w.statusCompletions).toHaveLength(1)
  expect(w.statusCompletions[0]!.prompt).toContain('Plan written. Which runtime?')
})

test('a run past the wait runs the Status call on its work so far at its next tool result, once', async () => {
  createInbox(pi(), deps())
  w.statusReply = 'HEAD: Adding caching | Caching answers to cut load'
  const bash = (command: string) => call('tool_result', { toolName: 'bash', input: { command } })
  await prompt('Add caching')
  await call('agent_start', { type: 'agent_start' })
  await bash('ls')
  await settle()
  expect(w.statusCompletions).toHaveLength(0)
  w.clock += STATUS_REFRESH_MS
  await bash('npm test')
  await bash('npm run build')
  await settle()
  expect(w.statusCompletions).toHaveLength(1)
  expect(w.statusCompletions[0]!.prompt).toContain('ran: npm test')
  expect(w.statusCompletions[0]!.prompt).not.toContain('<reply>')
  expect(state().ledger.overview.head?.title).toBe('Adding caching')
})

test('a next build keeps a record of each Status call beside the saved sessions, and a release build keeps none', async () => {
  w.statusReply = 'HEAD: Adding a greeting CLI | Building a CLI that greets by name'
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(existsSync(join(w.dir, 'overview-calls'))).toBe(false)

  createInbox(pi(), { ...deps(), isNextBuild: true })
  const next = makeCtx('s2')
  await prompt('Add a greeting CLI', next)
  await endAgent('Plan written. Which runtime?', {}, next)
  await settle()
  const folder = join(w.dir, 'overview-calls', 's2')
  for (let n = 0; n < 100 && !existsSync(folder); n += 1) await Bun.sleep(5)
  const names = readdirSync(folder)
  const record = JSON.parse(readFileSync(join(folder, names[0]!), 'utf8'))

  expect(names).toEqual([expect.stringMatching(/^\d{13}-reply\.jsonl$/)])
  expect(record).toMatchObject({
    host: 'omp',
    session: 's2',
    exchange: { kind: 'reply', exchange: { reply: 'Plan written. Which runtime?' } },
    isParsed: true,
  })
  expect(record.prompt).toBe(w.statusCompletions.at(-1)!.prompt)
  expect(record.attempts.map((a: { model: string }) => a.model)).toEqual([`${sonnet.provider}/${sonnet.id}`])
  expect(record.after.head?.title).toBe('Adding a greeting CLI')
})

test('a failed Status call leaves the ledger update applied with no Status', async () => {
  createInbox(pi(), deps())
  w.statusReply = new Error('overloaded')
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().pending).toEqual([])
  expect(state().ledger.overview).toBeNull()
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
})

test('a ledger update shows before its Status call returns', async () => {
  createInbox(pi(), deps())
  w.reply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  w.statusReply = new Error('no Status yet')
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = 'HEAD: Scaffolding the command | Laying out the greet command'
  w.reply = 'CLOSED: i1 | Node chosen'
  await prompt('Use Node')
  await endAgent('Scaffolded the command with Node.')
  for (let waited = 0; w.statusCompletions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  expect(w.statusCompletions).toHaveLength(2)
  expect(state().ledger.items).toEqual([])
  expect(state().ledger.overview).toBeNull()
  release()
  await settle()
  expect(state().ledger.overview.head?.title).toBe('Scaffolding the command')
})

test('a ledger call that fails runs no Status call', async () => {
  createInbox(pi(), deps())
  w.reply = new Error('overloaded')
  w.statusReply = 'HEAD: Adding a greeting CLI | Building a CLI that greets by name'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(w.statusCompletions).toEqual([])
  expect(state().ledger.overview).toBeNull()
})

test('the next ledger update does not wait for an earlier Status call, and Status calls run one at a time', async () => {
  createInbox(pi(), deps())
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = 'HEAD: Scaffolding the command | Laying out the greet command'
  w.reply = 'NEW: do | - | Water the plants | - | -'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written.')
  for (let waited = 0; w.statusCompletions.length < 1 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  w.reply = 'NEW: do | - | Feed the cat | - | -'
  await prompt('And a name')
  await endAgent('Named it.')
  for (let waited = 0; w.completions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Water the plants', 'Feed the cat'])
  expect(w.statusCompletions).toHaveLength(1)
  release()
  await settle()
  for (let waited = 0; w.statusCompletions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  expect(w.statusCompletions).toHaveLength(2)
  expect(w.statusCompletions[1]!.prompt).toContain(
    '<head>\nScaffolding the command | Laying out the greet command\n</head>',
  )
})

test('a settle that will continue does not end the turn', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Retrying', { willContinue: true })
  await settle()
  expect(state().pending).toEqual([])
  expect(state().turn.person).toBe('Add a greeting CLI')
  expect(w.completions).toEqual([])
})

test('a turn with no reply text queues nothing', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await call('agent_end', { type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'toolCall' }] }] })
  await settle()
  expect(w.completions).toEqual([])
  expect(state().turn.person).toBeNull()
})

test('a turn the person ended by dismissing an ask dialog reaches the inbox model with the dismissed question', async () => {
  createInbox(pi(), deps())
  await prompt('Pick a license')
  const input = { questions: [{ question: 'MIT or Apache?', options: [{ label: 'MIT' }, { label: 'Apache' }] }] }
  const cancelled = [{ type: 'text', text: 'Ask tool was cancelled by the user' }]
  await call('tool_result', { toolName: 'ask', input, content: cancelled, isError: true })
  await call('agent_end', {
    type: 'agent_end',
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall' }], stopReason: 'toolUse' },
      { role: 'toolResult', toolName: 'ask', content: cancelled, isError: true },
      { role: 'assistant', content: [], stopReason: 'aborted' },
    ],
  })
  await settle()
  expect(w.completions).toHaveLength(1)
  expect(w.completions[0]!.prompt).toContain(
    '"MIT or Apache?" (options: MIT / Apache); the user dismissed it without answering',
  )
})

test('a failing inbox model marks the update failed, and the next turn retries the exchange', async () => {
  createInbox(pi(), deps())
  w.reply = new Error('offline')
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(state().presence.ledgerState).toBe('failed')
  expect(state().pending).toMatchObject([{ failed: true }])
  expect(w.completions).toHaveLength(1)

  w.reply = MODEL_ANSWER
  await prompt('again')
  await endAgent('Done again.')
  await settle()
  expect(state().presence.ledgerState).toBe('current')
  expect(state().pending).toEqual([])
})

test('the inbox model is the newest Sonnet model the providers offer, with the inbox system prompt', async () => {
  w.models = [smol, retiredSonnet, sonnet]
  createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions[0]!.model).toBe(sonnet)
  expect(w.completions[0]!.system).toEqual([systemText(OMP)])
})

test('the @inbox role wins over a Sonnet model, and the panel names it', async () => {
  w.models = [smol, sonnet]
  w.inboxRoleModel = smol
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions[0]!.model).toBe(smol)
  expect((await inbox.screen(makeCtx())).modelName).toBe('GPT Mini')
})

test('an @inbox role that names no usable model falls through to the newest Sonnet, and the panel names that one', async () => {
  w.models = [smol, sonnet]
  w.inboxRoleModel = undefined
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions[0]!.model).toBe(sonnet)
  expect((await inbox.screen(makeCtx())).modelName).toBe(sonnet.name ?? sonnet.id)
})

test('the inbox model falls back to the smol role and the panel names it', async () => {
  w.models = [smol]
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions[0]!.model).toBe(smol)
  expect((await inbox.screen(makeCtx())).modelName).toBe('GPT Mini')
})

test('with no usable model the update fails and the panel shows no model', async () => {
  w.models = []
  w.smolModel = undefined
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions).toEqual([])
  expect(state().presence.ledgerState).toBe('failed')
  expect((await inbox.screen(makeCtx())).modelName).toBeNull()
})
