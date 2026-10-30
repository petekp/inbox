import { afterEach, beforeEach, expect, test } from 'bun:test'
import { join } from 'node:path'

import { createInbox } from '../src/host'
import {
  call,
  deps,
  endAgent,
  endWorld,
  makeCtx,
  MODEL_ANSWER,
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

test('a session with no UI leaves no state and takes record and close out of its tools', async () => {
  w.hasUI = false
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(w.activeTools).toEqual(['read', 'bash'])
  const result = await prompt('hello')
  await call('tool_result', { toolName: 'bash', input: { command: 'ls' } })
  await endAgent('Done.')
  const recorded = await record({ kind: 'task', ask: 'Try it' })
  await settle()
  expect(result).toBeUndefined()
  expect(w.completions).toEqual([])
  expect(recorded.content[0].text).toBe('The inbox is not shown in this session.')
  expect(() => state()).toThrow()
})

test('a subagent leaves no state and takes record and close out of its tools', async () => {
  w.agentKind = 'sub'
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(w.activeTools).toEqual(['read', 'bash'])
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(w.completions).toEqual([])
  expect(() => state()).toThrow()
})

test('an omp that gives no agent kind still watches a main session and skips one with no UI', async () => {
  w.agentKind = undefined
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(w.activeTools).toEqual(['read', 'bash', 'record', 'close'])
  await prompt('hello')
  expect(() => state()).not.toThrow()
  w.hasUI = false
  await call('session_start', { type: 'session_start' }, makeCtx('quiet'))
  expect(w.activeTools).toEqual(['read', 'bash'])
  await prompt('hello', makeCtx('quiet'))
  expect(() => state('quiet')).toThrow()
})

test('a watched session keeps record and close in its tools', async () => {
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(w.activeTools).toEqual(['read', 'bash', 'record', 'close'])
})

test('state from a crashed process that left an update or a turn running is cleared when the session starts', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  const file = join(w.dir, 'sessions', 's1.json')
  const saved = state()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(
    file,
    JSON.stringify({ ...saved, presence: { ...saved.presence, isUpdating: true, isTurnRunning: true } }),
  )

  w.handlers = new Map()
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(state().presence).toMatchObject({ isUpdating: false, isTurnRunning: false })
})

const message = (message: Record<string, unknown>) => ({ type: 'message', message })

const earlierBranch = () => [
  message({ role: 'user', content: 'Before the clear' }),
  { type: 'reset_boundary' },
  message({ role: 'developer', content: 'Injected by omp' }),
  message({ role: 'user', content: [{ type: 'text', text: 'Add a greeting CLI. Node or Python?' }] }),
  message({ role: 'custom', customType: 'inbox', display: false, content: 'inbox: nothing waits on the user' }),
  message({
    role: 'assistant',
    content: [
      { type: 'text', text: 'I will check the repo.' },
      { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } },
      { type: 'toolCall', id: 'c2', name: 'record', arguments: { kind: 'task', ask: 'Try it' } },
      { type: 'toolCall', id: 'c3', name: 'ask', arguments: { questions: [{ question: 'Which runtime?' }] } },
    ],
  }),
  message({ role: 'toolResult', toolCallId: 'c3', content: [{ type: 'text', text: 'Node' }], isError: false }),
  message({ role: 'assistant', content: [{ type: 'text', text: 'The plan is written.' }] }),
]

test('a resumed session with earlier turns is marked behind and catches up over its branch', async () => {
  w.branch = earlierBranch()
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()

  expect(w.completions).toHaveLength(1)
  const conversation = w.completions[0]!.prompt.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  expect(conversation).toBe(
    [
      'Person: Add a greeting CLI. Node or Python?',
      'Agent: I will check the repo.',
      'Agent ran: ls',
      'Agent asked the user in a dialog: "Which runtime?"; answer: Node',
      'Agent: The plan is written.',
    ].join('\n'),
  )
  expect(state().presence.ledgerState).toBe('current')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])

  await call('session_switch', { type: 'session_switch', reason: 'resume' })
  await settle()
  expect(w.completions).toHaveLength(1)
})

test('a new session with no earlier turns, and a session that has no UI, start without a catch-up', async () => {
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(w.completions).toEqual([])

  w.branch = earlierBranch()
  w.hasUI = false
  await call('session_start', { type: 'session_start' }, makeCtx('s2'))
  await settle()
  expect(w.completions).toEqual([])
})

const forkOf = (parent: string) => ({
  type: 'session_switch',
  reason: 'fork',
  previousSessionFile: `/sessions/2026-10-20T05-01-10-123Z_${parent}.jsonl`,
})

test('a forked session takes its parent’s ledger and does not catch up, and catches up when the parent has none', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_start', { type: 'session_start' }, makeCtx('parent'))
  await settle()
  const parentItems = state('parent').ledger.items

  w.branch = earlierBranch()
  await call('session_switch', forkOf('parent'), makeCtx('child'))
  await settle()
  expect(w.completions).toEqual([])
  expect(state('child').ledger.items).toEqual(parentItems)
  expect(state('child').presence.ledgerState).toBe('current')

  await call('session_switch', forkOf('missing'), makeCtx('orphan'))
  await settle()
  expect(w.completions).toHaveLength(1)
  expect(state('orphan').ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
})

test('a branch into a new session takes the parent’s ledger, and a branch in the same session copies nothing', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_start', { type: 'session_start' }, makeCtx('parent'))
  await settle()

  w.branch = earlierBranch()
  const { previousSessionFile } = forkOf('parent')
  await call('session_branch', { type: 'session_branch', reason: 'btw', previousSessionFile }, makeCtx('child'))
  await settle()
  expect(w.completions).toEqual([])
  expect(state('child').ledger.items).toEqual(state('parent').ledger.items)

  await call('session_branch', { type: 'session_branch', reason: 'branch', previousSessionFile }, makeCtx('parent'))
  await settle()
  expect(w.completions).toEqual([])
  expect(state('parent').ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Try the CLI by hand'])
})

test('a resume keeps its own ledger even when the event names another session file', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_switch', { ...forkOf('parent'), reason: 'resume' }, makeCtx('other'))
  await settle()
  expect(state('other').ledger.items).toEqual([])
})

test('a failed catch-up is tried again at the next agent end, before the exchange', async () => {
  w.branch = earlierBranch()
  createInbox(pi(), deps())
  w.reply = new Error('offline')
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(state().presence.ledgerState).toBe('failed')

  w.reply = MODEL_ANSWER
  await prompt('Node')
  await endAgent('Using Node.')
  await settle()
  expect(w.completions).toHaveLength(2)
  expect(w.completions[1]!.prompt).toContain('<conversation>')
  expect(state().presence.ledgerState).toBe('current')
  expect(state().pending).toEqual([])
})

test('the folder and branch show from the session’s start, and a checkout during a turn shows at its end', async () => {
  createInbox(pi(), deps())
  w.execResults.set('git', { code: 0, stdout: 'main\n' })
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(state().place).toEqual({ folder: '/work', branch: 'main' })

  await prompt('switch to a feature branch')
  await call('agent_start', { type: 'agent_start' })
  w.execResults.set('git', { code: 0, stdout: 'feature\n' })
  await endAgent('Switched.')
  await settle()
  expect(state().place).toEqual({ folder: '/work', branch: 'feature' })
})
