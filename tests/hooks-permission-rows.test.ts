import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import type { Engine } from 'claude-code/testing'
import { PERMISSION_FALLBACK_DELAY_MS } from '../core/view/timing'
import { w, world } from './hooks-world'
import { sidebarLines } from './hooks-helpers'

const PUSH = { command: 'git push', description: 'Push main to origin' }

const PUSH_ROW = 'Allow push main to origin?'

const OTHER = { command: 'ls', description: 'List files' }

function permissionCalls($: Engine) {
  let id = 0
  const fresh = () => `use-${++id}`
  return {
    fresh,
    ask(use: string | null) {
      w.toolVerdict = 'ask'
      return $.tool.check({ tool: 'Bash', input: PUSH, ...(use === null ? {} : { tool_use_id: use }) } as never)
    },
    allow(use: string) {
      w.toolVerdict = 'allow'
      return $.tool.check({ tool: 'Bash', input: PUSH, tool_use_id: use } as never)
    },
    run(use: string) {
      w.toolVerdict = 'allow'
      return $.tool.call({ tool: 'Bash', ...PUSH, tool_use_id: use } as never)
    },
    started(use: string, input: Record<string, string>) {
      w.toolHold = new Promise<void>(() => undefined)
      void $.tool.run({ tool: 'Bash', ...input, tool_use_id: use } as never)
    },
  }
}

test('where classic.PermissionRequest is skipped, an ask shows its row only if the call is still waiting after the delay, and an allowed call shows none', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await calls.ask('u1')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS - 1)
  expect(sidebarLines().at(-1)).toBe('')
  await clock.advance(1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u1')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u2')
  await clock.advance(500)
  await calls.run('u2')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u3')
  await clock.advance(2000)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u3')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const linesBeforeAllowed = sidebarLines().length
  await calls.allow('u4')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 2)
  await clock.settle()
  expect(sidebarLines().slice(linesBeforeAllowed)).toEqual([])
})

test('a query without a tool_use_id never arms the permission row', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const lines = sidebarLines().length
  await calls.ask(null)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 2)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])
})

test('once classic.PermissionRequest has run, an ask draws no row of its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: PUSH } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u0')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u1')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 2)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])
})

test('a call allowed to run ends the wait and clears its row, whichever hook opened it, before the tool returns', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await calls.ask('u1')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS + 1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  calls.started('other', OTHER)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  calls.started('u1', PUSH)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u2')
  await clock.advance(500)
  calls.started('u2', PUSH)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 4)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: PUSH } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  calls.started('u3', PUSH)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')
})
