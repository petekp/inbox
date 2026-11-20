import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'

const APP_TERMINAL = { HC_TERMINAL_ID: 't9', HERDR_APP_HOME: '/app', HOME: '/home/person' }

function terminalIs(terminal: { parent: string | null; labels: Record<string, string> }) {
  w.ghAnswers.push({
    match: argv => argv.join(' ') === 'hc get t9 --json',
    stdout: JSON.stringify({ address: 't9', ...terminal }),
  })
}

const storedAsks = () => {
  const saved = [...w.stored].find(([k]) => k.startsWith('s:'))
  const items: { kind: string; ask: string }[] = (saved && JSON.parse(saved[1]).ledger.items) ?? []
  const findings: { title: string }[] = (saved && JSON.parse(saved[1]).ledger.findings) ?? []

  return { items: items.map(i => [i.kind, i.ask]), findings: findings.map(f => f.title) }
}

test('in a delegate’s Herdr app terminal, the record tool refuses questions and tasks and records findings, and the update adds no question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  terminalIs({ parent: 't1', labels: { 'fleet.domain': 'inbox', 'fleet.task': 'asks' } })
  const call = async (input: Record<string, unknown>) =>
    String((await $.tool.call({ tool: 'mcp__inbox__record', ...input })).result)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.prompt.submit({ text: 'add caching', wait: false, origin: { kind: 'composer' } })
  const question = await call({ kind: 'question', ask: 'Use Redis or memory?', options: ['Redis', 'Memory'] })
  const task = await call({ kind: 'task', ask: 'Sign in to the cache host' })
  const finding = await call({
    kind: 'finding',
    title: 'The cache keys skip the tenant',
    detail: 'Two tenants can read each other.',
    finding_kind: 'issue',
  })
  await $.turn.complete({ answer: 'Redis or memory?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(question).toMatch(/^Not recorded: this is a delegate session/)
  expect(question).toContain('Herdr terminal t1')
  expect(task).toBe(question)
  expect(finding).not.toMatch(/^Not recorded/)
  expect(storedAsks()).toEqual({ items: [], findings: ['The cache keys skip the tenant'] })
})

test('in a coordinator’s Herdr app terminal, the record tool and the update add questions as in any session', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  terminalIs({ parent: 't1', labels: { 'fleet.domain': 'inbox', 'fleet.role': 'coordinator' } })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.prompt.submit({ text: 'add caching', wait: false, origin: { kind: 'composer' } })
  const answer = await $.tool.call({ tool: 'mcp__inbox__record', kind: 'task', ask: 'Sign in to the cache host' })
  await $.turn.complete({ answer: 'Node or Python?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(String(answer.result)).toMatch(/^Recorded/)
  expect(storedAsks().items).toEqual([
    ['task', 'Sign in to the cache host'],
    ['question', 'Use Node or Python?'],
    ['question', 'Name the command greet?'],
  ])
})

test('a delegate resumed into a conversation its inbox has not read catches up at start and adds no question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  terminalIs({ parent: 't1', labels: { 'fleet.domain': 'inbox' } })
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  w.transcriptRows = [
    said('user', 'Add a greeting CLI. Node or Python?'),
    said('assistant', 'The plan is written. 1. Node or Python? 2. Name the command greet?'),
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect(storedAsks().items).toEqual([])
})
