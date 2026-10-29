import { expect, test } from 'bun:test'

import {
  GH_MISSING_TEXT,
  GH_SIGNED_OUT_TEXT,
  checkActions,
  checkRowId,
  prBlockActions,
  prMarkId,
  prsEmptyHint,
  threadActions,
  threadSentIn,
} from '../../hooks/pr-tab'
import { version } from '../package.json'
import { failingChecks, waitingThreads } from '../../hooks/prs'
import type { LastAction, Stop } from '../../types'
import { closeItem } from '../../hooks/ledger'
import { applyOverview, parseOverview } from '../../hooks/overview'
import {
  CLOSED_SHOWN,
  SETTLED_MS,
  NO_HOLDS,
  shownTabs,
  allRows,
  earlierLabel,
  foldLabel,
  isRowTab,
  OVERVIEW_TEXT_LINES,
  rowKeyPlan,
} from '../../hooks/view'
import type { OverviewRow, RowView } from '../../hooks/view'
import { sessionView } from '../../hooks/session'
import { cellWidth } from '../../hooks/text'
import { demoSource, demoState } from '../src/demo'
import { INITIAL_UI, afterHandOff, bandLines, drawPanel, followRows, handleKey, holdsOf, render } from '../src/panel'
import type { PanelScreen, PanelUi, Style } from '../src/panel'
import { emptyState } from '../src/state'

const NOW = 1_700_000_000_000
const ESC = '\x1b['
const style: Style = {
  bold: s => `${ESC}1m${s}${ESC}22m`,
  dim: s => `${ESC}2m${s}${ESC}22m`,
  inverse: s => `${ESC}7m${s}${ESC}27m`,
  underline: s => `${ESC}4m${s}${ESC}24m`,
  tone: (_name, s) => `${ESC}35m${s}${ESC}39m`,
  banner: (_tone, _part, s) => s,
}
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

const screenOf = (overrides: Partial<PanelScreen> = {}, holds = NO_HOLDS): PanelScreen => ({
  view: sessionView(demoState(NOW), NOW, SETTLED_MS, true, holds),
  modelName: 'Claude Sonnet 4.5',
  isGhMissing: false,
  isFetchingPrs: false,
  stop: null,
  ...overrides,
})

const drawn = (screen: PanelScreen, ui: PanelUi, width = 200) => render(screen, ui, width, NOW, style)
const text = (screen: PanelScreen, ui: PanelUi, width = 200) => drawn(screen, ui, width).map(strip).join('\n')
const keys = (screen: PanelScreen, ui: PanelUi, ...names: string[]) =>
  names.reduce((u, name) => handleKey(screen, u, name, NOW).ui, ui)

const waiting = (screen: PanelScreen, id: string) => allRows(screen.view).find(r => r.id === id)!
const firstQuestion = (screen: PanelScreen) =>
  screen.view.needsYou.questions.find(r => r.state.is === 'open' && r.item?.rec)!
const onRow = (row: RowView): PanelUi => ({ ...INITIAL_UI, selectedId: row.id })

function plannedLabels(row: RowView): string[] {
  const { keys: planned, more } = rowKeyPlan(row, true)

  return [...planned, ...more].flatMap(k =>
    k.slot === 'allOptions' ? [] : [k.slot === 'retry' ? k.label : k.action.label],
  )
}

const buttonLines = (screen: PanelScreen, ui: PanelUi) =>
  text(screen, ui)
    .split('\n')
    .filter(l => l.includes('↵ ') && !l.includes('↵ press'))

function buttonLine(screen: PanelScreen, ui: PanelUi): string {
  return buttonLines(screen, ui)[0]!
}

test('a selected row draws its buttons in the shared key plan order', () => {
  const screen = screenOf()
  const rows = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks, ...screen.view.findings.rows].filter(
    r => r.state.is !== 'settled',
  )
  expect(rows.length).toBeGreaterThan(5)
  for (const row of rows) {
    const tab = row.type === 'finding' ? 'findings' : 'needsYou'
    const line = buttonLine(screen, { ...onRow(row), tab, opened: row.id })
    let from = 0
    for (const label of plannedLabels(row)) {
      const at = line.indexOf(label, from)
      expect(at).toBeGreaterThanOrEqual(from)
      from = at + label.length
    }
  }
})

test('a row’s follow-ups share its buttons’ last line only when all of them fit there, and otherwise start a line of their own together', () => {
  const screen = screenOf()
  const row = screen.view.findings.rows.find(r => r.state.is === 'open')!
  const ui: PanelUi = { ...onRow(row), tab: 'findings', opened: row.id }
  const { keys, more } = rowKeyPlan(row, true)
  const labelsOf = (planned: typeof keys) =>
    planned.flatMap(k => (k.slot === 'action' || k.slot === 'choice' ? [k.action.label] : []))
  const buttons = labelsOf(keys)
  const followUps = labelsOf(more)
  const lineOf = (lines: string[], label: string) => lines.findIndex(l => new RegExp(`(↵|\\w) ${label} `).test(l))
  const forms = new Set<string>()
  for (let width = 30; width <= 120; width++) {
    const lines = text(screen, ui, width).split('\n')
    const lastButton = lineOf(lines, buttons.at(-1)!)
    const followUpLines = followUps.map(label => lineOf(lines, label))
    expect(lastButton, `at ${width} columns`).toBeGreaterThan(0)
    if (followUpLines[0] === lastButton) {
      expect(followUpLines, `at ${width} columns`).toEqual(followUps.map(() => lastButton))
      forms.add('shared')
    } else forms.add('own')
  }
  expect([...forms].sort()).toEqual(['own', 'shared'])
})

test('a question opens with its recommended option focused and underlined', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const lines = drawn(screen, onRow(row))
  expect(lines.some(l => l.includes(`${ESC}7m${ESC}1m ↵ ${row.item!.rec} `))).toBe(true)
  const other = row.item!.options.find(o => o !== row.item!.rec)!
  expect(lines.some(l => l.includes(`${ESC}4m${other}${ESC}24m`))).toBe(false)
})

test('the recommended option is underlined when another button has focus', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const ui = keys(screen, onRow(row), 'right')
  expect(drawn(screen, ui).some(l => l.includes(`${ESC}4m${row.item!.rec}${ESC}24m`))).toBe(true)
})

test('the recommended option ends "(recommended)", outside its underline, and no other option does', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  expect(buttonLine(screen, onRow(row))).toContain(`↵ ${row.item!.rec} (recommended) `)
  const moved = drawn(screen, keys(screen, onRow(row), 'right')).join('\n')
  expect(moved).toContain(`${ESC}4m${row.item!.rec}${ESC}24m (recommended) `)
  expect(strip(moved).match(/\(recommended\)/g)).toHaveLength(1)
})

test('the recommended option drops "(recommended)" only where its button would not fit a line of its own', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const wide = buttonLine(screen, onRow(row))
  const tight = wide.indexOf('(recommended) ') + '(recommended) '.length
  expect(text(screen, onRow(row), tight)).toContain(`${row.item!.rec} (recommended)`)
  expect(text(screen, keys(screen, onRow(row), 'right'), tight)).toContain(`${row.item!.rec} (recommended)`)
  expect(text(screen, onRow(row), tight - 1)).toContain(`↵ ${row.item!.rec} `)
  expect(text(screen, onRow(row), tight - 1)).not.toContain('(recommended)')
  expect(drawn(screen, keys(screen, onRow(row), 'right'), tight - 1).join('\n')).toContain(
    `${ESC}4m${row.item!.rec}${ESC}24m `,
  )
})

test('Enter on the opening focus answers with the recommended option', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const result = handleKey(screen, onRow(row), 'enter', NOW)
  expect(result.press).toEqual({ action: 'answer', id: row.id, option: row.item!.rec! })
})

test('focus wraps at both ends of the buttons', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const labels = plannedLabels(row)
  const last = labels.at(-1)!
  expect(buttonLine(screen, keys(screen, onRow(row), 'left'))).toContain(`↵ ${last}`)
  const around = keys(screen, onRow(row), ...labels.map(() => 'right'))
  expect(buttonLine(screen, around)).toContain(`↵ ${row.item!.rec}`)
})

test('a button letter presses that button', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const flick = row.item!.options.find(o => o !== row.item!.rec)!
  expect(handleKey(screen, onRow(row), 'b', NOW).press).toEqual({ action: 'answer', id: row.id, option: flick })
  expect(handleKey(screen, onRow(row), 'x', NOW).press).toEqual({ action: 'dismiss', id: row.id })
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, Tab and Shift+Tab cycle through the build's tabs in order, and each digit picks its tab`, () => {
    const screen = screenOf({ isNextBuild })
    const tabs = shownTabs(isNextBuild)
    const ids = tabs.map(t => t.id)
    expect(ids.includes('overview')).toBe(isNextBuild)
    const start = ids.indexOf(INITIAL_UI.tab)
    const cycled = ids.map((_, n) => keys(screen, INITIAL_UI, ...ids.slice(0, n).map(() => 'tab')).tab)
    expect(cycled).toEqual([...ids.slice(start), ...ids.slice(0, start)])
    expect(keys(screen, INITIAL_UI, ...ids.map(() => 'tab')).tab).toBe(INITIAL_UI.tab)
    expect(keys(screen, INITIAL_UI, 'shift+tab').tab).toBe(ids.at(start - 1)!)
    for (const t of tabs) expect(keys(screen, keys(screen, INITIAL_UI, 'tab'), t.hotkey).tab).toBe(t.id)
    expect(keys(screen, INITIAL_UI, '1').tab).toBe(isNextBuild ? 'overview' : 'needsYou')
    expect(keys(screen, INITIAL_UI, String(tabs.length + 1)).tab).toBe(INITIAL_UI.tab)
  })

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, an Asks row ${isNextBuild ? 'names' : 'leaves out'} the open subject it holds up`, () => {
    const shown = text(screenOf({ isNextBuild }), { ...INITIAL_UI, tab: 'needsYou' })

    expect(shown.includes('Holds up Glasses pairing')).toBe(isNextBuild)
  })

test('the selected tab draws inverse and the others draw their counts', () => {
  const screen = screenOf()
  const bar = drawn(screen, keys(screen, INITIAL_UI, '2'))[1]!
  expect(bar).toContain(`${ESC}7m${ESC}1m [2] Finds ${screen.view.findings.count} `)
  expect(strip(bar)).toContain(`[1] Asks ${screen.view.needsYou.count}`)
  expect(strip(bar)).toContain(`[3] PRs ${screen.view.prs.count}`)
  expect(strip(bar)).toContain('esc to close')
})

test('moving through rows wraps from the last to the first, and stops on each Closed line', () => {
  const screen = screenOf()
  const openIn = (rows: RowView[]) => rows.filter(r => r.state.is !== 'settled').map(r => ({ id: r.id }))
  const open = [
    ...openIn(screen.view.needsYou.questions),
    { id: 'fold question' },
    ...openIn(screen.view.needsYou.tasks),
    { id: 'fold task' },
  ]
  const first = open[0]!
  const atFirst = keys(screen, INITIAL_UI, 'down')
  expect(atFirst.selectedId).toBe(open[1]!.id)
  const wrapped = keys(screen, INITIAL_UI, ...open.map(() => 'down'))
  expect(wrapped.selectedId).toBe(first.id)
  expect(keys(screen, INITIAL_UI, 'up').selectedId).toBe(open.at(-1)!.id)
  expect(keys(screen, INITIAL_UI, 'j').selectedId).toBe(open[1]!.id)
  expect(keys(screen, INITIAL_UI, 'k').selectedId).toBe(open.at(-1)!.id)
})

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
  expect(text(screen, ui)).toMatch(/#29 Show the battery level as a glance\s+Dismissed\s+u Undo/)
  expect(drawn(screen, ui).join('\n')).toContain(`${ESC}2mDismissed${ESC}22m`)
  expect(handleKey(screen, ui, 'u', NOW).press).toEqual({ action: 'pr-undo', ref: 'acme/visor#29' })
})

function withLast(screen: PanelScreen, id: string, last: LastAction): PanelScreen {
  return { ...screen, view: { ...screen.view, lastActions: { ...screen.view.lastActions, [id]: last } } }
}

test('a local press reads its pending and failed results on the PR block', () => {
  const screen = screenOf()
  const block = screen.view.prs.drawn[0]!.pr
  const id = `pr:${block.ref}`
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const pending = withLast(screen, id, {
    kind: 'local',
    action: 'pr-open',
    text: 'Open PR',
    at: NOW,
    result: {
      state: 'pending',
      at: NOW,
      parts: [{ kind: 'open', name: `PR #${block.number}`, error: null, isCommand: false }],
    },
  })
  expect(text(pending, ui)).toContain(`Opening PR #${block.number}…`)
  const refreshing = withLast(screen, id, {
    kind: 'local',
    action: 'pr-refresh',
    text: 'Refresh PRs',
    at: NOW,
    result: { state: 'pending', at: NOW, parts: [{ kind: 'refresh-prs', name: 'PRs', error: null, isCommand: false }] },
  })
  expect(text(refreshing, ui)).toContain('Refreshing PRs…')
  const failed = withLast(screen, id, {
    kind: 'local',
    action: 'pr-open',
    text: 'Open PR',
    at: NOW,
    result: {
      state: 'failed',
      at: NOW,
      parts: [{ kind: 'open', name: `PR #${block.number}`, error: 'no browser', isCommand: false }],
    },
  })
  expect(text(failed, ui)).toContain(`Could not open PR #${block.number}: no browser`)
})

test('a press on the PRs tab says when it was made, and a failing check keeps Asked to fix under its buttons when open', () => {
  const screen = screenOf()
  const { pr } = screen.view.prs.drawn[0]!
  const check = failingChecks(pr)[0]!
  const checkId = checkRowId(pr.ref, check.name)
  const resolving = withLast(screen, prMarkId(pr.ref), {
    kind: 'handoff',
    action: 'pr-conflicts',
    text: 'Resolve conflicts',
    at: NOW - 5 * 60_000,
  })
  const pressed = withLast(resolving, checkId, {
    kind: 'handoff',
    action: 'check-fix',
    text: 'Fix',
    at: NOW - 14 * 60_000,
  })
  const drawn = text(pressed, { ...INITIAL_UI, tab: 'prs' })
  expect(drawn).toMatch(/✓ Asked to resolve conflicts\s+5m ago/)
  expect(drawn).toMatch(/Addressed\s+2m ago/)
  expect(drawn).toMatch(new RegExp(`${check.name}\\s+✓ Asked to fix\\s+14m ago`))
  const open = text(pressed, { ...INITIAL_UI, tab: 'prs', selectedId: checkId }).split('\n')
  const buttons = open.findIndex(l => l.includes('Fix again'))
  expect(open[buttons + 1]?.trim()).toBe('✓ Asked to fix')
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

test('PR buttons follow the shared plan order for the block, its threads and its checks', () => {
  const state = demoState(NOW)
  const ref = screenOf().view.prs.drawn[0]!.pr.ref
  state.prViews.views[ref] = { ...state.prViews.views[ref]!, error: 'HTTP 502' }
  state.lastActions[prMarkId(ref)] = {
    kind: 'handoff',
    action: 'pr-address-all',
    text: 'Address all 2 threads',
    at: NOW,
    delivery: { state: 'failed', reason: 'omp is busy' },
  }
  const screen = screenOf({ view: sessionView(state, NOW, SETTLED_MS, true) })
  const { lastActions, turns, prs } = screen.view
  const { pr } = prs.drawn[0]!
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now: NOW }
  const block = prBlockActions(pr, isSent, prs.branchRef, presses)
  expect(block.slice(0, 2).map(a => a.label)).toEqual(['Refresh PRs', 'Try again'])
  expect(text(screen, { ...INITIAL_UI, tab: 'prs', selectedId: prMarkId(ref) })).toContain(
    'Last refresh failed: HTTP 502',
  )
  const plans = [
    block,
    ...waitingThreads(pr).map(t => threadActions(pr, t, presses)),
    ...failingChecks(pr).map(c => checkActions(pr, c, presses)),
  ]
  expect(plans.length).toBeGreaterThan(3)
  let ui: PanelUi = { ...INITIAL_UI, tab: 'prs', selectedId: prMarkId(pr.ref) }
  for (const plan of plans) {
    const opened = buttonLines(screen, ui).length === 0 ? keys(screen, ui, 'enter') : ui
    const line = buttonLine(screen, opened)
    let from = 0
    for (const { label } of plan) {
      const at = line.indexOf(label, from)
      expect(at).toBeGreaterThanOrEqual(from)
      from = at + label.length
    }
    ui = keys(screen, ui, 'down')
  }
})

test('the PRs tab opens on the first thread that waits, and its press goes through the PR press', () => {
  const screen = screenOf()
  const { pr } = screen.view.prs.drawn[0]!
  const first = waitingThreads(pr).find(t => !threadSentIn(screen.view.lastActions)(pr, t))!
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  const result = handleKey(screen, ui, 'a', NOW)
  expect(result.press).toMatchObject({ action: 'thread-address', thread: first.id })
  expect(handleKey(screen, ui, 'enter', NOW).press).toMatchObject({ action: 'thread-address' })
})

test('the PRs tab says when gh is missing, when gh is not signed in, and when there are no PRs', () => {
  const screen = screenOf({ isGhMissing: true })
  const ui = { ...INITIAL_UI, tab: 'prs' as const }
  expect(text(screen, ui)).toContain(GH_MISSING_TEXT)
  const signedOut = (s: PanelScreen): PanelScreen => ({
    ...s,
    view: { ...s.view, prs: { ...s.view.prs, isGhSignedOut: true } },
  })
  expect(text(signedOut(screenOf()), ui)).toContain(GH_SIGNED_OUT_TEXT)
  expect(text(signedOut(screen), ui)).not.toContain(GH_SIGNED_OUT_TEXT)
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS, true) }
  expect(text(empty, ui)).toContain('No PRs')
  expect(text(empty, ui)).toContain(prsEmptyHint('session'))
  expect(text(signedOut(empty), ui)).toContain(GH_SIGNED_OUT_TEXT)
  expect(text({ ...empty, isFetchingPrs: true }, ui)).toContain('Checking for PRs…')
})

test('an empty Asks tab explains itself', () => {
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS, true) }
  expect(text(empty, INITIAL_UI)).toContain('Nothing needed')
})

test('the footer names the inbox model, or says there is none', () => {
  expect(text(screenOf(), INITIAL_UI)).toContain('inbox model Claude Sonnet 4.5')
  expect(text(screenOf({ modelName: null }), INITIAL_UI)).toContain('no inbox model: set @inbox')
})

test('the footer puts the inbox model on its own line when it does not fit beside the hints', () => {
  const lastLines = (screen: PanelScreen, width: number) => drawn(screen, INITIAL_UI, width).map(strip).slice(-2)
  const [hints, named] = lastLines(screenOf(), 60)
  expect(hints).toContain('tab switch')
  expect(named).toContain('inbox model Claude Sonnet 4.5')
  const [, none] = lastLines(screenOf({ modelName: null }), 48)
  expect(none).toContain('no inbox model: set @inbox')
})

test('the footer shows the version after the inbox model, beside the hints or on the model’s own line', () => {
  const lastLines = (width: number) => drawn(screenOf(), INITIAL_UI, width).map(strip).slice(-2)
  const [, wide] = lastLines(140)
  expect(wide).toContain('tab switch')
  expect(wide?.trimEnd()).toEndWith(`inbox model Claude Sonnet 4.5  v${version}`)
  const [hints, named] = lastLines(60)
  expect(hints).not.toContain(`v${version}`)
  expect(named?.trimEnd()).toEndWith(`inbox model Claude Sonnet 4.5  v${version}`)
  const [, marked] = drawn(screenOf({ isNextBuild: true }), INITIAL_UI, 140)
    .map(strip)
    .slice(-2)
  expect(marked?.trimEnd()).toEndWith(`inbox model Claude Sonnet 4.5  v${version} · next`)
})

test('the demo says its presses send nothing', () => {
  expect(text(screenOf({ isDemo: true }), INITIAL_UI)).toContain('Buttons here send nothing.')
})

test('the band shows both counts with their labels at full brightness, and how to open the inbox', () => {
  const screen = screenOf()
  const line = bandLines(screen, 80, NOW, style)[0]!
  const dimmed = [...line.matchAll(/\x1b\[2m(.*?)\x1b\[22m/g)].map(m => m[1])
  expect(strip(line)).toContain(`Asks ${screen.view.needsYou.count}`)
  expect(strip(line)).toContain(`Finds ${screen.view.findings.count}`)
  expect(dimmed.some(t => t?.includes('Asks') || t?.includes('Finds'))).toBe(false)
  expect(strip(line)).toContain('/inbox to open')
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS, true) }
  expect([...bandLines(empty, 80, NOW, style)[0]!.matchAll(/\x1b\[2m(.*?)\x1b\[22m/g)].map(m => m[1])).toContain(
    'Nothing needed',
  )
})

test('no drawn line is wider than the panel, and a short panel keeps the selected row in view', () => {
  const screen = screenOf()
  for (const width of [30, 60, 120])
    for (const line of drawn(screen, INITIAL_UI, width)) expect([...strip(line)].length).toBeLessThanOrEqual(width)
  const rows = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks].filter(r => r.state.is !== 'settled')
  const last = rows.at(-1)!
  const short = render(screen, onRow(last), 80, NOW, style, 12).map(strip)
  expect(short.length).toBeLessThanOrEqual(12)
  expect(short.some(l => l.includes('❯') && l.includes(last.title.slice(0, 20)))).toBe(true)
})

test('Enter on a Closed line shows the newest closed rows and how many are earlier, and Enter again folds them', () => {
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
  const firstTask = screen.view.needsYou.tasks.find(r => r.state.is !== 'settled')!
  expect(keys(screen, unfolded, 'down').selectedId).toBe(firstTask.id)
  expect(text(screen, keys(screen, unfolded, 'enter'))).not.toContain(closed[0]!.ask)
})

test('a closed row whose Done message was refused offers Undo, which presses undo for its row', () => {
  const s = demoState(NOW)
  const task = s.ledger.closed.find(d => d.kind === 'task' && d.how === 'done')!
  const refused = { ...task, doneNotification: { id: 'n1', error: 'queue refused' } }
  const ledger = { ...s.ledger, closed: s.ledger.closed.map(d => (d.id === task.id ? refused : d)) }
  const screen = screenOf({ view: sessionView({ ...s, ledger }, NOW, SETTLED_MS, true, NO_HOLDS) })
  const ui: PanelUi = { ...INITIAL_UI, unfolded: ['task'], selectedId: `closed ${task.id}` }
  expect(text(screen, ui)).toContain('Not sent: queue refused')
  expect(handleKey(screen, ui, 'enter', NOW).press).toEqual({ id: task.id, action: 'undo' })
})

const stopAt = NOW - 120_000

test('a stop shows above the Asks rows with its fix, and the band says it under the counts', () => {
  const stop: Stop = { kind: 'sign-in', detail: '401', resets: null, at: stopAt }
  const screen = screenOf({ stop })
  const lines = text(screen, INITIAL_UI).split('\n')
  const at = lines.findIndex(l => l.includes('Stopped'))
  expect(lines[at]).toContain('Sign-in expired.')
  expect(lines[at + 1]).toContain('Run /login, then send a message to resume.')
  expect(at).toBeLessThan(lines.findIndex(l => l.includes('Questions')))
  expect(handleKey(screen, INITIAL_UI, 'enter', NOW).ui.selectedId).toBe(firstQuestion(screen).id)
  const band = bandLines(screen, 120, NOW, style).map(strip)
  expect(band[1]).toContain('Stopped 2m ago: sign-in expired. Run /login, then send a message to resume.')
})

test('an API error stop opens on Resume, which reads Resuming… and presses once', () => {
  const stop: Stop = { kind: 'api-error', detail: 'overloaded', resets: null, at: stopAt }
  const screen = screenOf({ stop })
  const pressed = handleKey(screen, INITIAL_UI, 'enter', NOW)
  expect(pressed.press).toEqual({ action: 'resume' })
  expect(text(screen, pressed.ui)).toContain('Resuming…')
  expect(handleKey(screen, pressed.ui, 'enter', NOW).press).toBeUndefined()
})

const findingsOnly = () => {
  const s = demoState(NOW)

  return screenOf({
    view: sessionView({ ...s, ledger: { ...s.ledger, items: [], closed: [] } }, NOW, SETTLED_MS, true, NO_HOLDS),
  })
}

test('a panel that opens on an empty Asks moves to the first tab with open rows', () => {
  expect(followRows(findingsOnly(), INITIAL_UI, {}, true, NOW).ui.tab).toBe('findings')
})

test('rows that arrive while Asks shows only its empty text move the panel to their tab', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS) })
  const opened = followRows(empty, INITIAL_UI, {}, true, NOW)
  expect(opened.ui.tab).toBe('needsYou')
  expect(followRows(findingsOnly(), opened.ui, opened.seen, false, NOW).ui.tab).toBe('findings')
})

test('a PR that arrives while Asks shows only its empty text moves the panel to PRs', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS) })
  const opened = followRows(empty, INITIAL_UI, {}, true, NOW)
  const withPr = screenOf({ view: sessionView(demoState(NOW), NOW, SETTLED_MS, true, NO_HOLDS) })
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
    view: sessionView({ ...s, ledger: { ...s.ledger, items } }, NOW, SETTLED_MS, true, NO_HOLDS),
  })
  expect(handleKey(after, INITIAL_UI, 'noop', NOW).ui.selectedId).toBe('new-question')
  expect(followRows(after, INITIAL_UI, seen, false, NOW).ui.selectedId).toBe(selectedBefore)
})

const onPage: PanelUi = { ...INITIAL_UI, tab: 'overview' }
const toneNamed: Style = { ...style, tone: (name, s) => `<${name}>${s}</${name}>` }
const tabLine = (screen: PanelScreen, ui: PanelUi, width: number) =>
  strip(drawn(screen, ui, width)[1]!)
    .replace(/esc to close\s*$/, '')
    .trimEnd()

const labelOf = (row: OverviewRow) => (row.kind === 'subject' || row.kind === 'child' ? row.name : row.text)

test('the Overview page shows the head’s title and description, then its rows in order, each subject’s marks in the head’s column, where it stands under its name and its was line under that, and Last seen in the middle of its rule', () => {
  const screen = screenOf()
  const page = screen.view.overviewPage
  const lines = text(screen, onPage).split('\n')
  const at = (s: string) => lines.findIndex(l => l.includes(s))
  const order = [page.head!.title, page.head!.description!, ...page.rows.map(labelOf)].map(at)
  expect(order.every(n => n >= 0)).toBe(true)
  expect(order).toEqual([...order].sort((a, b) => a - b))
  const headAt = lines[at(page.head!.title)]!.search(/\S/)
  expect(lines[at(page.head!.description!)]!.search(/\S/)).toBe(headAt)
  const subjects = page.rows.flatMap(r => (r.kind === 'subject' ? [r] : []))
  for (const row of subjects) expect(lines[at(row.name)]!.search(/\S/)).toBe(headAt)
  const withWas = subjects.filter(r => r.was !== null && r.text !== null)
  expect(withWas.length).toBeGreaterThan(0)
  for (const row of withWas) {
    expect(lines[at(row.name) + 1]).toContain(row.text!)
    expect(lines[at(row.name) + 2]).toContain(`was: ${row.was}`)
  }
  const seen = lines[at(' Last seen ')]!.trim()
  const [left, right] = seen.split(' Last seen ')
  expect(left!.length - right!.length).toBeLessThanOrEqual(1)
  expect(left).toMatch(/^─+$/)
})

test('on the Overview page, the rows under a subject hang from its mark, ├─ for each and └─ for the last, and the line runs beside each wrapped line', () => {
  const lines = text(screenOf(), onPage, 28).split('\n')
  const at = (s: string) => lines.findIndex(l => l.includes(s))
  const [subject, first, mid, last, next] = [
    at('Dismiss gesture'),
    at('Review the'),
    at('Tune how hard'),
    at('Time the'),
    at('Fade-out'),
  ]
  const col = lines[subject]!.search(/\S/)
  const glyphs = (from: number, to: number) => lines.slice(from, to).map(l => l.slice(col, col + 2))

  expect(subject).toBeLessThan(first)
  expect(glyphs(subject + 1, first).every(g => g.startsWith('│'))).toBe(true)
  expect(glyphs(first, mid)).toEqual(['├─', ...Array<string>(mid - first - 1).fill('│ ')])
  expect(glyphs(mid, last)).toEqual(['├─', ...Array<string>(last - mid - 1).fill('│ ')])
  expect(last - mid).toBeGreaterThan(1)
  expect(glyphs(last, next)).toEqual(['└─', ...Array<string>(next - last - 1).fill('  ')])
})

test('on the Overview page, a row’s stall word follows its name on the line of its last word, at every width, and running work and work waiting on someone else show none', () => {
  const wide = text(screenOf(), onPage, 80).split('\n')
  expect(wide.some(l => l.includes('Tune how hard a pinch must be · waiting'))).toBe(true)
  expect(wide.some(l => l.includes('Time the fade-out · finished'))).toBe(true)
  expect(wide.some(l => l.includes('Watch the pairing log') && !l.includes(' · '))).toBe(true)
  expect(wide.some(l => l.includes('Glasses trial') && !l.includes(' · '))).toBe(true)

  for (const width of [26, 28, 30, 34, 40, 50]) {
    const lines = text(screenOf(), onPage, width).split('\n')
    for (const word of ['waiting', 'finished'])
      expect(lines.filter(l => l.includes(` ${word}`) && !l.includes('waits')).every(l => /\S · /.test(l))).toBe(true)
  }
})

test('on the Overview page, a rule from the text column sets each item apart, with none inside a subject’s tree or beside the look line', () => {
  const lines = text(screenOf(), onPage, 40).split('\n')
  const subject = lines.find(l => l.includes('Dismiss gesture'))!
  const rule = new RegExp(`^ {${subject.indexOf('Dismiss')}}─+$`)
  const rowsAfterRules = lines.flatMap((l, n) => (rule.test(l) ? [lines[n + 1]!] : []))

  expect(rowsAfterRules).toHaveLength(4)
  for (const [n, row] of ['Flick option', 'Dismiss gesture', 'Fade-out', 'more done'].entries())
    expect(rowsAfterRules[n]).toContain(row)
})

test('on the Overview page, a subject’s name stays plain, and where it stands goes dim under it, wrapped to three lines and cut with an ellipsis past them', () => {
  const name = 'Help text for every greeting command'
  const where = 'being written with examples, defaults, descriptions, environment variables, configuration precedence'
  const state = emptyState('s1')
  state.ledger = {
    ...state.ledger,
    overview: applyOverview(null, parseOverview(`NEW: working | ${name} | ${where}`)!, NOW, new Set()),
  }
  const screen = screenOf({ view: sessionView(state, NOW, SETTLED_MS, true, NO_HOLDS) })
  const raw = drawn(screen, onPage, 34)
  const first = raw.findIndex(l => strip(l).includes('Help text'))
  const subject = raw.slice(first, first + 2 + OVERVIEW_TEXT_LINES + 1).map(strip)

  expect(subject.slice(0, 3)).toEqual([
    ' ● Help text for every greeting',
    '   command',
    '   being written with examples,',
  ])
  expect(subject[1 + OVERVIEW_TEXT_LINES]).toMatch(/…$/)
  expect(subject[2 + OVERVIEW_TEXT_LINES]?.trim() ?? '').not.toMatch(/^[a-z]/)
  expect(raw[first + 1]).not.toContain(ESC)
  expect(raw[first + 2]).toContain(`${ESC}2mbeing`)
  const wide = text(screen, onPage, 200).split('\n')
  expect(wide[wide.findIndex(l => l.includes(name)) + 1]?.trim()).toBe(where)
})

test('each subject’s mark takes its tone, and a mark with no tone is muted', () => {
  const screen = screenOf()
  const subjects = screen.view.overviewPage.rows.flatMap(r => (r.kind === 'subject' ? [r] : []))
  const lines = render(screen, onPage, 200, NOW, toneNamed)
  const lineOf = (s: string) => lines.find(l => l.includes(s))!
  for (const row of subjects.filter(r => r.tone !== null))
    expect(lineOf(row.name)).toContain(`<${row.tone}>${row.mark}</${row.tone}> `)
  const muted = subjects.find(r => r.tone === null && !r.isRunning)!
  expect(lineOf(muted.name)).toContain(`${ESC}2m${muted.mark}${ESC}22m `)
})

test('an Overview page with nothing yet reads its empty text', () => {
  const screen = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS) })
  const { empty } = screen.view.overviewPage
  expect(screen.view.overviewPage.isEmpty).toBe(true)
  expect(text(screen, onPage)).toContain(empty.title)
  expect(text(screen, onPage)).toContain(empty.hint)
})

test('keys on the Overview page select nothing and press nothing, and the footer offers only tab', () => {
  const screen = screenOf()
  for (const key of ['up', 'down', 'j', 'k', 'left', 'right', 'enter', 'u', 'r', 'd', 'x', 'a']) {
    const result = handleKey(screen, onPage, key, NOW)
    expect(result.press).toBeUndefined()
    expect({ ...result.ui, pageTop: 0 }).toEqual(onPage)
  }
  const footer = text(screen, onPage).split('\n').at(-1)!
  expect(footer).toContain('tab switch')
  expect(footer).not.toContain('↵ press')
  expect(footer).not.toContain('scroll')
})

test('on a Overview page taller than the panel, each ↑↓ or j/k press shows one more or one fewer line, up to its last line', () => {
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
  expect(drawnAt(0).lines.map(strip).at(-1)).toContain('↑↓ scroll')
  const down = keys(screen, onPage, 'down', 'j')
  expect(down.pageTop).toBe(2)
  expect(keys(screen, down, 'k').pageTop).toBe(1)
  expect(keys(screen, down, 'up', 'up', 'up').pageTop).toBe(0)
})

test('changing the shown tab starts the Overview page at its top', () => {
  const screen = screenOf({ isNextBuild: true })
  const scrolled = { ...onPage, pageTop: 3 }
  for (const key of ['tab', 'shift+tab', ...shownTabs(true).map(t => t.hotkey)])
    expect(keys(screen, scrolled, key).pageTop).toBe(0)
})

test('rows that arrive while the Overview page shows leave the panel on the page', () => {
  const empty = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS) })
  const opened = followRows(empty, onPage, {}, true, NOW)
  expect(opened.ui).toEqual(onPage)
  expect(followRows(findingsOnly(), opened.ui, opened.seen, false, NOW).ui).toEqual(onPage)
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, a narrowing tab line drops the brackets, then names every tab by its symbol, and draws no zero count`, () => {
    const tabs = shownTabs(isNextBuild)
    const zeros = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS), isNextBuild })
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
        for (const width of isNextBuild ? [34, symbolsAt] : [symbolsAt]) {
          const line = tabLine(screen, ui, width).replace(/[[\]]/g, '')
          expect(line).not.toContain('…')
          for (const t of tabs) {
            expect(line).toContain(`${t.hotkey} ${t.symbol}`)
            expect(line).not.toContain(t.label)
          }
        }
        expect(tabLine(screen, ui, 200)).not.toContain(isNextBuild ? '[5]' : 'Overview')
      }
  })

test('the tab line counts each symbol as two cells, so it fits the panel and keeps "esc to close" whole', () => {
  for (const isNextBuild of [false, true])
    for (const shown of shownTabs(isNextBuild))
      for (let width = 34; width <= 120; width++) {
        const bar = strip(drawn(screenOf({ isNextBuild }), { ...INITIAL_UI, tab: shown.id }, width)[1]!)
        expect(cellWidth(bar)).toBeLessThanOrEqual(width)
        if (bar.includes('esc')) expect(bar.trimEnd()).toEndWith('esc to close')
      }
})

test('no line on the Overview page is wider than the panel', () => {
  const screen = screenOf()
  for (const width of [30, 50, 60, 80, 120])
    for (const line of drawn(screen, onPage, width)) expect(cellWidth(strip(line))).toBeLessThanOrEqual(width)
})
