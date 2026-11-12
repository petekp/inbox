import { expect, setSystemTime, test } from 'bun:test'

import { GOAL_KEYS_ID } from '../../hooks/status-keys'
import { NOW } from './fixtures'
import { allOf, keysHolder, openPanel } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

setSystemTime(new Date(NOW))

const idsOf = (root: Painted, prefix: string) =>
  allOf(root).flatMap(n => (n.id?.startsWith(prefix) && n.click ? [n.id] : []))

async function reach(path: string[]) {
  const panel = await openPanel()
  for (const id of path) {
    const target = allOf(panel.paint()).find(n => n.id === id)
    if (target === undefined) return null
    panel.click(target)
    await panel.settle()
  }

  return panel
}

async function sweep() {
  const fields: { rowId: string; keepsKeys: boolean }[] = []
  const outButtons: Painted[] = []
  const first = await openPanel()
  for (const tab of idsOf(first.paint(), 'tab ')) {
    const onTab = await reach([tab])
    if (onTab === null) continue
    const starts = [[tab], ...idsOf(onTab.paint(), 'row ').map(row => [tab, row])]
    for (const start of starts) {
      const before = await reach(start)
      if (before === null) continue
      for (const button of idsOf(before.paint(), 'button ')) {
        const panel = await reach([...start, button])
        if (panel === null) continue
        const painted = allOf(panel.paint())
        outButtons.push(...painted.filter(n => n.isDisabled))
        const field = painted.find(n => n.field !== null)
        if (field?.field == null || panel.panel.input === null) continue
        panel.click(field)
        fields.push({ rowId: panel.panel.input.rowId, keepsKeys: keysHolder() === field.field })
      }
    }
  }

  return { fields, outButtons }
}

const swept = await sweep()

test('a click into an open text field leaves the keys with the field', () => {
  const rowIds = swept.fields.map(f => f.rowId)
  expect(rowIds).toContain(GOAL_KEYS_ID)
  expect(rowIds.some(id => id !== GOAL_KEYS_ID)).toBe(true)
  expect(swept.fields.filter(f => !f.keepsKeys).map(f => f.rowId)).toEqual([])
})

test('a button whose press is out takes no hover and no click', () => {
  expect(swept.outButtons.length).toBeGreaterThan(0)
  expect(swept.outButtons.filter(n => n.hasHover || n.click !== null).map(n => n.id)).toEqual([])
})
