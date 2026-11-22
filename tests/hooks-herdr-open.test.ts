import type { On } from 'claude-code'
import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'
import { BAND } from './hooks-helpers'

const APP_TERMINAL = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app', HOME: '/home/person' }
const LS = JSON.stringify({ spaces: [{ machine: null, tabs: [{ terminals: [{ terminal: 't1', pane: 'p1' }] }] }] })
const herdrAppCalls = () => w.ran.filter(argv => argv[0] === 'herdr-app').map(argv => argv.slice(1, 3).join(' '))

function spyOnEvents(on: On) {
  const events: string[] = []
  const spy = ((name: string, handler: (...args: never[]) => unknown) => {
    const isStream = handler.constructor.name === 'AsyncGeneratorFunction'
    const recorded = isStream
      ? async function* (...args: never[]) {
          events.push(name)
          yield* handler(...args) as AsyncGenerator
        }
      : (...args: never[]) => {
          events.push(name)

          return handler(...args)
        }

    return on(name as never, recorded as never)
  }) as On

  const awaitedSince = (start: number) => events.slice(start).filter(name => name !== 'ui.log')

  return { events, awaitedSince, spy }
}

test('in a Herdr app terminal, /inbox and Open inbox open the Herdr panel beside the terminal, label it, then focus it, and open no pane', async ($, on) => {
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
  expect(w.ran).toContainEqual(['hc', 'label', 't1', 'inbox.panel=p9'])
  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'The inbox is already open in Herdr. Focused it.',
  )
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(herdrAppCalls()).toEqual(['ls', 'do pane.split', 'ls', 'do pane.focus', 'ls', 'do pane.focus'])
  expect(w.panesOpened).toEqual([])
})

test('in a Herdr app terminal, a split Herdr refuses opens the pane and says why, and /inbox demo and Open inbox in a demo stay in the pane', async ($, on) => {
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
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(herdrAppCalls()).toEqual([])
})

test('in a Herdr app terminal without the inbox mod, Open inbox opens the pane in the press and logs why', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const { events, awaitedSince, spy } = spyOnEvents(on)
  world($, spy, [], APP_TERMINAL)
  w.missingFiles = ['/app/mods/inbox/main.js']
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  w.panesOpened = []

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const beforePress = events.length
  await band.press({ key: 'open-inbox' })
  expect(awaitedSince(beforePress)[0]).toBe('ui.open')
  await clock.settle()
  expect(w.logged).toContain('Opened the inbox here, since the Herdr app has no inbox mod in /app/mods.')
  expect(herdrAppCalls()).toEqual([])
})

test('in a Herdr app terminal, /inbox opens the Herdr panel once another session installs the inbox mod', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  w.missingFiles = ['/app/mods/inbox/main.js']
  w.ghAnswers = [
    { match: argv => argv[0] === 'herdr-app' && argv[1] === 'ls', stdout: LS },
    { match: argv => argv[2] === 'pane.split', stdout: '{"pane":"p9","terminal":null}' },
  ]
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'Opened the inbox here, since the Herdr app has no inbox mod in /app/mods.',
  )
  w.missingFiles = []
  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe(
    'Opened the inbox in Herdr, to the right of this terminal.',
  )
})

test('outside a Herdr app terminal, /inbox and Open inbox open the pane in the press and run no herdr-app', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const { events, awaitedSince, spy } = spyOnEvents(on)
  world($, spy, [], { HERDR_PANE_ID: 'p1' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  w.panesOpened = []

  expect((await $.command.run({ command: 'inbox', args: '' } as never)).text).toBe('Opened the inbox.')
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const beforePress = events.length
  await band.press({ key: 'open-inbox' })
  expect(awaitedSince(beforePress)[0]).toBe('ui.open')
  await clock.settle()
  expect(herdrAppCalls()).toEqual([])
})
