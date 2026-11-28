import { expect, test } from 'bun:test'

import { shownTabs } from '../../core/view/tabs'
import { EDGE } from '../src/paint-theme'
import { allOf, openPanel } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

const WORDS_WIDTH = 320
const LABELS = shownTabs().map(t => t.label)
const SYMBOLS = shownTabs().map(t => t.symbol)

const tabsIn = (root: Painted) =>
  shownTabs().map(t => {
    const tab = allOf(root).find(n => n.id === `tab ${t.id}`)
    if (!tab) throw new Error(`the ${t.label} tab is not drawn`)
    return { text: tab.text, name: tab.label?.split(', ')[0] }
  })

async function tabsAt(paneWidth: number | null) {
  const panel = await openPanel()
  if (paneWidth !== null) panel.measure(n => ({ width: n.id === 'tab words' ? WORDS_WIDTH : paneWidth, height: 20 }))

  return tabsIn(panel.paint())
}

test('the tab row shows its words where they fit on one line, else its symbols, and each tab keeps its words as its name', async () => {
  expect((await tabsAt(null)).map(t => t.text)).toEqual(LABELS)
  expect((await tabsAt(WORDS_WIDTH + 2 * EDGE)).map(t => t.text)).toEqual(LABELS)

  const narrow = await tabsAt(WORDS_WIDTH + 2 * EDGE - 1)
  expect(narrow.map(t => t.text)).toEqual(SYMBOLS)
  expect(narrow.map(t => t.name)).toEqual(LABELS)
})
