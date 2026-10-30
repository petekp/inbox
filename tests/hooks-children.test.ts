import { expect, mock, test } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { childrenOf, notice } from './hooks-helpers'

test('Claude Code task calls build the agent task list the Status call reads', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Read the parser', description: 'Read it' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Fix the parser', description: 'Fix it' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await clock.settle()
  const saved = [...w.stored].find(([k]) => k.startsWith('s:'))
  expect(saved && JSON.parse(saved[1]).hostTasks).toEqual([
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix the parser', status: 'pending' },
  ])

  w.otherToolAnswer = { isError: true, result: 'Task not found', text: 'Task #7 not found' }
  await $.tool.call({ tool: 'TaskCreate', subject: 'A task that failed', description: 'No' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  await clock.settle()
  const after = [...w.stored].find(([k]) => k.startsWith('s:'))
  expect(after && JSON.parse(after[1]).hostTasks).toHaveLength(2)
  expect(after && JSON.parse(after[1]).hostTasks[1].status).toBe('pending')
})

test('a subagent, a background command, a Monitor and a Workflow each run as a child on the Status until their result or notice ends them', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const running = () =>
    childrenOf(w.stored)
      .filter(c => c.endedAt === null)
      .map(c => [c.kind, c.name])
  const fromCall = (id: string) => ({
    tool_use_id: id,
    parentModel: 'opus',
    fork: false,
    background: true,
    provider: { tier: 'core' },
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'review it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'review it', turnId: 't1' })
  await $.agent.spawn({
    ...fromCall('tu1'),
    prompt: 'Review',
    description: 'Review the diff',
    subagentType: 'Explore',
  } as never)
  w.otherToolAnswer = {
    result: {
      status: 'async_launched',
      agentId: 'a1',
      description: 'Review the diff',
      prompt: 'Review',
      outputFile: '/tmp/a1',
    },
    text: '',
  }
  await $.tool.call({ tool: 'Agent', description: 'Review the diff', prompt: 'Review', tool_use_id: 'tu1' } as never)
  w.otherToolAnswer = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' }
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', run_in_background: true })
  w.otherToolAnswer = { result: { taskId: 'm1', timeoutMs: 0 }, text: '' }
  await $.tool.call({ tool: 'Monitor', description: 'Watch the deploy', timeout_ms: 1000, command: 'tail -f log' })
  w.otherToolAnswer = { result: { status: 'async_launched', taskId: 'w1', workflowName: 'review-changes' }, text: '' }
  await $.tool.call({ tool: 'Workflow', script: 'export const meta = {}', tool_use_id: 'tu5' } as never)
  await clock.settle()
  expect(running()).toEqual([
    ['subagent', 'Review the diff'],
    ['background', 'Run the tests'],
    ['background', 'Watch the deploy'],
    ['workflow', 'review-changes'],
  ])

  await clock.advance(20 * 60_000)
  w.spawnedAgentId = 'wa1'
  await $.agent.spawn({
    ...fromCall('tu5'),
    prompt: 'x',
    description: 'x',
    subagentType: 'x',
    workflow: { runId: 'wf_1', agentIndex: 1 },
  } as never)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a', agentId: 'a1' } as never)
  await clock.settle()
  const activeAt = (name: string) => childrenOf(w.stored).find(c => c.name === name)?.lastActivityAt
  expect(activeAt('review-changes')).toBe(clock.now())
  expect(activeAt('Review the diff')).toBe(clock.now())
  expect(activeAt('Run the tests')).toBeNull()

  for (const [id, status] of [
    ['a1', 'completed'],
    ['b1', 'failed'],
    ['m1', 'killed'],
    ['w1', 'completed'],
  ] as const)
    await $.prompt.submit({ text: notice(id, status), wait: false, origin: { kind: 'task-notification' } })
  await clock.settle()
  expect(running()).toEqual([])
})

test('a subagent that runs inside its Agent call ends at the call’s result, and one the agent list no longer names ends at the turn’s end', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const running = () =>
    childrenOf(w.stored)
      .filter(c => c.endedAt === null)
      .map(c => c.name)
  const spawn = (description: string) =>
    $.agent.spawn({
      tool_use_id: description,
      parentModel: 'opus',
      fork: false,
      background: false,
      provider: { tier: 'core' },
      prompt: 'x',
      description,
      subagentType: 'Explore',
    } as never)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'look around', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'look around', turnId: 't1' })
  await spawn('Map the repo')
  expect(running()).toEqual(['Map the repo'])
  w.otherToolAnswer = {
    result: {
      status: 'completed',
      agentId: 'a1',
      content: [],
      prompt: 'x',
      totalToolUseCount: 1,
      totalDurationMs: 1,
      totalTokens: 1,
    },
    text: 'done',
  }
  await $.tool.call({ tool: 'Agent', description: 'Map the repo', prompt: 'x' })
  expect(running()).toEqual([])

  w.spawnedAgentId = 'a2'
  await spawn('Read the tests')
  w.listedAgents = [{ id: 'a2', status: 'completed' }]
  await $.turn.complete({ answer: 'Mapped.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(running()).toEqual([])
})
