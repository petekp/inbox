import { expect, test } from 'bun:test'

import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { sessionView } from '../../hooks/session-view'
import type { SessionStatus } from '../../types'
import { demoState } from '../src/demo'
import { handleKey } from '../src/panel-keys'
import { keys, NOW, onPage, screenOf, strip, style, text, drawn } from './panel-harness'

const SUGGESTED = 'Ship 0.5.0 to the store'

const screenWith = (fields: Partial<SessionStatus>) => {
  const s = demoState(NOW)
  const overview = { ...s.ledger.overview!, askSubjects: {}, goal: null, milestones: [], serves: {}, ...fields }

  return screenOf({ view: sessionView({ ...s, ledger: { ...s.ledger, overview } }, NOW, SETTLED_MS, NO_HOLDS) })
}
const suggesting = () => screenWith({ suggestedGoal: SUGGESTED })
const headingOf = (lines: string[]) => lines.filter(l => l.startsWith(' Goal ─')).join(' ')

test('New with a suggestion shows Suggested and its text in the goal text’s place, with Set, Edit and Cancel in order, focused on Set', () => {
  const screen = suggesting()
  const closed = text(screen, onPage, 60)
  expect(closed).not.toContain('Suggested')
  const opened = keys(screen, onPage, 'n')
  expect(opened.isSuggestionOpen).toBe(true)
  expect(opened.typing).toBeNull()
  const lines = text(screen, opened, 60).split('\n')
  const label = lines.findIndex(l => l.trim() === 'Suggested')
  expect(label).toBeGreaterThan(-1)
  expect(lines[label + 1]!.trim()).toBe(SUGGESTED)
  const heading = headingOf(lines)
  expect(heading.indexOf('Set')).toBeLessThan(heading.indexOf('Edit'))
  expect(heading.indexOf('Edit')).toBeLessThan(heading.indexOf('Cancel'))
  expect(opened.focus).toEqual({ rowId: 'goal', index: 0 })
  expect(drawn(screen, opened, 60).join('\n')).toContain(style.bold(SUGGESTED))
})

test('Edit opens the field holding the suggestion with a Set submit, and the field’s Cancel shows the suggestion again', () => {
  const screen = suggesting()
  const edited = keys(screen, keys(screen, onPage, 'n'), 'e')
  expect(edited.typing).toBe('goal')
  expect(edited.drafts.goal!.text).toBe(SUGGESTED)
  const shown = text(screen, edited, 60)
  expect(shown).toContain(`${SUGGESTED}`)
  expect(shown).toContain('↵ Set')
  const cancelled = keys(screen, edited, 'escape')
  expect(cancelled.typing).toBeNull()
  expect(cancelled.isSuggestionOpen).toBe(true)
  expect(text(screen, cancelled, 60)).toContain('Suggested')
})

test('Cancel on the suggestion closes it and focuses New', () => {
  const screen = suggesting()
  const closed = keys(screen, keys(screen, onPage, 'n'), 'c')
  expect(closed.isSuggestionOpen).toBe(false)
  expect(closed.focus).toEqual({ rowId: 'goal', index: 0 })
  expect(text(screen, closed, 60)).not.toContain('Suggested')
})

test('Set sends take-goal for the goal and closes the suggestion', () => {
  const screen = suggesting()
  const set = handleKey(screen, keys(screen, onPage, 'n'), 's', NOW)
  expect(set.press).toEqual({ action: 'take-goal', id: 'goal' })
  expect(set.ui).toMatchObject({ isSuggestionOpen: false, selectedId: 'goal' })
})

test('submitting the edited field sends it and clears the suggestion', () => {
  const screen = suggesting()
  const edited = keys(screen, keys(screen, onPage, 'n'), 'e')
  const sent = handleKey(screen, edited, 'enter', NOW)
  expect(sent.press).toEqual({ action: 'type', id: 'goal', text: SUGGESTED })
  expect(sent.ui).toMatchObject({ typing: null, isSuggestionOpen: false })
})

test('with no suggestion New opens the empty field labelled Set, and Edit of a running goal is labelled Save', () => {
  const none = screenWith({})
  const field = keys(none, onPage, 'n')
  expect(field.isSuggestionOpen).toBe(false)
  expect(field.typing).toBe('goal')
  expect(text(none, field, 60)).toContain('↵ Set')
  const running = screenWith({
    goal: {
      text: 'Pilot ready to announce',
      setAt: NOW - 60_000,
      metAt: null,
      was: null,
      isAwaitingMilestones: false,
      source: 'inferred',
    },
  })
  const editing = keys(running, onPage, 'e')
  expect(editing.typing).toBe('goal')
  expect(text(running, editing, 60)).toContain('↵ Save')
})

test('the suggestion draws at a narrow width without a line wider than the panel', () => {
  const screen = suggesting()
  for (const width of [30, 40]) {
    const lines = drawn(screen, keys(screen, onPage, 'n'), width).map(strip)
    expect(lines.every(l => l.length <= width)).toBe(true)
    expect(lines.join('\n')).toContain('Suggested')
  }
})
