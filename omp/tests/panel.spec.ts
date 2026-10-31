import { expect, test } from 'bun:test'

import { checkActions, prBlockActions, threadActions } from '../../hooks/pr-tab'
import { prMarkId, threadSentIn } from '../../hooks/pr-rows'
import { failingChecks, waitingThreads } from '../../hooks/prs'
import { SETTLED_MS, shownTabs, rowKeyPlan } from '../../hooks/view'
import type { RowView } from '../../hooks/view'
import { sessionView } from '../../hooks/session'
import { demoState } from '../src/demo'
import { INITIAL_UI } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import {
  buttonLine,
  buttonLines,
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
} from './panel-harness'

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
