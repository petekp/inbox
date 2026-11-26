import { expect, test } from 'bun:test'

import { checkActions, prBlockActions, threadActions } from '../../core/view/pr-tab'
import { prMarkId, prSyncOf, threadSentIn } from '../../core/view/pr-rows'
import { blockingChecks } from '../../core/domain/pr-checks'
import { waitingThreads } from '../../core/domain/prs'
import { SETTLED_MS } from '../../core/view/timing'
import { shownTabs } from '../../core/view/tabs'
import { rowKeyPlan } from '../../core/view/action-plan'
import { answeringOf, herdrAskOf } from '../../core/remote/herdr-ask'
import type { RowView } from '../../core/view/rows'
import { sessionView } from '../../core/view/session-view'
import { demoState } from '../src/demo'
import { INITIAL_UI } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { HERDR_ASK_ID } from '../src/panel-lines'
import {
  buttonLine,
  buttonLines,
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
  withCursorOn,
} from './panel-harness'

test('a selected row draws its buttons in the shared key plan order', () => {
  const screen = screenOf()
  const rows = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks, ...screen.view.findings.rows].filter(
    r => r.state.is !== 'settled',
  )
  expect(rows.length).toBeGreaterThan(5)
  for (const row of rows) {
    const tab = row.type === 'finding' ? 'findings' : 'needsYou'
    const drawnRow = text(screen, { ...onRow(row), tab, opened: row.id })
    let from = 0
    for (const label of plannedLabels(row)) {
      const at = drawnRow.indexOf(label, from)
      expect(at).toBeGreaterThanOrEqual(from)
      from = at + label.length
    }
    const { options, answerRow } = rowKeyPlan(row, true)
    if (!answerRow) continue
    const answers = options.map(o => o.action.label)
    const answersLine = drawnRow.split('\n').find(l => l.includes(answers[0]!)) ?? ''
    expect(
      answers.map(a => answersLine.indexOf(a)),
      `${row.id} answers side by side`,
    ).toEqual(answers.map(a => answersLine.indexOf(a)).toSorted((a, b) => a - b))
    expect(
      answers.every(a => answersLine.includes(a)),
      `${row.id} answers on one line`,
    ).toBe(true)
  }
  expect(rows.some(r => rowKeyPlan(r, true).answerRow)).toBe(true)
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

test('the recommended option wraps "(recommended)" under its label where its button would not fit one line', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const has = (width: number) => text(screen, onRow(row), width).includes(`${row.item!.rec} (recommended)`)
  let tight = 200
  while (has(tight - 1)) tight--
  expect(has(tight)).toBe(true)
  const wrapped = text(screen, onRow(row), tight - 1).split('\n')
  const at = wrapped.findIndex(l => l.includes(`↵ ${row.item!.rec}`))
  expect(wrapped[at + 1]).toMatch(/^ │  │\s+\(recommended\)/)
  const moved = drawn(screen, keys(screen, onRow(row), 'right'), tight - 1).join('\n')
  expect(moved).toContain(`${ESC}4m${row.item!.rec}${ESC}24m`)
  expect(moved).not.toContain(`${ESC}4m(recommended)`)
  expect(strip(moved).match(/\(recommended\)/g)).toHaveLength(1)
})

test('Enter on the opening focus answers with the recommended option', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const result = keyed(screen, onRow(row), 'enter', NOW)
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
  expect(keyed(screen, onRow(row), 'b', NOW).press).toEqual({ action: 'answer', id: row.id, option: flick })
  expect(keyed(screen, onRow(row), 'x', NOW).press).toEqual({ action: 'dismiss', id: row.id })
})

test('Tab and Shift+Tab cycle through the tabs in order, and each digit picks its tab', () => {
  const screen = screenOf()
  const tabs = shownTabs()
  const ids = tabs.map(t => t.id)
  expect(ids[0]).toBe('overview')
  const start = ids.indexOf(INITIAL_UI.tab)
  const cycled = ids.map((_, n) => keys(screen, INITIAL_UI, ...ids.slice(0, n).map(() => 'tab')).tab)
  expect(cycled).toEqual([...ids.slice(start), ...ids.slice(0, start)])
  expect(keys(screen, INITIAL_UI, ...ids.map(() => 'tab')).tab).toBe(INITIAL_UI.tab)
  expect(keys(screen, INITIAL_UI, 'shift+tab').tab).toBe(ids.at(start - 1)!)
  for (const t of tabs) expect(keys(screen, keys(screen, INITIAL_UI, 'tab'), t.hotkey).tab).toBe(t.id)
  expect(keys(screen, INITIAL_UI, '1').tab).toBe('overview')
  expect(keys(screen, INITIAL_UI, String(tabs.length + 1)).tab).toBe(INITIAL_UI.tab)
})

test('a question’s context draws whole and dim, under its title, on its selected row only', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const other = screen.view.needsYou.questions.find(r => r.state.is === 'open' && r.id !== row.id)!
  const context = row.contextLine!
  const flat = (ui: PanelUi) =>
    text(screen, ui, 50)
      .replace(/[│├└]─?/g, '')
      .replace(/\s+/g, ' ')
  const shown = flat(onRow(row))
  const at = shown.indexOf(context)

  expect(at).toBeGreaterThan(shown.indexOf('Dismiss a glance'))
  const firstWords = context.split(' ').slice(0, 3).join(' ')
  const raw = text(screen, onRow(row), 50)
  expect(raw.indexOf(firstWords)).toBeLessThan(raw.indexOf(row.optionDescriptions[0]!.option))
  expect(
    drawn(screen, onRow(row), 50).find(l =>
      strip(l)
        .replace(/[│├└─]/g, '')
        .trim()
        .startsWith(firstWords),
    ),
  ).toContain(`${ESC}2m`)
  expect(flat(onRow(other))).not.toContain(firstWords)
})

test('a question’s earlier answer draws dim after its context, with the answer bold, on its selected row only', () => {
  const screen = screenOf()
  const row = firstQuestion(screen)
  const line = drawn(screen, onRow(row), 80).find(l => strip(l).includes('You answered'))
  expect(strip(line ?? '')).toContain('You answered Flick 3 days ago, in glasses-app,')
  expect(line).toContain(`${ESC}1mFlick`)
  const shown = text(screen, onRow(row), 80)
  expect(shown.indexOf('You answered')).toBeGreaterThan(
    shown.indexOf(row.contextLine!.split(' ').slice(0, 3).join(' ')),
  )
  const other = screen.view.needsYou.questions.find(r => r.state.is === 'open' && r.id !== row.id)!
  expect(text(screen, onRow(other), 80)).not.toContain('You answered')
})

test('an Asks row names the open subject it holds up', () => {
  const shown = text(screenOf(), { ...INITIAL_UI, tab: 'needsYou' })

  expect(shown).toContain('Holds up Glasses pairing')
})

test('a collapsed row’s Holds up line and its group’s Closed fold start at the rows’ title column', () => {
  const demo = screenOf()
  const { findings } = demo.view
  const holdingFinding = (r: RowView, n: number) => (n === 1 ? { ...r, holdsUpLine: 'Holds up Dismiss gesture' } : r)
  const screen = { ...demo, view: { ...demo.view, findings: { ...findings, rows: findings.rows.map(holdingFinding) } } }
  const tabs = [
    { tab: 'needsYou' as const, rows: [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks] },
    { tab: 'findings' as const, rows: screen.view.findings.rows },
  ]
  for (const { tab, rows } of tabs) {
    const lines = text(screen, withCursorOn({ ...INITIAL_UI, tab }, null), 120).split('\n')
    const titleAt = (row: RowView) => {
      const start = new RegExp(`(\\d+\\) )?${row.title.slice(0, 16).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      const line = lines.findIndex(l => start.test(l))
      return { line, column: lines[line]!.search(start) }
    }
    const isCollapsed = (r: RowView) => !lines[titleAt(r).line]!.includes('❯')
    const holding = rows.filter(r => r.state.is === 'open' && r.holdsUpLine && isCollapsed(r))
    expect(holding.length, tab).toBeGreaterThan(0)
    for (const row of holding) {
      const title = titleAt(row)
      expect(lines[title.line + 1]!.indexOf('Holds up'), `${tab} ${row.id}`).toBe(title.column)
    }
    const column = titleAt(holding[0]!).column
    const folds = lines.filter(l => / closed ›/.test(l))
    expect(folds.length, tab).toBeGreaterThan(0)
    for (const fold of folds) expect(fold.search(/\d+ closed/), `${tab} fold`).toBe(column)
  }
})

test('the rows of an Asks, Finds or PR group hang from the mark of its heading, ├─ for each and └─ for the last, with the trunk beside the lines under every row but the last', () => {
  const screen = screenOf()
  const tabs = [
    { ui: { ...INITIAL_UI, tab: 'needsYou' as const }, groups: 2 },
    { ui: { ...INITIAL_UI, tab: 'findings' as const }, groups: 2 },
    { ui: { ...INITIAL_UI, tab: 'prs' as const }, groups: 3 },
  ]
  for (const { ui, groups } of tabs) {
    const lines = text(screen, ui, 120).split('\n')
    const isArm = (l: string | undefined) => l?.[1] === '├' || l?.[1] === '└'
    const headings = lines.flatMap((l, n) => (/^ [^ ├└│]/.test(l) && isArm(lines[n + 1]) ? [n] : []))
    expect(headings.length, ui.tab).toBe(groups)
    for (const [k, heading] of headings.entries()) {
      const last = lines.findIndex((l, n) => n > heading && l[1] === '└')
      const end = headings[k + 1] ?? lines.length
      expect(
        lines.slice(heading + 1, last).every(l => l[1] === '├' || l[1] === '│'),
        lines[heading],
      ).toBe(true)
      expect(
        lines.slice(last + 1, end).some(l => isArm(l) || l[1] === '│'),
        lines[heading],
      ).toBe(false)
    }
    expect(
      lines.some(l => /^❯[├└]─ /.test(l)),
      ui.tab,
    ).toBe(true)
    expect(lines.filter(l => l.startsWith(' │ ')).length, ui.tab).toBeGreaterThan(1)
  }
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
  expect(cursorOf(atFirst)).toBe(open[1]!.id)
  const wrapped = keys(screen, INITIAL_UI, ...open.map(() => 'down'))
  expect(cursorOf(wrapped)).toBe(first.id)
  expect(cursorOf(keys(screen, INITIAL_UI, 'up'))).toBe(open.at(-1)!.id)
  expect(cursorOf(keys(screen, INITIAL_UI, 'j'))).toBe(open[1]!.id)
  expect(cursorOf(keys(screen, INITIAL_UI, 'k'))).toBe(open.at(-1)!.id)
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
  const screen = screenOf({ view: sessionView(state, NOW, SETTLED_MS) })
  const { lastActions, turns, prs } = screen.view
  const { pr } = prs.drawn[0]!
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now: NOW }
  const block = prBlockActions(pr, isSent, prs.branchRef, presses, prSyncOf(screen.view.sync, pr.ref)).actions
  expect(block.slice(0, 2).map(a => a.label)).toEqual(['Try again', 'Resolve conflicts'])
  const lines = text(screen, withCursorOn({ ...INITIAL_UI, tab: 'prs' }, prMarkId(ref))).split('\n')
  expect(lines.findIndex(l => l.includes('Refresh PRs'))).toBeLessThan(lines.findIndex(l => l.includes(pr.title)))
  expect(lines.join('\n')).toContain('Last refresh failed: HTTP 502')
  const plans = [
    block,
    ...waitingThreads(pr).map(t => threadActions(pr, t, presses).actions),
    ...blockingChecks(pr).map(c => checkActions(pr, c, presses).actions),
  ]
  expect(plans.length).toBeGreaterThan(3)
  let ui: PanelUi = withCursorOn({ ...INITIAL_UI, tab: 'prs' }, prMarkId(pr.ref))
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

test('a row keeps its age at a narrow width and beside a long outcome, and its title and status shorten instead', () => {
  const ui: PanelUi = { ...INITIAL_UI, unfolded: ['question', 'task', 'issue', 'opportunity'] }
  const ages = (width: number) =>
    (['needsYou', 'findings'] as const).flatMap(
      tab => text(screenOf(), { ...ui, tab }, width).match(/\d+[mh] ago|just now/g) ?? [],
    )
  const wide = ages(200)

  expect(wide.length).toBeGreaterThan(10)
  expect(ages(90)).toEqual(wide)
  expect(ages(48)).toEqual(wide)
  for (const line of text(screenOf(), { ...ui, tab: 'needsYou' }, 48).split('\n'))
    expect(strip(line).length).toBeLessThanOrEqual(48)
})

test('the Herdr install question sits above the Asks rows, its buttons and their y and q keys answer it once', () => {
  const asking = herdrAskOf('/app', undefined, null)
  const screen = screenOf({ herdrAsk: asking })
  const onAsk: PanelUi = withCursorOn({ ...INITIAL_UI }, HERDR_ASK_ID)
  const lines = text(screen, INITIAL_UI).split('\n')
  const askAt = lines.findIndex(l => l.includes("Install the inbox's Herdr mod?"))

  expect(askAt).toBeGreaterThan(-1)
  expect(askAt).toBeLessThan(lines.findIndex(l => l.includes(firstQuestion(screen).title)))
  const install = keyed(screen, onAsk, 'enter', NOW)
  expect(install.press).toEqual({ action: 'herdr-ask', isYes: true })
  expect(install.ui.focus).toBe(null)
  expect(keyed(screen, keys(screen, onAsk, 'right'), 'enter', NOW).press).toEqual({
    action: 'herdr-ask',
    isYes: false,
  })

  expect(text(screen, INITIAL_UI)).toMatch(/Install \(recommended\) +q .*Don't install/)
  expect(keyed(screen, INITIAL_UI, 'y', NOW).press).toEqual({ action: 'herdr-ask', isYes: true })
  expect(keyed(screen, INITIAL_UI, 'q', NOW).press).toEqual({ action: 'herdr-ask', isYes: false })

  const saving = screenOf({ herdrAsk: answeringOf(asking, false) })
  expect(text(saving, onAsk)).toContain('Saving the answer…')
  expect(keyed(saving, onAsk, 'y', NOW).press).toBeUndefined()
  expect(keyed(saving, onAsk, 'enter', NOW).press?.action).not.toBe('herdr-ask')
})

test('the w key folds every fold of the shown tab, then opens them all, and saves each row it collapses', () => {
  const screen = screenOf()
  const ids = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks]
    .filter(r => r.state.is !== 'settled')
    .map(r => r.id)
  expect(ids.length).toBeGreaterThan(1)
  const folded = keyed(screen, withCursorOn({ ...INITIAL_UI }, ids[0]!), 'w', NOW)
  expect(folded.sent).toEqual(expect.arrayContaining(ids.map(id => ({ action: 'collapse', id, isCollapsed: true }))))
  const collapsed = { ...screen, view: { ...screen.view, collapsed: ids } }
  const opened = keyed(collapsed, folded.ui, 'w', NOW)
  expect(opened.sent).toEqual(expect.arrayContaining(ids.map(id => ({ action: 'collapse', id, isCollapsed: false }))))
})

test('an open row shows its whole title on as many lines as it takes, and a collapsed row cuts it after two lines', () => {
  const screen = screenOf()
  const questions = screen.view.needsYou.questions
  const row = questions.find(r => r.title.includes('pinch'))!
  const other = questions.find(r => r.id !== row.id)!
  const titleOf = (ui: PanelUi) => {
    const lines = text(screen, ui, 36).split('\n')
    const at = lines.findIndex(l => l.includes('Dismiss a glance'))
    return lines.slice(at, at + 3)
  }

  expect(titleOf({ ...onRow(row), opened: row.id })[2]).toMatch(/the wrist\?/)
  const collapsed = titleOf(onRow(other))
  expect(collapsed[1]).toMatch(/flick of…$/)
  expect(collapsed[2]).not.toMatch(/wrist/)
})
