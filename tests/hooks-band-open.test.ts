import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'
import { BAND, PANE } from './hooks-helpers'
import type { TabsProps } from '../hooks/pane/tabs-client'

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

test('Go to inbox on the desktop band only opens a pane the app draws, closes and opens again one the app hid without a close, where the new tabs Client takes over the tab row, and on the terminal band only opens it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
  await band.press({ key: 'open-inbox' })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'dock' } })
  await clock.settle()

  const isTabRowByClient = async (drawn: typeof pane) =>
    !((await drawn.find({ key: 'tabs' }))?.props.props as TabsProps).isDrawnByPane &&
    (await drawn.find({ key: 'tabs-by-pane' })) === undefined &&
    (await drawn.find({ text: 'Asks', in: 'tabs' })) !== undefined
  expect(await isTabRowByClient(pane)).toBe(true)

  await band.press({ key: 'open-inbox' })
  await clock.advance(1000)
  expect(w.panesClosed).toEqual([])
  expect(w.panesOpened).toEqual(['inbox', 'inbox'])

  await pane.unmount()
  await band.press({ key: 'open-inbox' })
  await clock.advance(1000)
  expect(w.panesClosed).toEqual(['inbox'])
  expect(w.panesOpened).toEqual(['inbox', 'inbox', 'inbox'])
  expect((await band.find({ key: 'open-inbox' }))?.props.label).toBe('Go to inbox')
  const shownAgain = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'dock' } })
  expect(await isTabRowByClient(shownAgain)).toBe(true)

  const terminalBand = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await terminalBand.press({ key: 'open-inbox' })
  await clock.settle()
  expect(w.panesClosed).toEqual(['inbox'])
})
