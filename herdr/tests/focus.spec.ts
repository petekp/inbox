import { expect, setSystemTime, test } from 'bun:test'

import { GOAL_KEYS_ID } from '../../hooks/status-keys'
import { PRESS_GUARD_MS } from '../../hooks/timing'
import { NOW } from './fixtures'
import { allOf, focusTerminal, giveKeysElsewhere, keysHolder, openPanel, typeIn } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

setSystemTime(new Date(NOW))

let clock = NOW
const pastGuard = () => setSystemTime(new Date((clock += PRESS_GUARD_MS + 1)))

const idsOf = (root: Painted, prefix: string) =>
  allOf(root).flatMap(n => (n.id?.startsWith(prefix) && n.click ? [n.id] : []))

const byId = (root: Painted, id: string) => allOf(root).find(n => n.id === id)

async function reach(path: string[]) {
  const panel = await openPanel()
  for (const id of path) {
    const target = byId(panel.paint(), id)
    if (target === undefined) return null
    panel.click(target)
    await panel.settle()
  }

  return panel
}

async function sweep() {
  const fields: { rowId: string; misses: string[] }[] = []
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
        const state = field?.field
        if (field === undefined || !state || field.parent === null || panel.panel.input === null) continue
        const rowId = panel.panel.input.rowId
        const misses: string[] = []
        const clicks: [string, Painted][] = [
          ['its text', field],
          ['its box', field.parent],
          ['the list', painted.find(n => n.id === 'inbox-list')!],
        ]
        for (const [where, target] of clicks) {
          giveKeysElsewhere()
          panel.click(target)
          if (keysHolder() !== state) misses.push(`a click on ${where}`)
        }
        if (!allOf(panel.paint()).some(n => n.field === state)) misses.push('the field drawn again')
        panel.click(byId(panel.paint(), 'help')!)
        await panel.settle()
        panel.click(byId(panel.paint(), 'inbox-list')!)
        if (keysHolder() !== 'panel') misses.push('the look taking the keys under Help')
        fields.push({ rowId, misses })
      }
    }
  }

  return { fields, outButtons }
}

const swept = await sweep()

test('a click on an open text field, on its box or in the list gives the field the keys, and under Help the look', () => {
  const rowIds = swept.fields.map(f => f.rowId)
  expect(rowIds).toContain(GOAL_KEYS_ID)
  expect(rowIds.some(id => id !== GOAL_KEYS_ID)).toBe(true)
  expect(swept.fields.filter(f => f.misses.length > 0)).toEqual([])
})

test('a button whose press is out takes no hover and no click', () => {
  expect(swept.outButtons.length).toBeGreaterThan(0)
  expect(swept.outButtons.filter(n => n.hasHover || n.click !== null).map(n => n.id)).toEqual([])
})

test('a press on a row with a status line above its buttons keeps the buttons on the same line of the row', async () => {
  const panel = (await reach(['row d18']))!
  const buttonsLine = () => {
    const underTitle = byId(panel.paint(), 'size rest d18')!.kids[0]!
    return underTitle.kids.findIndex(k => allOf(k).some(n => n.label === 'Explain'))
  }
  const before = buttonsLine()
  const explain = allOf(byId(panel.paint(), 'row d18')!).find(n => n.label === 'Explain')!
  pastGuard()
  panel.click(explain)
  await panel.settle()
  expect(panel.panel.queue.outs.map(o => o.rowId)).toEqual(['d18'])
  expect([before, buttonsLine()]).toEqual([1, 1])
})

test('a typed reply waits with its session while the panel follows another terminal, and comes back with it', async () => {
  const panel = await openPanel()
  const rowId = idsOf(panel.paint(), 'row ').find(id => {
    panel.click(byId(panel.paint(), id)!)
    return allOf(byId(panel.paint(), id)!).some(n => n.label === 'Reply')
  })!
  const pressReply = () => panel.click(allOf(byId(panel.paint(), rowId)!).find(n => n.label === 'Reply')!)
  pressReply()
  typeIn(panel.panel.input!.state, 'Ran it and it passed')
  focusTerminal('t2')
  panel.paint()
  expect(panel.panel.sessionId).toBeNull()
  focusTerminal('t1')
  panel.paint()
  await panel.settle()
  panel.click(byId(panel.paint(), rowId)!)
  pressReply()
  expect(panel.panel.input?.state.value()).toBe('Ran it and it passed')
})

test('a reply sent before the panel follows another terminal is still out when it comes back, so its confirmation can drop the draft', async () => {
  const panel = await openPanel()
  const rowId = idsOf(panel.paint(), 'row ').find(id => {
    panel.click(byId(panel.paint(), id)!)
    return allOf(byId(panel.paint(), id)!).some(n => n.label === 'Reply')
  })!
  panel.click(allOf(byId(panel.paint(), rowId)!).find(n => n.label === 'Reply')!)
  typeIn(panel.panel.input!.state, 'Ran it and it passed')
  pastGuard()
  panel.click(allOf(byId(panel.paint(), rowId)!).find(n => n.label === 'Send')!)
  await panel.settle()
  expect(Object.values(panel.panel.ui.sentReplies).map(t => t.text)).toEqual(['Ran it and it passed'])
  focusTerminal('t2')
  panel.paint()
  focusTerminal('t1')
  panel.paint()
  await panel.settle()
  expect(panel.panel.queue.outs.map(o => `row ${o.rowId}`)).toEqual([rowId])
  expect(Object.values(panel.panel.ui.sentReplies).map(t => t.text)).toEqual(['Ran it and it passed'])
})

test('a click on an open row’s title collapses it and closes its reply field, and the draft is there once it expands', async () => {
  const panel = await openPanel()
  const rowId = idsOf(panel.paint(), 'row ').find(id => {
    panel.click(byId(panel.paint(), id)!)
    return allOf(byId(panel.paint(), id)!).some(n => n.label === 'Reply')
  })!
  const pressReply = () => panel.click(allOf(byId(panel.paint(), rowId)!).find(n => n.label === 'Reply')!)
  pressReply()
  typeIn(panel.panel.input!.state, 'Ran it and it passed')
  pastGuard()
  panel.click(byId(panel.paint(), rowId.replace(/^row /, 'title '))!)
  expect(panel.panel.ui.typing).toBeNull()
  expect(allOf(byId(panel.paint(), rowId)!).some(n => n.label === 'Reply')).toBe(false)
  panel.click(byId(panel.paint(), rowId)!)
  pressReply()
  expect(panel.panel.input?.state.value()).toBe('Ran it and it passed')
})
