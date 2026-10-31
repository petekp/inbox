import { expect, test } from 'bun:test'

import { closeItem } from '../../hooks/ledger-close'
import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { shownTabs } from '../../hooks/tabs'
import type { RowView } from '../../hooks/rows'
import { sessionView } from '../../hooks/session-view'
import { demoSource, demoState } from '../src/demo'
import { INITIAL_UI, holdsOf } from '../src/panel'
import { afterHandOff, handleKey } from '../src/panel-keys'
import {
  buttonLine,
  drawn,
  ESC,
  firstQuestion,
  keys,
  NOW,
  onRow,
  plannedLabels,
  screenOf,
  strip,
  text,
  waiting,
} from './panel-harness'

test('r opens a reply field in place of the buttons, and Enter sends the typed words as a type press', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  let ui = handleKey(screen, onRow(row), 'r', NOW).ui
  expect(ui.typing).toBe(row.id)
  for (const ch of 'hi!') ui = handleKey(screen, ui, ch, NOW, ch).ui
  ui = handleKey(screen, ui, 'backspace', NOW).ui
  ui = handleKey(screen, ui, 'space', NOW, ' ').ui
  ui = handleKey(screen, ui, 'a', NOW, 'a').ui
  expect(text(screen, ui)).toContain('hi a')
  expect(text(screen, ui)).not.toContain(`↵ ${row.item!.rec}`)
  const sent = handleKey(screen, ui, 'enter', NOW)
  expect(sent.press).toEqual({ action: 'type', id: row.id, text: 'hi a' })
  expect(sent.ui.typing).toBeNull()
  expect(sent.ui.drafts[row.id]?.text).toBe('hi a')
})

test('Enter in an empty reply field sends nothing', () => {
  const screen = screenOf()
  const ui = handleKey(screen, onRow(firstQuestion(screen)), 'r', NOW).ui
  const result = handleKey(screen, ui, 'enter', NOW)
  expect(result.press).toBeUndefined()
  expect(result.ui.typing).not.toBeNull()
})

test('Esc in the reply field closes the field and keeps the draft held', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  let ui = handleKey(screen, onRow(row), 'r', NOW).ui
  ui = handleKey(screen, ui, 'o', NOW, 'o').ui
  const cancelled = handleKey(screen, ui, 'escape', NOW)
  expect(cancelled.close).toBeUndefined()
  expect(cancelled.ui.typing).toBeNull()
  expect(cancelled.ui.drafts[row.id]?.text).toBe('o')
  expect(Object.keys(holdsOf(cancelled.ui).replies)).toEqual([row.id])
  expect(handleKey(screen, cancelled.ui, 'escape', NOW).close).toBe(true)
})

test('keys in the reply field never switch tabs or move the selection', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const ui = handleKey(screen, onRow(row), 'r', NOW).ui
  const typed = handleKey(screen, ui, '2', NOW, '2').ui
  expect(typed.tab).toBe('needsYou')
  expect(typed.drafts[row.id]?.text).toBe('2')
  expect(handleKey(screen, typed, 'down', NOW).ui.selectedId).toBe(row.id)
})

test('Discard on a held row drops the draft and records the discard', () => {
  const state = demoState(NOW)
  state.ledger = closeItem(state.ledger, 'd11', { how: 'claude', outcome: 'closed by omp: answered in chat' }, NOW)
  const holds = { replies: { d11: NOW }, discarded: {}, shownSince: NOW }
  const held = { ...screenOf(), view: sessionView(state, NOW, SETTLED_MS, true, holds) }
  const heldRow = waiting(held, 'd11')
  expect(heldRow.state.is).toBe('held')
  expect(plannedLabels(heldRow)).toEqual(['Reply', 'Discard'])
  const result = handleKey(held, onRow(heldRow), 'x', NOW)
  expect(result.press).toBeUndefined()
  expect(result.ui.discarded.d11).toBe(NOW)
})

async function afterPresses(...presses: Parameters<ReturnType<typeof demoSource>['press']>[0][]) {
  let now = NOW
  const later: (() => void)[] = []
  const source = demoSource({
    modelName: 'Claude Sonnet 5.5',
    now: () => now,
    after: fn => later.push(fn),
    settleWindowMs: SETTLED_MS,
    version: '1.2.3',
    comparePage: '/omp/dist/compare-page.html',
  })
  const holds = { ...NO_HOLDS, shownSince: NOW }
  for (const p of presses) await source.press(p, holds)
  const screen = async () => ({ ...(await source.screen(holds)), modelName: null })

  return {
    screen,
    advance: async () => {
      now += SETTLED_MS + 1
      later.forEach(fn => fn())
      return screen()
    },
    source,
  }
}

test('a press that waits on the agent reads Explaining and its button keeps its label', async () => {
  const demo = await afterPresses({ action: 'explain', id: 'd11' })
  const screen = await demo.screen()
  const row = waiting(screen, 'd11')
  const out = text(screen, onRow(row))
  expect(out).toContain('Explaining…')
  expect(out).not.toContain('Explain again')
})

test('after the reply, an explained row that stays open reads its result', async () => {
  const demo = await afterPresses({ action: 'explain', id: 'd11' })
  const screen = await demo.advance()
  expect(text(screen, onRow(waiting(screen, 'd11')))).toContain('✓ Explained')
})

test('a row closed with Done shows its label and Undo, u returns the undo press, and the row stays after Undo ends, through its own tab’s key, until the panel switches tab', async () => {
  const demo = await afterPresses({ action: 'done', id: 'd14' })
  const screen = await demo.screen()
  const out = text(screen, INITIAL_UI)
  expect(out).toMatch(/Put on the glasses and pair them with this Mac\s+✓ Done\s+u Undo/)
  for (const width of [30, 46])
    expect(text(screen, INITIAL_UI, width), `at ${width} columns`).toMatch(/Put on the .*… {2}✓ Do/)
  expect(handleKey(screen, INITIAL_UI, 'u', NOW).press).toEqual({ action: 'undo', id: 'd14' })
  const later = await demo.advance()
  expect(text(later, INITIAL_UI)).toMatch(/Put on the glasses and pair them with this Mac\s+✓ Done/)
  expect(text(later, INITIAL_UI)).not.toContain('u Undo')
  expect(text(later, INITIAL_UI)).toContain('1 closed')
  const ownKey = shownTabs(later.isNextBuild === true).find(t => t.id === INITIAL_UI.tab)!.hotkey
  expect(text(later, handleKey(later, INITIAL_UI, ownKey, NOW + 1).ui)).toContain('Put on the glasses')
  const away = handleKey(later, INITIAL_UI, 'tab', NOW + 1).ui
  const back = handleKey(later, away, 'shift+tab', NOW + 1).ui
  expect(text(later, back)).not.toContain('Put on the glasses')
  expect(text(later, back)).toContain('2 closed')
})

test('a settled row is skipped when moving and the selection leaves it', async () => {
  const demo = await afterPresses({ action: 'done', id: 'd14' })
  const screen = await demo.screen()
  const ui = onRow(waiting(screen, 'd14'))
  const next = keys(screen, ui, 'down')
  expect(next.selectedId).not.toBe('d14')
  expect(
    drawn(screen, ui)
      .filter(l => strip(l).includes('❯'))
      .every(l => !strip(l).includes('Put on the glasses')),
  ).toBe(true)
})

test('after the replies to two presses, the row handed off reads Still open, the explained row reads its result, and the sample’s own hand-off keeps waiting', async () => {
  const demo = await afterPresses(
    { action: 'type', id: 'd17', text: 'Done in both.' },
    { action: 'explain', id: 'd11' },
  )
  const out = text(await demo.advance(), INITIAL_UI)
  expect(out).toMatch(/Calibrate eye tracking for the new lenses\s+Still open/)
  expect(out).toMatch(/Dismiss a glance with a pinch, or a flick of the wrist\?\s+✓ Explained/)
  expect(out).toMatch(/Run the gesture tests and send back the failures\s+✓ Run gesture tests/)
  expect(out).toContain('Asks 7')
})

test('an opened handed-off row whose reply is on its way starts the status under its buttons with the running mark', () => {
  const base = screenOf()
  const row = firstQuestion(base)
  const handedOff: RowView = {
    ...row,
    state: { is: 'handedOff' },
    feedback: { is: 'queued', label: 'go with B', at: NOW },
  }
  const questions = base.view.needsYou.questions.map(r => (r.id === row.id ? handedOff : r))
  const screen = { ...base, view: { ...base.view, needsYou: { ...base.view.needsYou, questions } } }
  const lines = text(screen, { ...onRow(row), opened: row.id }).split('\n')
  const status = lines.findIndex(l => l.includes('Queued: go with B'))
  expect(lines[status]).toMatch(/[●◉◎] Queued: go with B/)
  expect(status).toBeGreaterThan(lines.findIndex(l => l.includes('↵ ')))
})

async function afterReply() {
  const row = firstQuestion(screenOf())
  const demo = await afterPresses({ action: 'type', id: row.id, text: 'go with B' })

  return { row, screen: await demo.screen() }
}

test('a reply folds its row to one line with its mark and label, and the selection moves to the next row that waits', async () => {
  const { row, screen } = await afterReply()
  const lines = text(screen, onRow(row)).split('\n')
  const at = lines.findIndex(l => l.includes(row.title))
  expect(lines[at]).toMatch(/❯ .*✓ Replied/)
  expect(lines[at + 1]).not.toContain('↵')

  const moved = afterHandOff(screen, onRow(row), row.id, NOW)
  expect(moved.selectedId).not.toBe(row.id)
  expect(waiting(screen, moved.selectedId!).state.is).toBe('open')
})

test('Enter opens a folded row again, and moving off it folds it', async () => {
  const { row, screen } = await afterReply()
  expect(handleKey(screen, onRow(row), 'b', NOW).press).toBeUndefined()
  const opened = keys(screen, onRow(row), 'enter')
  expect(text(screen, opened)).toContain('r Reply')
  expect(keys(screen, opened, 'down', 'up').opened).toBeNull()
  expect(text(screen, keys(screen, opened, 'down', 'up'))).not.toContain('r Reply')
})

test('a dismissed PR shows its label dim, as a dismissed row does, with Undo, and u returns pr-undo', async () => {
  const demo = await afterPresses({ action: 'pr-dismiss', ref: 'acme/visor#29' })
  const screen = await demo.screen()
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).toMatch(/#29 Show the battery level as a glance\s+✕ Dismissed\s+u Undo/)
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2mDismissed${ESC}22m`)
  expect(handleKey(screen, ui, 'u', NOW).press).toEqual({ action: 'pr-undo', ref: 'acme/visor#29' })
})

test('a failed send shows why and offers Try again first', () => {
  const state = demoState(NOW)
  state.ledger = {
    ...state.ledger,
    items: state.ledger.items.map(i => (i.id === 'd11' ? { ...i, id: 'i11' } : i)),
  }
  state.lastActions.i11 = {
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: NOW,
    delivery: { state: 'failed', reason: 'omp is busy' },
  }
  const screen = { ...screenOf(), view: sessionView(state, NOW, SETTLED_MS, true) }
  const row = waiting(screen, 'i11')
  expect(text(screen, onRow(row))).toContain('Not sent: omp is busy')
  expect(buttonLine(screen, onRow(row))).toContain('Try again')
})
