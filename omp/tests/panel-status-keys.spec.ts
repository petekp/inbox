import { expect, test } from 'bun:test'

import { SETTLED_MS, NO_HOLDS, PRESS_GUARD_MS } from '../../hooks/timing'
import { shownTabs } from '../../hooks/tabs'
import { statusKeyPlan, statusKeyRows } from '../../hooks/status-keys'
import type { StatusRow } from '../../hooks/status-page'
import { sessionView } from '../../hooks/session-view'
import { demoState } from '../src/demo'
import { drawPanel } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { keys, labelOf, NOW, onPage, screenOf, strip, style, text } from './panel-harness'

const goallessScreen = () => {
  const s = demoState(NOW)
  const overview = { ...s.ledger.overview!, goal: null, milestones: [], serves: {} }

  return screenOf({ view: sessionView({ ...s, ledger: { ...s.ledger, overview } }, NOW, SETTLED_MS, true, NO_HOLDS) })
}
const unheldScreen = () => {
  const s = demoState(NOW)
  const ledger = { ...s.ledger, overview: { ...s.ledger.overview!, askSubjects: {} } }

  return screenOf({ view: sessionView({ ...s, ledger }, NOW, SETTLED_MS, true, NO_HOLDS) })
}

test('on a Status page taller than the panel, each ↑↓ press shows one more or one fewer line, up to its last line', () => {
  const screen = screenOf()
  const height = 14
  const bodyOf = (lines: string[]) => {
    const rule = lines.findLastIndex(l => /^─+$/.test(l))

    return lines.slice(3, rule)
  }
  const page = bodyOf(text(screen, onPage, 80).split('\n'))
  const drawnAt = (pageTop: number) => drawPanel(screen, { ...onPage, pageTop }, 80, NOW, style, height)
  const shown = (pageTop: number) => bodyOf(drawnAt(pageTop).lines.map(strip))
  const room = shown(0).length
  const last = page.length - room + 1
  expect(page.length).toBeGreaterThan(room)
  expect(shown(0)).toEqual([...page.slice(0, room - 1), `  ↓ ${page.length - room + 1} more lines`])
  expect(shown(1)).toEqual(['  ↑ 2 more lines', ...page.slice(2, room), `  ↓ ${page.length - room} more lines`])
  expect(shown(last - 1)).toEqual([`  ↑ ${last} more lines`, ...page.slice(last, -1), '  ↓ 1 more line'])
  expect(shown(last)).toEqual([`  ↑ ${last} more lines`, ...page.slice(last)])
  expect(drawnAt(1000).pageTop).toBe(last)
  for (let top = 0; top <= last; top++) {
    const lines = shown(top).filter(l => !/^ {2}[↑↓] \d+ more line/.test(l))
    expect(page[room - 2 + top]).toBe(lines.at(-1))
  }
  expect(drawnAt(0).lines.map(strip).slice(-2).join('\n')).toContain('↑↓ scroll')
  const down = keys(screen, onPage, 'down', 'down')
  expect(down.pageTop).toBe(2)
  expect(keys(screen, down, 'up').pageTop).toBe(1)
  expect(keys(screen, down, 'up', 'up', 'up').pageTop).toBe(0)
})

test('on the Status page, a subject an open ask holds up draws View, named for the ask’s kind, under its text in the plan’s order, and only the selected row draws it focused and keyed', () => {
  const screen = goallessScreen()
  const page = screen.view.statusPage
  const held = page.rows.filter(r => statusKeyPlan(r).length > 0)
  expect(statusKeyRows(page).map(t => t.id)).toEqual(['goal', 's2', 's3'])
  const lines = text(screen, onPage).split('\n')
  const nameAt = (row: StatusRow) => lines.findIndex(l => l.includes(labelOf(row)))
  const buttonAt = (row: StatusRow) => lines.findIndex((l, n) => n > nameAt(row) && l.includes('View '))
  expect(held.map(row => statusKeyPlan(row).map(k => k.label))).toEqual([['View task'], ['View question']])
  for (const row of held) {
    const at = buttonAt(row)
    const next = page.rows[page.rows.indexOf(row) + 1]
    expect(at).toBeGreaterThan(nameAt(row))
    if (next) expect(at).toBeLessThan(nameAt(next))
    const textAt = lines[nameAt(row)]!.indexOf(labelOf(row))
    expect(lines[at]!.slice(0, textAt).replace('│', '').trim()).toBe('')
    expect(lines[at]![textAt]).not.toBe(' ')
  }
  expect(lines[buttonAt(held[0]!)]).toContain('↵ View task')
  expect(lines[buttonAt(held[1]!)]).not.toContain('↵')
  expect(lines[buttonAt(held[1]!)]).not.toContain('v View question')
  const second = keys(screen, onPage, 'j')
  const moved = text(screen, second).split('\n')
  expect(moved[buttonAt(held[0]!)]).not.toContain('↵')
  expect(moved[buttonAt(held[1]!)]).toContain('↵ View question')
  expect(keys(screen, second, 'j').selectedId).toBe('goal')
  expect(keys(screen, onPage, 'k').selectedId).toBe('goal')
  expect(text(screen, onPage).split('\n').at(-1)).toContain('j k select')
  expect(text(unheldScreen(), onPage)).not.toContain('View ')
})

test('View on a Status row shows Asks with the oldest ask that holds it up selected, by its key or Enter, sends nothing, and holds the ask’s buttons through a second Enter', () => {
  const screen = goallessScreen()
  for (const key of ['v', 'enter']) {
    const result = handleKey(screen, onPage, key, NOW)
    expect(result.press).toBeUndefined()
    expect(result.ui).toMatchObject({ tab: 'needsYou', selectedId: 'd17', shownSince: NOW })
    expect(handleKey(screen, result.ui, 'noop', NOW).ui.selectedId).toBe('d17')
  }
  const onS3 = keys(screen, onPage, 'j')
  const onAsk = handleKey(screen, onS3, 'enter', NOW).ui
  expect(onAsk).toMatchObject({ tab: 'needsYou', selectedId: 'd11' })
  expect(handleKey(screen, onAsk, 'enter', NOW + PRESS_GUARD_MS - 1).press).toBeUndefined()
  expect(handleKey(screen, onAsk, 'enter', NOW + PRESS_GUARD_MS).press).toMatchObject({ action: 'answer', id: 'd11' })
})

test('a Status row’s View leaves once its asks close, and the selection moves to the row that still has one', () => {
  const s = demoState(NOW)
  const items = s.ledger.items.filter(i => i.id !== 'd11')
  const screen = screenOf({
    view: sessionView({ ...s, ledger: { ...s.ledger, items } }, NOW, SETTLED_MS, true, NO_HOLDS),
  })
  const onS3 = { ...onPage, selectedId: 's3' }
  const lines = text(screen, onS3).split('\n')
  const s3 = screen.view.statusPage.rows.find(r => r.id === 's3')!
  expect(s3).toMatchObject({ ask: null, mark: '○' })
  expect(lines.filter(l => l.includes('View '))).toHaveLength(1)
  expect(lines.find(l => l.includes('View '))).toContain('↵ View task')
  expect(handleKey(screen, onS3, 'v', NOW).ui.selectedId).toBe('d17')
})

test('on a Status page taller than the panel, j and k scroll the newly selected row into view', () => {
  const screen = goallessScreen()
  const height = 14
  const drawnFor = (ui: PanelUi) => drawPanel(screen, ui, 80, NOW, style, height)
  const isFocusShown = (ui: PanelUi) =>
    drawnFor(ui)
      .lines.map(strip)
      .some(l => l.includes('↵ View'))
  expect(isFocusShown(onPage)).toBe(true)
  const onS3 = keys(screen, onPage, 'j')
  expect(isFocusShown({ ...onS3, pageReveal: null })).toBe(false)
  expect(isFocusShown(onS3)).toBe(true)
  const scrolled = { ...onS3, pageTop: drawnFor(onS3).pageTop, pageReveal: null }
  expect(scrolled.pageTop).toBeGreaterThan(0)
  const back = keys(screen, scrolled, 'k')
  expect(isFocusShown({ ...back, pageReveal: null })).toBe(false)
  expect(isFocusShown(back)).toBe(true)
})

test('changing the shown tab starts the Status page at its top', () => {
  const screen = screenOf({ isNextBuild: true })
  const scrolled = { ...onPage, pageTop: 3 }
  for (const key of ['tab', 'shift+tab', ...shownTabs(true).map(t => t.hotkey)])
    expect(keys(screen, scrolled, key).pageTop).toBe(0)
})
