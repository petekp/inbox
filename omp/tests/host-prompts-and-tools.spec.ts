import { afterEach, beforeEach, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { guidanceText } from '../../hooks/model-text'
import { createInbox } from '../src/host'
import { OMP } from '../src/texts'
import { call, deps, endWorld, makeCtx, pi, prompt, record, startWorld, state, w } from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

test('a prompt adds the guidance once and counts one turn even when omp runs the handler again', async () => {
  createInbox(pi(), deps())
  const first = await prompt('Add a greeting CLI')
  const again = await prompt('Add a greeting CLI')
  expect(first.systemPrompt).toEqual(['base', guidanceText(OMP)])
  expect(again.systemPrompt).toEqual(['base', guidanceText(OMP)])
  expect(state().presence.turnsStarted).toBe(1)

  const withGuidance = (await call('before_agent_start', {
    prompt: 'next',
    systemPrompt: ['base', guidanceText(OMP)],
  })) as { systemPrompt: string[] }
  expect(withGuidance.systemPrompt).toEqual(['base', guidanceText(OMP)])
})

test('the same prompt text typed again after a turn counts as a new turn', async () => {
  createInbox(pi(), deps())
  await prompt('continue')
  await call('turn_start', { type: 'turn_start' })
  await prompt('continue')
  expect(state().presence.turnsStarted).toBe(2)
})

test('a record call shows in the next prompt as a hidden message', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  const answer = await record({ kind: 'task', ask: 'Try the CLI by hand' })
  expect(answer.content[0].text).toBe('Recorded. The user sees it in the /inbox panel.')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Try the CLI by hand'])

  const next = await prompt('How is it going?')
  expect(next.message).toMatchObject({ display: false, attribution: 'agent' })
  expect(next.message.content).toContain('Try the CLI by hand')
})

test('a prompt with nothing to tell the agent returns no message', async () => {
  createInbox(pi(), deps())
  const first = await prompt('hello')
  expect(first.message).toBeUndefined()
})

test('record, close and order_prs are registered with the shared schemas and stay in the tool list', () => {
  createInbox(pi(), deps())
  expect([...w.tools.keys()]).toEqual(['record', 'close', 'order_prs'])
  expect(w.tools.get('record')).toMatchObject({ loadMode: 'essential', approval: 'read' })
  expect(w.tools.get('record').parameters.properties.kind.enum).toEqual(['question', 'task', 'finding'])
})

test('a close call closes the recorded item', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const id = state().ledger.items[0].id
  const answer = await w.tools
    .get('close')
    .execute('call', { id, reason: 'done by the agent' }, undefined, undefined, makeCtx())
  expect(answer.content[0].text).not.toContain('Not done')
  expect(state().ledger.items).toEqual([])
  expect(state().ledger.closed).toHaveLength(1)
})

test("record and close draw the person's line under the call while the agent reads its own text", async () => {
  createInbox(pi(), deps())
  const theme = { fg: (_color: string, text: string) => text }
  const drawn = (name: string, result: unknown) =>
    w.tools.get(name).renderResult(result, { expanded: false, isPartial: false }, theme).render(80)
  const close = (args: Record<string, unknown>) =>
    w.tools.get('close').execute('call', args, undefined, undefined, makeCtx())

  const recorded = await record({ kind: 'task', ask: 'Try the CLI by hand' })
  expect(recorded.content[0].text).toBe('Recorded. The user sees it in the /inbox panel.')
  expect(drawn('record', recorded)).toEqual(['Task: Try the CLI by hand'])
  expect(w.tools.get('record').describeResult(recorded).body).toEqual([
    { k: 'text', p: { text: 'Task: Try the CLI by hand' } },
  ])
  const again = await record({ kind: 'task', ask: 'Try the CLI by hand' })
  expect(drawn('record', again)).toEqual([])
  expect(w.tools.get('record').describeResult(again).body).toBeUndefined()

  const closed = await close({ id: state().ledger.items[0].id, reason: 'done by the agent' })
  expect(closed.content[0].text).toStartWith('Closed. The user sees it in the /inbox panel')
  expect(drawn('close', closed)).toEqual(['Closed: Try the CLI by hand'])

  const failed = { content: [{ type: 'text', text: 'Could not save the inbox.' }], isError: true }
  expect(drawn('record', failed)).toEqual(['Could not save the inbox.'])
  const savedBeforeDetails = { content: [{ type: 'text', text: 'Recorded. The user sees it in the /inbox panel.' }] }
  expect(drawn('record', savedBeforeDetails)).toEqual([])
})

test('only bash, edit and write calls that ran become turn activity', async () => {
  createInbox(pi(), deps())
  const run = (toolName: string, input: Record<string, unknown>) => call('tool_result', { toolName, input })
  await call('tool_execution_start', { toolName: 'bash', args: { command: 'rm -r /work' } })
  await run('bash', { command: 'npm test' })
  await run('bash', { command: 'sleep 9', async: true })
  await run('edit', { path: '/work/a.ts' })
  await run('write', { path: '/work/b.ts', content: '' })
  await run('read', { path: '/work/c.ts' })
  expect(state().turn.activity).toEqual([
    'ran: npm test',
    'started in background: sleep 9',
    'edited /work/a.ts',
    'edited /work/b.ts',
  ])
})

test('a bash result notes local URLs it printed and links the PR gh pr create names', async () => {
  createInbox(pi(), deps())
  const result = (command: string, text: string, extra: Record<string, unknown> = {}) =>
    call('tool_result', {
      toolName: 'bash',
      input: { command },
      content: [{ type: 'text', text }],
      isError: false,
      ...extra,
    })
  await result('npm run dev', 'ready at http://localhost:3000/')
  await result('gh pr create --fill', 'https://github.com/acme/app/pull/12\n')
  await result('cat notes.txt', 'https://github.com/acme/app/pull/77\n')
  expect(state().turn.activity).toEqual([
    'ran: npm run dev',
    'URL in output: http://localhost:3000/',
    'ran: gh pr create --fill',
    'ran: cat notes.txt',
  ])
  expect(state().ledger.prs).toEqual(['acme/app#12'])
})

test('the guidance names the tools as omp registers them', () => {
  expect(guidanceText(OMP)).toContain('with record,')
  expect(guidanceText(OMP)).toContain('Close with close:')
  expect(guidanceText(OMP)).not.toContain('mcp__')
})

test('an activity note or an ask result still settles when the session file cannot be written', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  writeFileSync(join(w.dir, 'sessions', 's1.json'), '{not json')
  expect(await call('tool_result', { toolName: 'bash', input: { command: 'ls' } })).toBeUndefined()
  expect(await call('tool_result', { toolName: 'ask', input: {}, content: [], isError: false })).toBeUndefined()
})

test('an ask dialog becomes turn activity with the answer', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  const input = { questions: [{ question: 'Node or Python?', options: [{ label: 'Node' }, { label: 'Python' }] }] }
  await call('tool_result', {
    toolName: 'ask',
    input,
    content: [{ type: 'text', text: 'User selected: Node' }],
    isError: false,
  })
  expect(state().turn.activity).toEqual([
    'asked the user in a dialog: "Node or Python?" (options: Node / Python); answer: User selected: Node',
  ])
})
