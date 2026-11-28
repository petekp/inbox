import { expect, test } from 'bun:test'

import { allOf, focusTerminal, openPanel } from './gpui-stand-in'
import type { StandInScroll } from './gpui-stand-in'

type Panel = Awaited<ReturnType<typeof openPanel>>

function scrollOf(panel: Panel): StandInScroll {
  const list = allOf(panel.paint()).find(n => n.id === 'inbox-list')
  if (!list?.scroll) throw new Error('the list tracks no scroll position')
  return list.scroll
}

function show(panel: Panel, id: string): StandInScroll {
  const target = allOf(panel.paint()).find(n => n.id === id)
  if (!target) throw new Error(`no ${id} is drawn`)
  panel.click(target)
  return scrollOf(panel)
}

test('each tab keeps where the person left it and opens at its top the first time, and Help opens at its top each time', async () => {
  const panel = await openPanel()
  scrollOf(panel).y = 120
  expect(show(panel, 'tab findings').y).toBe(0)
  scrollOf(panel).y = 80
  expect(show(panel, 'help').y).toBe(0)
  scrollOf(panel).y = 40
  expect(show(panel, 'tab needsYou').y).toBe(120)
  expect(show(panel, 'tab findings').y).toBe(80)
  expect(show(panel, 'help').y).toBe(0)
})

test('a move the look makes opens its tab at the top, and a switch to another session opens every place there', async () => {
  const panel = await openPanel()
  scrollOf(panel).y = 120
  show(panel, 'tab findings').y = 80
  panel.panel.run({ kind: 'tab-shown', tab: 'needsYou', startsOver: true }, null, panel.cx as never)
  expect(show(panel, 'tab needsYou').y).toBe(0)
  expect(show(panel, 'tab findings').y).toBe(80)
  focusTerminal('t2')
  panel.paint()
  focusTerminal('t1')
  panel.paint()
  await panel.settle()
  expect(scrollOf(panel).y).toBe(0)
})
