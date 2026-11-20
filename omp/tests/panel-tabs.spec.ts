import { expect, test } from 'bun:test'

import { CLOSED_SHOWN, earlierLabel, foldLabel } from '../../hooks/rows'
import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { shownTabs } from '../../hooks/tabs'
import { sessionView } from '../../hooks/session-view'
import { cellWidth } from '../../hooks/text'
import { demoState } from '../src/demo'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { emptyState } from '../src/state'
import { cursorOf, drawn, ESC, keyed, keys, NOW, screenOf, strip, text, withCursorOn } from './panel-harness'

test('the selected tab draws inverse and the others draw their counts', () => {
  const screen = screenOf()
  const bar = drawn(screen, keys(screen, INITIAL_UI, '3'))[1]!
  expect(bar).toContain(`${ESC}7m${ESC}1m [3] Finds ${screen.view.findings.count} `)
  expect(strip(bar)).toContain('[1] Status')
  expect(strip(bar)).toContain(`[2] Asks ${screen.view.needsYou.count}`)
  expect(strip(bar)).toContain(`[4] PRs ${screen.view.prs.count}`)
  expect(strip(bar)).toContain('esc to close')
})

test('an empty Asks tab explains itself', () => {
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS) }
  expect(text(empty, INITIAL_UI)).toContain('Nothing needed')
})

test('Enter on a Closed line shows the newest closed rows, Enter on the earlier line lists the rest, a dismissed one offers Reopen, and Enter on the fold folds them', () => {
  const screen = screenOf()
  const settled = new Set(screen.view.needsYou.questions.filter(r => r.state.is === 'settled').map(r => r.id))
  const closed = screen.view.needsYou.closed.questions.filter(d => !settled.has(d.id))
  expect(closed.length).toBeGreaterThan(CLOSED_SHOWN)
  const unfolded = keys(screen, withCursorOn({ ...INITIAL_UI }, 'fold question'), 'enter')
  const shown = text(screen, unfolded)
  expect(shown).toContain(`${foldLabel(closed.length)} v`)
  for (const d of closed.slice(0, CLOSED_SHOWN)) expect(shown).toContain(d.ask)
  expect(shown).not.toContain(closed[CLOSED_SHOWN]!.ask)
  expect(shown).toContain(earlierLabel(closed.length, CLOSED_SHOWN)!)
  const dismissed = closed.slice(0, CLOSED_SHOWN).find(d => d.how === 'dismissed')!
  const onDismissed = keys(screen, unfolded, 'down')
  expect(cursorOf(onDismissed)).toBe(`closed ${dismissed.id}`)
  expect(keyed(screen, onDismissed, 'enter', NOW).press).toEqual({ id: dismissed.id, action: 'undo' })
  expect(text(screen, onDismissed)).toContain('Reopen')
  const all = keys(screen, withCursorOn({ ...unfolded }, 'earlier question'), 'enter')
  for (const d of closed) expect(text(screen, all)).toContain(d.ask)
  expect(text(screen, all)).not.toContain(earlierLabel(closed.length, CLOSED_SHOWN)!)
  expect(text(screen, keys(screen, unfolded, 'enter'))).not.toContain(closed[0]!.ask)
})

test('a closed row whose Done message was refused offers Undo, which presses undo for its row', () => {
  const s = demoState(NOW)
  const task = s.ledger.closed.find(d => d.kind === 'task' && d.how === 'done')!
  const refused = { ...task, doneNotification: { id: 'n1', error: 'queue refused' } }
  const ledger = { ...s.ledger, closed: s.ledger.closed.map(d => (d.id === task.id ? refused : d)) }
  const screen = screenOf({ view: sessionView({ ...s, ledger }, NOW, SETTLED_MS, NO_HOLDS) })
  const ui: PanelUi = withCursorOn({ ...INITIAL_UI, unfolded: ['task'] }, `closed ${task.id}`)
  expect(text(screen, ui)).toContain('Not sent: queue refused')
  expect(keyed(screen, ui, 'enter', NOW).press).toEqual({ id: task.id, action: 'undo' })
})

const tabLine = (screen: PanelScreen, ui: PanelUi, width: number) =>
  strip(drawn(screen, ui, width)[1]!)
    .replace(/esc to close\s*$/, '')
    .trimEnd()

test('a narrowing tab line drops the brackets, then names every tab by its symbol, and draws no zero count', () => {
  const tabs = shownTabs()
  const zeros = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, NO_HOLDS) })
  for (const screen of [screenOf(), zeros])
    for (const shown of tabs) {
      const ui = { ...INITIAL_UI, tab: shown.id }
      const wordsAt = cellWidth(tabLine(screen, ui, 200)) + 1
      expect(tabLine(screen, ui, wordsAt)).toContain(`[${shown.hotkey}] ${shown.label}`)
      const bare = tabLine(screen, ui, wordsAt - 1)
      expect(bare).not.toContain('[')
      expect(bare).toContain(`${shown.hotkey} ${shown.label}`)
      const symbolsAt = cellWidth(bare) - 1
      const symbols = tabLine(screen, ui, symbolsAt)
      expect(symbols.replace(/[[\]]/g, '')).toContain(`${shown.hotkey} ${shown.symbol}`)
      expect(symbols).toContain(`[${shown.hotkey}] ${shown.symbol}`)
      if (screen === zeros) expect(tabLine(screen, ui, 200)).not.toMatch(/ 0 /)
      for (const width of [34, symbolsAt]) {
        const line = tabLine(screen, ui, width).replace(/[[\]]/g, '')
        expect(line).not.toContain('…')
        for (const t of tabs) {
          expect(line).toContain(`${t.hotkey} ${t.symbol}`)
          expect(line).not.toContain(t.label)
        }
      }
      expect(tabLine(screen, ui, 200)).not.toContain('[5]')
    }
})

test('the tab line counts each symbol as two cells, so it fits the panel and keeps "esc to close" whole', () => {
  for (const shown of shownTabs())
    for (let width = 34; width <= 120; width++) {
      const bar = strip(drawn(screenOf(), { ...INITIAL_UI, tab: shown.id }, width)[1]!)
      expect(cellWidth(bar)).toBeLessThanOrEqual(width)
      if (bar.includes('esc')) expect(bar.trimEnd()).toEndWith('esc to close')
    }
})
