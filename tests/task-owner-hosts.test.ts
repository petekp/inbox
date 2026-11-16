import { expect, mock, test } from 'claude-code/testing'

import { PR_POLL_MS } from '../hooks/mod-sessions'
import { sessionView } from '../hooks/session-view'
import { SETTLED_MS } from '../hooks/timing'
import { upgradeSession } from '../hooks/session-files'
import { w, world } from './hooks-world'

test('the mod polls a local task owner through its host runner', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ghAnswers.push({
    match: args => args[0] === 'herdr' && args[1] === 'agent',
    stdout: JSON.stringify({ result: { agent: { agent_status: 'idle' } } }),
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__tasks',
    operation: 'add',
    task_id: 't1',
    title: 'Implement the host check',
    owner_agent: 'worker-1',
    owner_machine: 'local',
  } as never)
  await $.tool.call({ tool: 'mcp__inbox__tasks', operation: 'update', task_id: 't1', status: 'working' } as never)

  await clock.advance(PR_POLL_MS)
  await clock.settle()

  expect(w.ran).toContainEqual(['herdr', 'agent', 'get', 'worker-1'])
  const saved = upgradeSession(JSON.parse(w.stored.get('s:session-1') ?? '{}'))
  expect(sessionView(saved, clock.now() + 15 * 60_000, SETTLED_MS).taskStalledSince).toMatchObject({
    t1: expect.any(Number),
  })
})
