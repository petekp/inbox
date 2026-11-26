import { beforeEach, expect, test } from 'bun:test'

import { ownPaneOf, PaneWidth } from '../src/pane-width'

const sharedValues = new Map<string, unknown>()
const ranCommands: { name: string; args: Record<string, unknown> }[] = []
let zoom = 1
const calls = {
  pane: () => 'p-inbox',
  zoom: () => zoom,
  shared: (key: string) => sharedValues.get(key),
  setShared: (key: string, value: unknown) => sharedValues.set(key, value),
  run: (name: string, args: Record<string, unknown>) => ranCommands.push({ name, args }),
}
const setZoom = (to: number) => {
  zoom = to
}

const KEY = 'inbox.paneWidth'

/** A context whose timers fire at once, so a settled width is kept within the call. */
const cx = { timer: { after: (_ms: number, fire: (cx: unknown) => void) => (fire(cx), { cancel() {} }) } } as never

beforeEach(() => {
  sharedValues.clear()
  ranCommands.length = 0
  setZoom(1)
})

test('a first panel keeps its width for the next one', () => {
  new PaneWidth(calls).measured(420, cx)

  expect(sharedValues.get(KEY)).toBe(420)
  expect(ranCommands).toEqual([])
})

test('a new panel narrower than the kept width grows to it', () => {
  sharedValues.set(KEY, 600)
  const width = new PaneWidth(calls)
  width.measured(450, cx)

  expect(ranCommands).toEqual([{ name: 'pane.resize', args: { pane: 'p-inbox', direction: 'left', px: 150 } }])
  expect(sharedValues.get(KEY)).toBe(600)
  width.measured(600, cx)
  expect(ranCommands).toHaveLength(1)
})

test('a new panel wider than the kept width shrinks to it', () => {
  sharedValues.set(KEY, 300)
  new PaneWidth(calls).measured(500, cx)

  expect(ranCommands).toEqual([{ name: 'pane.resize', args: { pane: 'p-inbox', direction: 'right', px: 200 } }])
})

test('a new panel close to the kept width is left as split', () => {
  sharedValues.set(KEY, 500)
  new PaneWidth(calls).measured(504, cx)

  expect(ranCommands).toEqual([])
  expect(sharedValues.get(KEY)).toBe(504)
})

test('a width the person drags to later is kept', () => {
  sharedValues.set(KEY, 500)
  const width = new PaneWidth(calls)
  width.measured(500, cx)
  width.measured(380, cx)

  expect(sharedValues.get(KEY)).toBe(380)
  expect(ranCommands).toEqual([])
})

test('widths are kept at zoom 1 and resized at the app zoom', () => {
  setZoom(2)
  sharedValues.set(KEY, 400)
  new PaneWidth(calls).measured(600, cx)

  expect(ranCommands).toEqual([{ name: 'pane.resize', args: { pane: 'p-inbox', direction: 'left', px: 200 } }])
})

test('a hidden panel, measured at no width, changes nothing', () => {
  sharedValues.set(KEY, 400)
  new PaneWidth(calls).measured(0, cx)

  expect(ranCommands).toEqual([])
  expect(sharedValues.get(KEY)).toBe(400)
})

test('a panel /inbox split, told no pane, finds the inbox pane in the tab it follows', () => {
  const panes = [
    { pane: 'p-other-inbox', mod: 'inbox', tab: 'tab2' },
    { pane: 'p-agent', tab: 'tab1' },
    { pane: 'p-inbox', mod: 'inbox', tab: 'tab1' },
  ]

  expect(ownPaneOf(undefined, panes, 'tab1')).toBe('p-inbox')
  expect(ownPaneOf('p-told', panes, 'tab1')).toBe('p-told')
  expect(ownPaneOf(undefined, panes, null)).toBeNull()
})
