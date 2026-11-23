import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'
import { BAND, PANE } from './hooks-helpers'

test('Open inbox keeps its label while the engine leaves the pane undrawn, and reads Go to inbox once it draws the pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const label = async () => (await band.find({ key: 'open-inbox' }))?.props.label

  w.paneOpenResult = {
    isPlaced: false,
    reason: 'the terminal is 120 columns wide, under the 144 an unasked pane needs',
  }
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesOpened).toEqual(['inbox'])
  expect(await label()).toBe('Open inbox')

  await $.ui.mount(PANE)
  await clock.settle()
  expect(await label()).toBe('Go to inbox')
  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesClosed).toEqual([])
})

test('Go to inbox on the desktop band closes the pane and opens it again, since the app can hide it without a close, and on the terminal band only opens it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
  await band.press({ key: 'open-inbox' })
  await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'dock' } })
  await clock.settle()
  expect(w.panesClosed).toEqual([])

  await band.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesClosed).toEqual(['inbox'])
  expect(w.panesOpened).toEqual(['inbox', 'inbox'])
  expect((await band.find({ key: 'open-inbox' }))?.props.label).toBe('Go to inbox')

  const terminalBand = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await terminalBand.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesClosed).toEqual(['inbox'])
})
