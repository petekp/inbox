import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { PERMISSION_FALLBACK_DELAY_MS } from '../hooks/view'
import { w, world } from './hooks-world'
import { sidebarLines } from './hooks-helpers'

const PUSH = { command: 'git push', description: 'Push main to origin' }

const PUSH_ROW = 'Allow push main to origin?'

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
    toolRow(use: string, isRunning: boolean) {
      return $.ui.mount({
        plugin: 'inbox',
        surface: 'terminal',
        component: 'ToolUse',
        props: { tool_use_id: use, tool: 'Bash', input: PUSH, isRunning, isErrored: false, isInterrupted: false },
      } as never)
    },
    groupRow(calls: { use: string; isRunning: boolean }[]) {
      return $.ui.mount({
        plugin: 'inbox',
        surface: 'terminal',
        component: 'ToolGroup',
        props: {
          isActive: true,
          isExpanded: false,
          calls: calls.map(c => ({
            tool_use_id: c.use,
            tool: 'Bash',
            input: PUSH,
            isRunning: c.isRunning,
            isErrored: false,
            isInterrupted: false,
          })),
        },
      } as never)
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

test('a tool row or group that reports the call running ends the wait and clears the row; one that does not leaves it alone', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await calls.ask('u1')
  await calls.toolRow('u1', false)
  await calls.groupRow([{ use: 'u1', isRunning: false }])
  await calls.toolRow('other', true)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS + 1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.toolRow('u1', false)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.toolRow('u1', true)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u2')
  await clock.advance(500)
  await calls.toolRow('u2', true)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 4)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u3')
  await clock.advance(500)
  await calls.groupRow([
    { use: 'x', isRunning: false },
    { use: 'u3', isRunning: true },
  ])
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 4)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u4')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS + 1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.groupRow([{ use: 'u4', isRunning: true }])
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')
})
