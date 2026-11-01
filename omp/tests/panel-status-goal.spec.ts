import { expect, test } from 'bun:test'

import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { goalKeyPlan, proposalKeyPlan, statusKeyRows } from '../../hooks/status-keys'
import { sessionView } from '../../hooks/session-view'
import type { SessionStatus } from '../../types'
import { demoState } from '../src/demo'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { keys, NOW, onPage, screenOf, text } from './panel-harness'

const MIN = 60_000

const screenWith = (fields: Partial<SessionStatus>) => {
  const s = demoState(NOW)
  const overview = { ...s.ledger.overview!, askSubjects: {}, goal: null, milestones: [], serves: {}, ...fields }

  return screenOf({ view: sessionView({ ...s, ledger: { ...s.ledger, overview } }, NOW, SETTLED_MS, true, NO_HOLDS) })
}
const proposing = () =>
  screenWith({
    proposedGoal: {
      text: 'Pilot ready to announce',
      milestones: [
        { name: 'Fixes built', status: 'done' },
        { name: 'Announced', status: 'queued' },
      ],
      at: NOW - MIN,
    },
  })
const withGoal = () =>
  screenWith({
    goal: {
      text: 'Pilot ready to announce',
      setAt: NOW - 60 * MIN,
      metAt: null,
      was: null,
      isAwaitingMilestones: false,
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

test('a proposed goal draws above the head with its milestones’ marks and its buttons in the plan’s order, selected first when no ask holds anything up, and no Set a goal while it shows', () => {
  const screen = proposing()
  const page = screen.view.statusPage
  expect(statusKeyRows(page).map(t => t.id)).toEqual(['proposal'])
  const lines = text(screen, onPage).split('\n')
  const order = ['Proposed goal · from your message', 'Pilot ready to announce', '✓ Fixes built   ○ Announced']
  const at = order.map(s => lineAt(lines, s))
  expect(at).toEqual([...at].sort((a, b) => a - b))
  expect(at[2]).toBeLessThan(lineAt(lines, page.head!.title))
  const buttons = lines[at[2]! + 1]!
  const labels = proposalKeyPlan(page).map(k => k.label)
  expect(labels).toEqual(['Use this goal', 'Edit', 'Not now'])
  expect(labels.map(l => buttons.indexOf(l))).toEqual(labels.map(l => buttons.indexOf(l)).sort((a, b) => a - b))
  expect(buttons).toContain('↵ Use this goal')
  expect(buttons).toContain('e Edit')
  expect(lines.some(l => l.includes('Set a goal'))).toBe(false)
})

test('Use this goal and Not now press the goal by their keys or Enter and select the goal’s button, and Edit opens the goal field with the proposal in it', () => {
  const screen = proposing()
  expect(handleKey(screen, onPage, 'u', NOW).press).toEqual({ action: 'use-goal', id: 'goal' })
  expect(handleKey(screen, onPage, 'enter', NOW).press).toEqual({ action: 'use-goal', id: 'goal' })
  expect(handleKey(screen, onPage, 'x', NOW).press).toEqual({ action: 'decline-goal', id: 'goal' })
  expect(handleKey(screen, onPage, 'u', NOW).ui).toMatchObject({ selectedId: 'goal', pageReveal: 'goal' })
  const editing = handleKey(screen, onPage, 'e', NOW)
  expect(editing.press).toBeUndefined()
  expect(editing.ui).toMatchObject({
    typing: 'goal',
    drafts: { goal: { text: 'Pilot ready to announce', since: NOW } },
  })
})

test('a set goal draws its count, its text, its milestones and Change goal above the head, which draws as its Now line', () => {
  const screen = withGoal()
  const page = screen.view.statusPage
  expect(goalKeyPlan(page).map(k => k.label)).toEqual(['Change goal'])
  const lines = text(screen, onPage).split('\n')
  const order = ['Goal · 1 of 2 done', 'Pilot ready to announce', '✓ Fixes built', '○ Announced', 'after deploy']
  const at = order.map(s => lineAt(lines, s))
  expect(at).toEqual([...at].sort((a, b) => a - b))
  expect(lines[at[4]! + 1]).toContain('↵ Change goal')
  expect(lineAt(lines, `Now: ${page.head!.description}`)).toBeGreaterThan(at[4]! + 1)
  expect(lineAt(lines, page.head!.title)).toBe(-1)
})

test('Change goal opens the field with the goal in it in place of the goal and its button, Enter sets what was typed, and Escape keeps the draft', () => {
  const screen = withGoal()
  const typing = keys(screen, onPage, 'g')
  expect(typing).toMatchObject({ typing: 'goal', drafts: { goal: { text: 'Pilot ready to announce' } } })
  const edited: PanelUi = keys(screen, typing, 'backspace', 'backspace', 'backspace', 'backspace', 'backspace')
  const lines = text(screen, edited).split('\n')
  expect(lines.some(l => l.includes('An outcome to work toward:'))).toBe(true)
  expect(lines.some(l => l.includes('Pilot ready to ann'))).toBe(true)
  expect(lines.some(l => l.includes('Change goal'))).toBe(false)
  expect(lines.at(-1)).toContain('↵ Set goal')
  expect(handleKey(screen, edited, 'enter', NOW).press).toEqual({
    action: 'type',
    id: 'goal',
    text: 'Pilot ready to ann',
  })
  const cancelled = handleKey(screen, edited, 'escape', NOW).ui
  expect(cancelled.typing).toBeNull()
  expect(cancelled.drafts.goal?.text).toBe('Pilot ready to ann')
  expect(text(screen, cancelled)).toContain('Change goal')
})

test('Set a goal is the only button on a page with no goal and no held subject: it is selected and keyed, up and down still scroll, and s opens an empty goal field under the head', () => {
  const screen = screenWith({})
  expect(statusKeyRows(screen.view.statusPage).map(t => t.id)).toEqual(['goal'])
  expect(text(screen, onPage)).toContain('↵ Set a goal')
  expect(keys(screen, onPage, 'down').pageTop).toBe(1)
  const typing = keys(screen, onPage, 's')
  expect(typing).toMatchObject({ typing: 'goal', drafts: { goal: { text: '' } } })
  const lines = text(screen, typing).split('\n')
  expect(lineAt(lines, 'An outcome to work toward:')).toBeGreaterThan(lineAt(lines, screen.view.statusPage.head!.title))
})

test('with a goal set, subjects that serve none of its milestones draw under the Other work rule, and the seen ones, done ones included, fold into a count by mark', () => {
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
    },
  })
  const lines = text(screen, onPage, 60).split('\n')
  const rule = lines.find(l => l.includes('Other work'))!
  expect(rule).toMatch(/^ {3}Other work ─{4,}$/)
  expect(rule.length).toBeLessThanOrEqual(60)
  expect(lines.find(l => l.includes('1 waiting'))).toBe('   ◌ 1 waiting · ✓ 2 done')
  expect(lineAt(lines, '1 waiting')).toBeGreaterThan(lineAt(lines, 'Other work'))
})
