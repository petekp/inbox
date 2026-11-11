import { expect, mock, test } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { BAND } from './hooks-helpers'

const APP_TERMINAL = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app', HOME: '/home/person' }
const LS = JSON.stringify({ spaces: [{ machine: null, tabs: [{ terminals: [{ terminal: 't1', pane: 'p1' }] }] }] })
const herdrAppCalls = () => w.ran.filter(argv => argv[0] === 'herdr-app').map(argv => argv.slice(1, 3).join(' '))

test('in a Herdr app terminal, /inbox and Open inbox open the Herdr panel beside the terminal, then focus it, and open no pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  w.ghAnswers = [
    { match: argv => argv[0] === 'herdr-app' && argv[1] === 'ls', stdout: LS },
    { match: argv => argv[2] === 'pane.split', stdout: '{"pane":"p9","terminal":null}' },
    { match: argv => argv[2] === 'pane.focus', stdout: '{}' },
  ]
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  w.panesOpened = []

  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'Opened the inbox in Herdr, to the right of this terminal.',
  )
  expect(w.ran.find(argv => argv[2] === 'pane.split')?.[3]).toBe('{"direction":"right","pane":"p1","mod":"inbox"}')
  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'The inbox is already open in Herdr. Focused it.',
  )
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(herdrAppCalls()).toEqual(['ls', 'do pane.split', 'ls', 'do pane.focus', 'ls', 'do pane.focus'])
  expect(w.panesOpened).toEqual([])
})

test('in a Herdr app terminal, a split Herdr refuses opens the pane and says why, and /inbox demo stays in the pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  w.ghAnswers = [
    { match: argv => argv[0] === 'herdr-app' && argv[1] === 'ls', stdout: LS },
    { match: argv => argv[2] === 'pane.split', stdout: '{"error":"unknown mod inbox"}', exitCode: 1 },
  ]
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  w.panesOpened = []

  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'Opened the inbox here, since Herdr did not split the pane: unknown mod inbox.',
  )
  expect(w.panesOpened).toEqual(['inbox'])
  w.ran = []
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  expect(herdrAppCalls()).toEqual([])
})

test('outside a Herdr app terminal, /inbox and Open inbox open the pane and run no herdr-app', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  w.panesOpened = []

  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe('Opened the inbox.')
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesOpened).toEqual(['inbox', 'inbox'])
  expect(herdrAppCalls()).toEqual([])
})
