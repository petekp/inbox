import { expect, test } from 'bun:test'

import { FOLD_QUIET_MS, PRESS_GUARD_MS } from '../../core/view/timing'
import type { UiEvent } from '../../core/view/ui-controller-types'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { applyEvents } from '../src/panel-keys'
import { cursorOf, keyed, keys, NOW, onPage, screenOf } from './panel-harness'

const read: UiEvent = { type: 'read', host: { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null } }

const withoutAsk = (screen: PanelScreen, id: string): PanelScreen => {
  const questions = screen.view.needsYou.questions.filter(r => r.id !== id)
  const needsYou = { ...screen.view.needsYou, questions, count: screen.view.needsYou.count - 1 }

  return { ...screen, view: { ...screen.view, needsYou } }
}

const withNoFindings = (screen: PanelScreen): PanelScreen => ({
  ...screen,
  view: { ...screen.view, findings: { ...screen.view.findings, rows: [], count: 0 } },
})

test('each row tab keeps its own cursor, so switching back returns to the same row', () => {
  const screen = screenOf()
  const onAsks = keys(screen, INITIAL_UI, 'down')
  expect(cursorOf(onAsks)).toBe('d12')
  const toTab = (ui: PanelUi, tab: PanelUi['tab']) => {
    let next = ui
    for (let n = 0; n < 4 && next.tab !== tab; n++) next = keys(screen, next, 'tab')
    return next
  }
  const onFinds = keys(screen, toTab(onAsks, 'findings'), 'down')
  expect(onFinds.tab).toBe('findings')
  expect(cursorOf(onFinds)).toBe('d22')
  expect(cursorOf(toTab(onFinds, 'needsYou'))).toBe('d12')
  expect(cursorOf(toTab(toTab(onFinds, 'needsYou'), 'findings'))).toBe('d22')
})

test('after View opens an ask, the guard holds only Enter on that row: the cursor moves, and Enter on the next row presses it', () => {
  const screen = screenOf()
  const onAsk = keyed(screen, onPage, 'enter', NOW).ui
  expect(cursorOf(onAsk)).toBe('d11')
  const moved = keyed(screen, onAsk, 'down', NOW + 1).ui
  expect(cursorOf(moved)).toBe('d12')
  expect(keyed(screen, moved, 'enter', NOW + 2).press).toMatchObject({ id: 'd12' })
  expect(keyed(screen, keyed(screen, moved, 'up', NOW + 3).ui, 'enter', NOW + 4).press).toMatchObject({ id: 'd11' })
  expect(keyed(screen, onAsk, 'enter', NOW + PRESS_GUARD_MS - 1).press).toBeUndefined()
})

function arrivalSetup() {
  const before = withNoFindings(withoutAsk(screenOf(), 'd11'))
  const after = withNoFindings(screenOf())
  const ui: PanelUi = applyEvents(before, { ...INITIAL_UI, tab: 'findings', shownSince: NOW }, [read], NOW).ui

  return { before, after, ui }
}

test('a row that arrives on Asks while Finds draws nothing is followed once keys have been quiet for FOLD_QUIET_MS', () => {
  const { after, ui } = arrivalSetup()
  expect(applyEvents(after, ui, [read], NOW + FOLD_QUIET_MS).ui.tab).toBe('needsYou')
  const keyedUi = keyed(after, ui, 'down', NOW).ui
  const held = applyEvents(after, keyedUi, [read], NOW + 10).ui
  expect(held.tab).toBe('findings')
  expect(applyEvents(after, held, [{ type: 'tick' }], NOW + FOLD_QUIET_MS).ui.tab).toBe('needsYou')
})

test('a row that arrives while Help shows is not followed, even after Help closes', () => {
  const { after, ui } = arrivalSetup()
  const help = keyed(after, ui, '?', NOW).ui
  expect(help.isHelpShown).toBe(true)
  const arrived = applyEvents(after, help, [read], NOW + FOLD_QUIET_MS).ui
  expect(arrived.tab).toBe('findings')
  const closed = keyed(after, arrived, '?', NOW + FOLD_QUIET_MS).ui
  expect(applyEvents(after, closed, [read], NOW + 3 * FOLD_QUIET_MS).ui.tab).toBe('findings')
})
