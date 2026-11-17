import { expect, test } from 'bun:test'

import { addFinding } from '../../hooks/ledger-update'
import { CLOSED_SHOWN, earlierLabel, foldLabel, settledLabel, shortAgo } from '../../hooks/rows'
import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { shownTabs } from '../../hooks/tabs'
import { sessionView } from '../../hooks/session-view'
import { cellWidth } from '../../hooks/text'
import { demoState } from '../src/demo'
import { drawPanel, INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { followRows } from '../src/panel-tabs'
import { emptyState } from '../src/state'
import { drawn, ESC, firstQuestion, keys, NOW, onPage, screenOf, strip, style, text } from './panel-harness'

test('the selected tab draws inverse and the others draw their counts', () => {
  const screen = screenOf()
  const bar = drawn(screen, keys(screen, INITIAL_UI, '2'))[1]!
  expect(bar).toContain(`${ESC}7m${ESC}1m [2] Finds ${screen.view.findings.count} `)
  expect(strip(bar)).toContain(`[1] Asks ${screen.view.needsYou.count}`)
  expect(strip(bar)).toContain(`[4] PRs ${screen.view.prs.count}`)
  expect(strip(bar)).toContain('esc to close')
})

test('the Timeline tab is highlighted while the Timeline page shows', () => {
  const screen = screenOf({ isNextBuild: true })
  const bar = drawn(screen, { ...INITIAL_UI, tab: 'timeline' })[1]!

  expect(bar).toContain(`${ESC}7m${ESC}1m [4] Timeline`)
  expect(bar).not.toContain(`${ESC}7m${ESC}1m [3] Finds`)
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
  const unfolded = keys(screen, { ...INITIAL_UI, selectedId: 'fold question' }, 'enter')
  const shown = text(screen, unfolded)
  expect(shown).toContain(`▾  ${foldLabel(closed.length)}`)
  for (const d of closed.slice(0, CLOSED_SHOWN)) expect(shown).toContain(d.ask)
  expect(shown).not.toContain(closed[CLOSED_SHOWN]!.ask)
  expect(shown).toContain(earlierLabel(closed.length, CLOSED_SHOWN)!)
  const dismissed = closed.slice(0, CLOSED_SHOWN).find(d => d.how === 'dismissed')!
  const onDismissed = keys(screen, unfolded, 'down')
  expect(onDismissed.selectedId).toBe(`closed ${dismissed.id}`)
  expect(handleKey(screen, onDismissed, 'enter', NOW).press).toEqual({ id: dismissed.id, action: 'undo' })
  expect(text(screen, onDismissed)).toContain('Reopen')
  const all = keys(screen, { ...unfolded, selectedId: 'earlier question' }, 'enter')
  for (const d of closed) expect(text(screen, all)).toContain(d.ask)
  expect(text(screen, all)).not.toContain(earlierLabel(closed.length, CLOSED_SHOWN)!)
  expect(text(screen, keys(screen, unfolded, 'enter'))).not.toContain(closed[0]!.ask)
})

test('Closed lists every record and the group fold folds it back; j/k and arrows scroll the narrow panel', () => {
  const base = screenOf()
  const source = base.view.needsYou.closed.questions
  expect(source.length).toBeGreaterThan(3)
  const closed = source.map(d => ({ ...d, delivery: { error: 'queue refused', canUndo: true } }))
  const screen = screenOf({
    view: {
      ...base.view,
      needsYou: {
        ...base.view.needsYou,
        questions: [],
        tasks: [],
        closed: { ...base.view.needsYou.closed, questions: closed },
      },
    },
  })
  const width = 40
  const unfolded = keys(screen, { ...INITIAL_UI, selectedId: 'fold question' }, 'enter')
  const shown = text(screen, unfolded)
  expect(shown).toContain(`▾  ${foldLabel(closed.length)}`)
  for (const d of closed.slice(0, CLOSED_SHOWN)) {
    expect(shown).toContain(d.ask)
    expect(shown).toContain(settledLabel(d.outcomeLabel, d.delivery))
    expect(shown).toContain(shortAgo(NOW - d.at))
  }
  const earlier = keys(screen, { ...unfolded, selectedId: 'earlier question' }, 'enter')
  const all = text(screen, earlier)
  for (const d of closed) expect(all).toContain(d.ask)
  const narrow = text(screen, earlier, width)
  for (const d of closed) expect(narrow).toContain(d.ask.slice(0, 10))

  const firstByJ = keys(screen, earlier, 'j')
  const firstByDown = keys(screen, earlier, 'down')
  expect(firstByJ.selectedId).toBe(`closed ${closed[0]!.id}`)
  expect(firstByJ.selectedId).toBe(firstByDown.selectedId)
  const lastByJ = keys(screen, firstByJ, ...Array.from({ length: closed.length - 1 }, () => 'j'))
  const lastByDown = keys(screen, firstByDown, ...Array.from({ length: closed.length - 1 }, () => 'down'))
  expect(lastByJ.selectedId).toBe(`closed ${closed.at(-1)!.id}`)
  expect(lastByJ.selectedId).toBe(lastByDown.selectedId)
  expect(keys(screen, lastByJ, 'k').selectedId).toBe(keys(screen, lastByJ, 'up').selectedId)

  const frame = drawPanel(screen, lastByJ, width, NOW, style, 12)
  expect(frame.lines.map(strip).some(line => line.includes('↑ ') && line.includes('more lines'))).toBe(true)
  expect(frame.lines.map(strip).join('\n')).toContain(closed.at(-1)!.ask.slice(0, 10))
  expect(frame.lines.every(line => cellWidth(strip(line)) <= width)).toBe(true)

  const folded = keys(screen, { ...lastByJ, selectedId: 'fold question' }, 'enter')
  expect(folded.unfolded).not.toContain('question')
  expect(text(screen, folded, width)).not.toContain(closed[0]!.ask.slice(0, 10))
  const reopened = keys(screen, { ...folded, selectedId: 'fold question' }, 'enter')
  expect(text(screen, reopened, width)).toContain(closed[0]!.ask.slice(0, 10))
})

test('a finding closed as list full appears in the Finds Closed fold', () => {
  const state = emptyState('list-full')
  const finding = { kind: 'issue' as const, title: '', detail: 'detail', path: null, at: 1 }
  const ledger = Array.from({ length: 31 }, (_, n) => n).reduce(
    (value, n) => addFinding(value, { ...finding, title: `Problem ${n + 1}`, at: n + 1 }).ledger,
    state.ledger,
  )
  const view = sessionView({ ...state, ledger }, NOW, SETTLED_MS, NO_HOLDS)
  const screen = screenOf({ view })
  const ui: PanelUi = { ...INITIAL_UI, tab: 'findings', unfolded: ['issue'], selectedId: 'fold issue' }
  const shown = text(screen, ui)

  expect(shown).toContain('Problem 1')
  expect(shown).toContain('List full')
})

test('a closed row whose Done message was refused offers Undo, which presses undo for its row', () => {
  const s = demoState(NOW)
  const task = s.ledger.closed.find(d => d.kind === 'task' && d.how === 'done')!
  const refused = { ...task, doneNotification: { id: 'n1', error: 'queue refused' } }
  const ledger = { ...s.ledger, closed: s.ledger.closed.map(d => (d.id === task.id ? refused : d)) }
  const screen = screenOf({ view: sessionView({ ...s, ledger }, NOW, SETTLED_MS, NO_HOLDS) })
  const ui: PanelUi = { ...INITIAL_UI, unfolded: ['task'], selectedId: `closed ${task.id}` }
  expect(text(screen, ui)).toContain('Not sent: queue refused')
  expect(handleKey(screen, ui, 'enter', NOW).press).toEqual({ id: task.id, action: 'undo' })
})

const findingsOnly = () => {
  const s = demoState(NOW)

  return screenOf({
    view: sessionView({ ...s, ledger: { ...s.ledger, items: [], closed: [] } }, NOW, SETTLED_MS, NO_HOLDS),
  })
}

test('a panel that opens on an empty Asks moves to the first tab with open rows', () => {
  expect(followRows(findingsOnly(), INITIAL_UI, {}, true, NOW).ui.tab).toBe('findings')
})

test('rows that arrive while Asks shows only its empty text move the panel to their tab', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, NO_HOLDS) })
  const opened = followRows(empty, INITIAL_UI, {}, true, NOW)
  expect(opened.ui.tab).toBe('needsYou')
  expect(followRows(findingsOnly(), opened.ui, opened.seen, false, NOW).ui.tab).toBe('findings')
})

test('a PR that arrives while Asks shows only its empty text moves the panel to PRs', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, NO_HOLDS) })
  const opened = followRows(empty, INITIAL_UI, {}, true, NOW)
  const withPr = screenOf({ view: sessionView(demoState(NOW), NOW, SETTLED_MS, NO_HOLDS) })
  const prsOnly = {
    ...withPr,
    view: { ...withPr.view, needsYou: empty.view.needsYou, findings: empty.view.findings },
  }
  expect(followRows(prsOnly, opened.ui, opened.seen, false, NOW).ui.tab).toBe('prs')
})

test('a new row above the default selection leaves the selection on its row', () => {
  const s = demoState(NOW)
  const before = screenOf()
  const { seen } = followRows(before, INITIAL_UI, {}, true, NOW)
  const selectedBefore = handleKey(before, INITIAL_UI, 'noop', NOW).ui.selectedId
  const question = s.ledger.items.find(i => i.id === firstQuestion(before).id)!
  const items = [{ ...question, id: 'new-question', ask: 'A new question?' }, ...s.ledger.items]
  const after = screenOf({
    view: sessionView({ ...s, ledger: { ...s.ledger, items } }, NOW, SETTLED_MS, NO_HOLDS),
  })
  expect(handleKey(after, INITIAL_UI, 'noop', NOW).ui.selectedId).toBe('new-question')
  expect(followRows(after, INITIAL_UI, seen, false, NOW).ui.selectedId).toBe(selectedBefore)
})

const tabLine = (screen: PanelScreen, ui: PanelUi, width: number) =>
  strip(drawn(screen, ui, width)[1]!)
    .replace(/esc to close\s*$/, '')
    .trimEnd()

test('rows that arrive while the Status page shows leave the panel on the page', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, NO_HOLDS) })
  const opened = followRows(empty, onPage, {}, true, NOW)
  expect(opened.ui).toEqual(onPage)
  expect(followRows(findingsOnly(), opened.ui, opened.seen, false, NOW).ui).toEqual(onPage)
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, a narrowing tab line drops the brackets, then names every tab by its symbol, and draws no zero count`, () => {
    const tabs = shownTabs(isNextBuild, true)
    const zeros = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, NO_HOLDS), isNextBuild })
    for (const screen of [screenOf({ isNextBuild }), zeros])
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
        if (isNextBuild) expect(symbols).toContain(`[${shown.hotkey}] ${shown.symbol}`)
        if (screen === zeros) expect(tabLine(screen, ui, 200)).not.toMatch(/ 0 /)
        for (const width of isNextBuild ? [42, symbolsAt] : [symbolsAt]) {
          const line = tabLine(screen, ui, width).replace(/[[\]]/g, '')
          expect(cellWidth(line)).toBeLessThanOrEqual(width)
          if (width === symbolsAt) {
            expect(line).not.toContain('…')
            for (const t of tabs) {
              expect(line).toContain(`${t.hotkey} ${t.symbol}`)
              expect(line).not.toContain(t.label)
            }
          }
        }
        expect(tabLine(screen, ui, 200)).not.toContain(isNextBuild ? '[6]' : 'Status')
      }
  })

test('the tab line counts each symbol as two cells, so it fits the panel and keeps "esc to close" whole', () => {
  for (const isNextBuild of [false, true])
    for (const shown of shownTabs(isNextBuild, true))
      for (let width = 34; width <= 120; width++) {
        const bar = strip(drawn(screenOf({ isNextBuild }), { ...INITIAL_UI, tab: shown.id }, width)[1]!)
        expect(cellWidth(bar)).toBeLessThanOrEqual(width)
        if (bar.includes('esc')) expect(bar.trimEnd()).toEndWith('esc to close')
      }
})
