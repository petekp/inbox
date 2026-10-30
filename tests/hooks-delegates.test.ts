import { expect, mock, test } from 'claude-code/testing'
import { HERDR_CHECK_MS } from '../hooks/herdr'
import { w, world } from './hooks-world'
import { PANE, childrenOf, notice } from './hooks-helpers'

test('a Herdr delegate runs as a child from the command that starts it until a wait on it ends, keeps its id when prompted again, and at a turn’s end takes the state Herdr shows: blocked keeps it running, and ready ends it, finished once it had worked', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const delegates = () => childrenOf(w.stored).map(c => [c.kind, c.name, c.endedAt === null])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hand it off', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'herdr agent start fixer --cmd claude' })
  expect(delegates()).toEqual([['delegate', 'fixer', true]])
  await $.tool.call({ tool: 'Bash', command: 'herdr agent wait fixer --until working' })
  expect(delegates()).toEqual([['delegate', 'fixer', true]])
  await $.tool.call({ tool: 'Bash', command: 'herdr agent wait fixer --until idle' })
  expect(delegates()).toEqual([['delegate', 'fixer', false]])

  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt fixer "go on"' })
  w.otherToolAnswer = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bw1' }, text: '' }
  await $.tool.call({ tool: 'Bash', command: 'herdr agent wait fixer', run_in_background: true })
  expect(delegates()).toEqual([['delegate', 'fixer', true]])
  await $.prompt.submit({ text: notice('bw1', 'completed'), wait: false, origin: { kind: 'task-notification' } })
  await clock.settle()
  expect(delegates()).toEqual([['delegate', 'fixer', false]])
  expect(childrenOf(w.stored)).toHaveLength(1)

  await $.tool.call({ tool: 'Bash', command: 'herdr agent start reviewer --cmd codex' })
  await $.tool.call({ tool: 'Bash', command: 'herdr agent start helper --cmd codex' })
  await clock.advance(60_000)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt scout "look around"' })
  await clock.advance(5_000)
  const agents = [
    { name: 'reviewer', agent_status: 'idle' },
    { name: 'helper', agent_status: 'working' },
    { name: 'scout', agent_status: 'idle' },
  ]
  w.ghAnswers.push({
    match: argv => argv.join(' ') === 'herdr agent list',
    stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents } }),
  })
  await $.turn.complete({ answer: 'Handed off.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(delegates()).toEqual([
    ['delegate', 'fixer', false],
    ['delegate', 'reviewer', false],
    ['delegate', 'helper', true],
    ['delegate', 'scout', true],
  ])

  await clock.advance(60_000)
  const later = [
    { name: 'helper', agent_status: 'blocked' },
    { name: 'scout', agent_status: 'done' },
  ]
  w.ghAnswers.unshift({
    match: argv => argv.join(' ') === 'herdr agent list',
    stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents: later } }),
  })
  await $.turn.complete({ answer: 'Still on it.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(childrenOf(w.stored).map(c => [c.name, c.endedAt === null, c.delegateState])).toEqual([
    ['fixer', false, 'working'],
    ['reviewer', false, null],
    ['helper', true, 'blocked'],
    ['scout', false, 'finished'],
  ])
})

test('while the Status shows a running delegate, the inbox asks Herdr each HERDR_CHECK_MS, with no turn ending, and stops once the Status hides', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  const herdrAsks = () => w.ran.filter(argv => argv.join(' ') === 'herdr agent list').length
  const answer = (agent_status: string) =>
    w.ghAnswers.unshift({
      match: argv => argv.join(' ') === 'herdr agent list',
      stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents: [{ name: 'fixer', agent_status }] } }),
    })

  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hand it off', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt fixer "fix it"' })
  await clock.advance(HERDR_CHECK_MS)
  answer('working')
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  const asked = herdrAsks()
  expect(asked).toBeGreaterThan(0)

  answer('blocked')
  await clock.advance(HERDR_CHECK_MS)
  await clock.settle()
  expect(childrenOf(w.stored).map(c => [c.endedAt === null, c.delegateState])).toEqual([[true, 'blocked']])
  expect(await pane.find({ text: /· waiting/ })).toBeDefined()

  await pane.press({ key: 'tab-key-needsYou' })
  await clock.advance(HERDR_CHECK_MS)
  await clock.settle()
  const afterHidden = herdrAsks()
  await clock.advance(3 * HERDR_CHECK_MS)
  await clock.settle()
  expect(herdrAsks()).toBe(afterHidden)
})
