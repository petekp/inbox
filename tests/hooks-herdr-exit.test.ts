import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'

const APP_TERMINAL = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app', HOME: '/home/person' }
const labelCalls = () => w.ran.filter(argv => argv[0] === 'hc' && argv[1] === 'label')
const isSessionLabelCleared = (argv: string[]) => argv.includes('inbox.session=')

test('on exit, a Herdr report that is still running does not hold back clearing the terminal and removing the session file', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const file = Object.keys(w.written).find(path => path.startsWith('/app/inbox/sessions/'))
  expect(file).toBeDefined()

  let release = () => {}
  w.ghAnswers = [
    {
      match: argv => argv[0] === 'hc' && argv[1] === 'label',
      stdout: '',
      hold: () => new Promise<void>(r => (release = r)),
    },
  ]
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  const ended = $.session.end({ reason: 'other', sessionId: 'session-1' } as never)
  await clock.settle()

  expect(w.written[file!]).toBeUndefined()
  expect(labelCalls().some(isSessionLabelCleared)).toBe(true)
  release()
  await ended
})

test('after exit, a later change does not publish the session again', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.session.end({ reason: 'other', sessionId: 'session-1' } as never)
  await clock.settle()
  const labelsAtExit = labelCalls().length
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Late?', options: ['yes', 'no'] })
  await clock.settle()

  expect(labelCalls()).toHaveLength(labelsAtExit)
  expect(Object.keys(w.written).filter(path => path.startsWith('/app/'))).toEqual([])
})
