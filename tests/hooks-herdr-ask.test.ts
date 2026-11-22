import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'
import { shownTabs } from '../core/view/tabs'
import { HERDR_ASK_BUTTONS } from '../core/remote/herdr-ask'

const APP_TERMINAL = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app', HOME: '/home/person' }

test("while the Herdr install question asks, y and q are its keys on every tab, and q saves Don't install", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], APP_TERMINAL)
  w.missingFiles = ['/app/mods/inbox']
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await clock.settle()
  await $.command.run({ command: 'inbox', args: 'herdr' } as never)
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const hotkeysOn = async (key: string) =>
    (await pane.findAll({ type: 'Button' })).filter(b => b.props.hotkey === key).map(b => b.key)

  for (const tab of shownTabs()) {
    await pane.press({ key: `tab-key-${tab.id}` })
    await clock.settle()
    expect([await hotkeysOn('y'), await hotkeysOn('q')], tab.id).toEqual([['herdr-install-key'], ['herdr-skip-key']])
  }

  await pane.press({ key: 'herdr-skip-key' })
  await clock.settle()
  expect(JSON.parse(w.written['/app/inbox/herdr-mod.json'] ?? '{}').answer).toBe('no')
  expect(await hotkeysOn('q')).toEqual([])
})

test('no other key of the pane takes y or q, on any tab with any demo row selected', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const askKeys = HERDR_ASK_BUTTONS.map(a => a.hotkey as string)
  const MOVES_PER_TAB = 40
  const seen = new Set<string>()

  for (const tab of shownTabs()) {
    await pane.press({ key: `tab-key-${tab.id}` })
    await clock.settle()
    for (let move = 0; move < MOVES_PER_TAB; move++) {
      const hotkeys = (await pane.findAll({ type: 'Button' })).flatMap(b =>
        typeof b.props.hotkey === 'string' ? [b.props.hotkey] : [],
      )
      for (const k of hotkeys) seen.add(k)
      expect(
        hotkeys.filter(k => askKeys.includes(k)),
        `${tab.id} after ${move} moves`,
      ).toEqual([])
      await pane.press({ key: 'next' })
      await clock.settle()
    }
  }
  expect(seen.size).toBeGreaterThan(15)
})
