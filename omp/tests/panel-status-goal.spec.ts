import { expect, test } from 'bun:test'

import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { goalKeyPlan, statusKeyRows } from '../../hooks/status-keys'
import { sessionView } from '../../hooks/session-view'
import type { SessionStatus } from '../../types'
import { demoState } from '../src/demo'
import { drawPanel } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { keys, NOW, onPage, screenOf, strip, style, text } from './panel-harness'

const MIN = 60_000

const screenWith = (fields: Partial<SessionStatus>) => {
  const s = demoState(NOW)
  const overview = { ...s.ledger.overview!, askSubjects: {}, goal: null, milestones: [], serves: {}, ...fields }

  return screenOf({ view: sessionView({ ...s, ledger: { ...s.ledger, overview } }, NOW, SETTLED_MS, NO_HOLDS) })
}
const withGoal = () =>
  screenWith({
    goal: {
      text: 'Pilot ready to announce',
      setAt: NOW - 60 * MIN,
      metAt: null,
      was: null,
      isAwaitingMilestones: false,
      source: 'inferred',
    },
    milestones: [
      { id: 'm1', name: 'Fixes built', status: 'done', text: '', was: null, changedAt: NOW - 50 * MIN, closedAt: null },
      {
        id: 'm2',
        name: 'Announced',
        status: 'queued',
        text: 'after deploy',
        was: null,
        changedAt: NOW - MIN,
        closedAt: null,
      },
    ],
    nextMilestoneId: 3,
  })
const lineAt = (lines: string[], s: string) => lines.findIndex(l => l.includes(s))

test('Remove goal presses the goal by its key and selects the goal’s place, where Set goal then shows', () => {
  const removed = handleKey(withGoal(), onPage, 'r', NOW)
  expect(removed.press).toEqual({ action: 'remove-goal', id: 'goal' })
  expect(removed.ui).toMatchObject({ selectedId: 'goal', pageReveal: 'goal' })
})

test('a set goal draws its Goal heading, its text with its count, the head as its Now line, Edit and Remove goal as its buttons under them, and then its milestones', () => {
  const screen = withGoal()
  const page = screen.view.statusPage
  expect(goalKeyPlan(page).map(k => k.label)).toEqual(['Edit', 'Remove goal'])
  const lines = text(screen, onPage).split('\n')
  const order = [
    'Goal ─',
    'Pilot ready to announce · 1 of 2 done',
    `Now: ${page.head!.description}`,
    '↵ Edit  r Remove goal',
    '✓ Fixes built',
    '○ Announced',
    'after deploy',
  ]
  const at = order.map(s => lineAt(lines, s))
  expect(at).toEqual([...at].sort((a, b) => a - b))
  expect(lines.slice(at[6]! + 1).some(l => l.includes('Edit'))).toBe(false)
  expect(lineAt(lines, page.head!.title)).toBe(-1)
})

test('e on the goal’s Edit opens the field with the goal in it in place of the goal’s text, leaving its heading as Goal, Enter sets what was typed, and Escape keeps the draft', () => {
  const screen = withGoal()
  const typing = keys(screen, onPage, 'e')
  expect(typing).toMatchObject({ typing: 'goal', drafts: { goal: { text: 'Pilot ready to announce' } } })
  const edited: PanelUi = keys(screen, typing, 'backspace', 'backspace', 'backspace', 'backspace', 'backspace')
  const lines = text(screen, edited).split('\n')
  expect(lines.some(l => l.includes('An outcome to work toward:'))).toBe(true)
  expect(lines.some(l => l.includes('Pilot ready to ann'))).toBe(true)
  expect(lines.some(l => l.includes('Edit'))).toBe(false)
  expect(lines.some(l => /^ Goal ─+$/.test(l))).toBe(true)
  expect(lines.at(-1)).toContain('↵ Set goal')
  expect(handleKey(screen, edited, 'enter', NOW).press).toEqual({
    action: 'type',
    id: 'goal',
    text: 'Pilot ready to ann',
  })
  const cancelled = handleKey(screen, edited, 'escape', NOW).ui
  expect(cancelled.typing).toBeNull()
  expect(cancelled.drafts.goal?.text).toBe('Pilot ready to ann')
  expect(text(screen, cancelled)).toContain('↵ Edit')
})

test('Set goal is the only button on a page with no goal and no held subject, under the Goal heading and the line that says no goal is set, and is selected ahead of the done fold: it is keyed, up and down still scroll, and s opens an empty goal field above the head', () => {
  const screen = screenWith({})
  expect(statusKeyRows(screen.view.statusPage).map(t => t.id)).toEqual(['goal', 'done'])
  const shown = text(screen, onPage).split('\n')
  expect(lineAt(shown, 'Goal ─')).toBeLessThan(lineAt(shown, 'No goal yet.'))
  expect(lineAt(shown, 'No goal yet.')).toBeLessThan(lineAt(shown, '↵ Set goal'))
  expect(lineAt(shown, '↵ Set goal')).toBeLessThan(lineAt(shown, screen.view.statusPage.head!.title))
  expect(keys(screen, onPage, 'down').pageTop).toBe(1)
  const typing = keys(screen, onPage, 's')
  expect(typing).toMatchObject({ typing: 'goal', drafts: { goal: { text: '' } } })
  const lines = text(screen, typing).split('\n')
  expect(lineAt(lines, 'An outcome to work toward:')).toBeLessThan(lineAt(lines, screen.view.statusPage.head!.title))
})

test('with a goal set, subjects that serve none of its milestones draw under the Other work rule, and the seen open ones fold into a count by mark, with the done ones in a done fold after it', () => {
  const s = demoState(NOW)
  const serves = Object.fromEntries(s.ledger.overview!.subjects.map(x => [x.id, 'none']))
  const screen = screenWith({
    serves,
    goal: {
      text: 'Pilot ready to announce',
      setAt: NOW - 60 * MIN,
      metAt: null,
      was: null,
      isAwaitingMilestones: true,
      source: 'typed',
    },
  })
  const lines = text(screen, onPage, 60).split('\n')
  const rule = lines.find(l => l.includes('Other work'))!
  expect(rule).toMatch(/^ {3}Other work ─{4,}$/)
  expect(rule.length).toBeLessThanOrEqual(60)
  expect(lines.find(l => l.includes('1 waiting'))).toBe('   ◌ 1 waiting')
  expect(lines.slice(lineAt(lines, '1 waiting') + 1, lineAt(lines, '1 waiting') + 3)).toEqual([
    `   ${'─'.repeat(56)}`,
    ' ▸ 2 more done',
  ])
  expect(lineAt(lines, '1 waiting')).toBeGreaterThan(lineAt(lines, 'Other work'))
})

test('in a short panel, after Remove goal its Set goal shows, even from a page scrolled past it', () => {
  const removed = handleKey(withGoal(), { ...onPage, selectedId: 'goal', pageTop: 4 }, 'r', NOW).ui
  const lines = drawPanel(screenWith({}), removed, 60, NOW, style, 14).lines.map(strip)
  expect(lineAt(lines, 'Pilot ready to announce')).toBe(-1)
  expect(lineAt(lines, 'Set goal')).toBeGreaterThan(-1)
})
