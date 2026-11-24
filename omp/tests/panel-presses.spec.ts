import { expect, test } from 'bun:test'

import { closeItem } from '../../core/domain/ledger-close'
import { SETTLED_MS, NO_HOLDS, PRESS_GUARD_MS } from '../../core/view/timing'
import type { RowView } from '../../core/view/rows'
import { sessionView } from '../../core/view/session-view'
import { demoSource, demoState } from '../src/demo'
import { holdsOf } from '../../core/view/ui-controller-reply'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { applyEvents } from '../src/panel-keys'
import { prMarkId } from '../../core/view/pr-rows'
import {
  cursorOf,
  drawn,
  ESC,
  firstQuestion,
  keyed,
  keys,
  NOW,
  onRow,
  plannedLabels,
  screenOf,
  strip,
  text,
  waiting,
  withCursorOn,
} from './panel-harness'

test('t opens a reply field in place of the buttons, and Enter sends the typed words as a type press', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  let ui = keyed(screen, onRow(row), 't', NOW).ui
  expect(ui.typing).toBe(row.id)
  for (const ch of 'hi!') ui = keyed(screen, ui, ch, NOW, ch).ui
  ui = keyed(screen, ui, 'backspace', NOW).ui
  ui = keyed(screen, ui, 'space', NOW, ' ').ui
  ui = keyed(screen, ui, 'a', NOW, 'a').ui
  expect(text(screen, ui)).toContain('hi a')
  expect(text(screen, ui)).not.toContain(`↵ ${row.item!.rec}`)
  const sent = keyed(screen, ui, 'enter', NOW)
  expect(sent.press).toEqual({ action: 'type', id: row.id, text: 'hi a' })
  expect(sent.ui.typing).toBeNull()
  expect(sent.ui.drafts[row.id]?.text).toBe('hi a')
})

test('text typed or pasted into the reply field drops its terminal controls, so the field draws and sends only what a reader sees', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  let ui = keyed(screen, onRow(row), 't', NOW).ui
  ui = keyed(screen, ui, 'x', NOW, 'Ship \x1b[31mit\x1b]52;c;aGk=\x07').ui
  ui = keyed(screen, ui, '\x1b', NOW, '\x1b').ui
  ui = keyed(screen, ui, '!', NOW, '!').ui
  expect(text(screen, ui)).not.toContain('\x1b]52')
  expect(text(screen, ui)).toContain('Ship it!')
  expect(keyed(screen, ui, 'enter', NOW).press).toEqual({ action: 'type', id: row.id, text: 'Ship it!' })
})

test('Enter in an empty reply field sends nothing', () => {
  const screen = screenOf()
  const ui = keyed(screen, onRow(firstQuestion(screen)), 't', NOW).ui
  const result = keyed(screen, ui, 'enter', NOW)
  expect(result.press).toBeUndefined()
  expect(result.ui.typing).not.toBeNull()
})

test('Esc in the reply field closes the field and keeps the draft held', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  let ui = keyed(screen, onRow(row), 't', NOW).ui
  ui = keyed(screen, ui, 'o', NOW, 'o').ui
  const cancelled = keyed(screen, ui, 'escape', NOW)
  expect(cancelled.close).toBeUndefined()
  expect(cancelled.ui.typing).toBeNull()
  expect(cancelled.ui.drafts[row.id]?.text).toBe('o')
  expect(Object.keys(holdsOf(cancelled.ui, NOW).replies)).toEqual([row.id])
  expect(keyed(screen, cancelled.ui, 'escape', NOW).close).toBe(true)
})

test('keys in the reply field never switch tabs or move the selection', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const ui = keyed(screen, onRow(row), 't', NOW).ui
  const typed = keyed(screen, ui, '2', NOW, '2').ui
  expect(typed.tab).toBe('needsYou')
  expect(typed.drafts[row.id]?.text).toBe('2')
  expect(cursorOf(keyed(screen, typed, 'down', NOW).ui)).toBe(row.id)
})

test('Discard on a held row drops the draft and records the discard', () => {
  const state = demoState(NOW)
  state.ledger = closeItem(state.ledger, 'd11', { how: 'claude', outcome: 'closed by omp: answered in chat' }, NOW)
  const holds = { replies: { d11: NOW }, discarded: {}, shownSince: NOW, listInput: null }
  const held = { ...screenOf(), view: sessionView(state, NOW, SETTLED_MS, holds) }
  const heldRow = waiting(held, 'd11')
  expect(heldRow.state.is).toBe('held')
  expect(plannedLabels(heldRow)).toEqual(['Reply', 'Discard'])
  const result = keyed(held, onRow(heldRow), 'x', NOW)
  expect(result.press).toBeUndefined()
  expect(result.ui.discarded.d11).toBe(NOW)
})

test('a held row’s close label has no ✓, so it draws muted, not in the done color', () => {
  const state = demoState(NOW)
  state.ledger = closeItem(state.ledger, 'd11', { how: 'claude', outcome: 'closed by omp: answered in chat' }, NOW)
  const holds = { replies: { d11: NOW }, discarded: {}, shownSince: NOW, listInput: null }
  const held = { ...screenOf(), view: sessionView(state, NOW, SETTLED_MS, holds) }
  const line = drawn(held, INITIAL_UI).find(l => l.includes('Closed by omp: answered in chat'))
  expect(line).toContain(`${ESC}2mClosed by omp: answered in chat${ESC}22m`)
})

async function afterPresses(...presses: Parameters<ReturnType<typeof demoSource>['press']>[0][]) {
  let now = NOW
  const source = demoSource({
    inboxModel: { modelName: 'Claude Sonnet 5.5', isSignedIn: true },
    now: () => now,
    settleWindowMs: SETTLED_MS,
    version: '1.2.3',
    comparePage: '/omp/dist/compare-page.html',
  })
  const holds = { ...NO_HOLDS, shownSince: NOW }
  for (const [i, p] of presses.entries()) await source.press(p, holds, i + 1)
  const screen = async () => ({ ...(await source.screen(holds, {})), modelName: null })

  return {
    screen,
    advance: async () => {
      now += SETTLED_MS + 1
      presses.forEach((_p, i) => source.demoReply?.(i + 1))
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

test('a row closed with Done shows its label and Undo, u returns the undo press, and the row folds into its Closed line when Undo ends', async () => {
  const demo = await afterPresses({ action: 'done', id: 'd14' })
  const screen = await demo.screen()
  const out = text(screen, INITIAL_UI)
  expect(out).toMatch(/Put on the glasses and pair them with this Mac\s+✓ Done\s+u Undo/)
  expect(out).toContain('1 closed')
  for (const width of [30, 46])
    expect(text(screen, INITIAL_UI, width), `at ${width} columns`).toMatch(/Put on the.*… {2}✓ Do/)
  expect(keyed(screen, INITIAL_UI, 'u', NOW).press).toEqual({ action: 'undo', id: 'd14' })
  const later = text(await demo.advance(), INITIAL_UI)
  expect(later).not.toContain('Put on the glasses')
  expect(later).toContain('2 closed')
})

test('a settled row is skipped when moving and the selection leaves it', async () => {
  const demo = await afterPresses({ action: 'done', id: 'd14' })
  const screen = await demo.screen()
  const ui = onRow(waiting(screen, 'd14'))
  const next = keys(screen, ui, 'down')
  expect(cursorOf(next)).not.toBe('d14')
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
    feedback: { is: 'queued', label: 'Queued reply: go with B', at: NOW },
  }
  const questions = base.view.needsYou.questions.map(r => (r.id === row.id ? handedOff : r))
  const screen = { ...base, view: { ...base.view, needsYou: { ...base.view.needsYou, questions } } }
  const lines = text(screen, { ...onRow(row), opened: row.id }).split('\n')
  const status = lines.findIndex(l => l.includes('Queued reply: go with B'))
  expect(lines[status]).toMatch(/[●◉◎] Queued reply: go with B/)
  expect(status).toBeGreaterThan(lines.findLastIndex(l => /Reply|Explain|Dismiss/.test(l)))
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
  expect(lines[at]).toMatch(/❯[├└]─ .*✓ Replied: go with B/)
  expect(lines[at + 1]).not.toContain('↵')

  const read = {
    type: 'read',
    host: { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null },
  } as const
  const before = applyEvents(screenOf(), onRow(row), [read], NOW).ui
  const moved = applyEvents(screen, before, [read], NOW).ui
  expect(cursorOf(moved)).not.toBe(row.id)
  expect(waiting(screen, cursorOf(moved)!).state.is).toBe('open')
})

test('Enter opens a folded row again, and moving off it folds it', async () => {
  const { row, screen } = await afterReply()
  expect(keyed(screen, onRow(row), 'b', NOW).press).toBeUndefined()
  const opened = keys(screen, onRow(row), 'enter')
  expect(text(screen, opened)).toContain('t Reply')
  expect(keys(screen, opened, 'down', 'up').opened).toBeNull()
  expect(text(screen, keys(screen, opened, 'down', 'up'))).not.toContain('t Reply')
})

test('a dismissed PR shows its label dim, as a dismissed row does, with Undo, and u returns pr-undo', async () => {
  const demo = await afterPresses({ action: 'pr-dismiss', ref: 'acme/visor#29' })
  const screen = await demo.screen()
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).toMatch(/#29 Show the battery level as a glance\s+✕ Dismissed\s+u Undo/)
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2mDismissed${ESC}22m`)
  expect(keyed(screen, ui, 'u', NOW).press).toEqual({ action: 'pr-undo', ref: 'acme/visor#29' })
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
  const screen = { ...screenOf(), view: sessionView(state, NOW, SETTLED_MS) }
  const row = waiting(screen, 'i11')
  expect(text(screen, onRow(row))).toContain('Not sent: omp is busy')
  expect(text(screen, onRow(row))).toContain('Try again')
})

function readyScreen(ref: string, fetchedAt: number) {
  const state = demoState(NOW)
  const view = state.prViews.views[ref]
  if (!view) throw new Error(`the demo has no ${ref}`)
  state.prViews.views[ref] = {
    ...view,
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    checks: [{ name: 'test', bucket: 'pass', url: null }],
    threads: [],
    fetchedAt,
  }

  return screenOf({ view: sessionView(state, NOW, SETTLED_MS, NO_HOLDS) })
}

const settledPress = (screen: PanelScreen, ui: PanelUi) =>
  applyEvents(
    screen,
    ui,
    [{ type: 'press-settled', pressId: 1, outcome: { error: null, note: null, isUnconfirmed: false } }],
    NOW,
  ).ui

test('Enter on a ready PR’s Open PR keeps the focus there, so a second Enter opens the page again instead of merging', () => {
  const ref = 'acme/visor#31'
  const screen = readyScreen(ref, NOW)
  const onBlock = withCursorOn({ ...INITIAL_UI, tab: 'prs' }, prMarkId(ref))
  expect(keyed(screen, onBlock, 'enter', NOW).press).toEqual({ action: 'pr-merge', ref })
  const opened = keyed(screen, keyed(screen, onBlock, 'right', NOW).ui, 'enter', NOW)
  expect(opened.press).toEqual({ action: 'pr-open', ref })
  expect(keyed(screen, settledPress(screen, opened.ui), 'enter', NOW + PRESS_GUARD_MS).press).toEqual({
    action: 'pr-open',
    ref,
  })
})

test('the focus stays on Open PR when the read after its press puts Merge before it', () => {
  const ref = 'acme/visor#31'
  const stale = readyScreen(ref, NOW - 24 * 60 * 60_000)
  const onBlock = withCursorOn({ ...INITIAL_UI, tab: 'prs' }, prMarkId(ref))
  const opened = keyed(stale, onBlock, 'enter', NOW)
  expect(opened.press).toEqual({ action: 'pr-open', ref })
  const fresh = readyScreen(ref, NOW)
  expect(keyed(fresh, settledPress(fresh, opened.ui), 'enter', NOW + PRESS_GUARD_MS).press).toEqual({
    action: 'pr-open',
    ref,
  })
})
