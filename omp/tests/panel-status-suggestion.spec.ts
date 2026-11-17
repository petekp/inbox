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

test('the suggestion shows at once as an offer with Set goal and Edit after it, and no New or Dismiss', () => {
  const screen = suggesting()
  const lines = text(screen, onPage, 120).split('\n')
  const offer = lines.find(l => l.includes('Next goal:'))
  expect(offer?.trim()).toMatch(/^Next goal: “Ship 0.5.0 to the store”\?\s+↵ Set goal\s+·\s+e Edit$/)
  const goal = lines.slice(
    lines.findIndex(l => l.startsWith(' Goal ─')),
    lines.findIndex(l => l.includes('Next goal:')) + 1,
  )
  expect(goal.join('\n')).not.toMatch(/Suggested|Dismiss|New/)
  expect(drawn(screen, onPage, 120).join('\n')).toContain(style.bold('Next goal: “Ship 0.5.0 to the store”?'))
})

test('at a width where the buttons do not fit after the offer, they sit under it', () => {
  const lines = text(suggesting(), onPage, 60).split('\n')
  const at = lines.findIndex(l => l.includes('Next goal:'))
  expect(lines[at]).not.toContain('Edit')
  expect(lines[at + 1]).toMatch(/Set goal.*Edit/)
})

test('Edit opens the field holding the suggestion with a Set submit, and the field’s Cancel shows the suggestion again', () => {
  const screen = suggesting()
  const edited = keys(screen, onPage, 'e')
  expect(edited.typing).toBe('goal')
  expect(edited.drafts.goal!.text).toBe(SUGGESTED)
  const shown = text(screen, edited, 60)
  expect(shown).toContain(SUGGESTED)
  expect(shown).toContain('↵ Set')
  const cancelled = keys(screen, edited, 'escape')
  expect(cancelled.typing).toBeNull()
  expect(text(screen, cancelled, 60)).toContain('Next goal:')
})

test('Set sends take-goal for the goal', () => {
  const screen = suggesting()
  const set = handleKey(screen, onPage, 's', NOW)
  expect(set.press).toEqual({ action: 'take-goal', id: 'goal' })
  expect(set.ui).toMatchObject({ selectedId: 'goal' })
})

test('submitting the edited field sends it', () => {
  const screen = suggesting()
  const edited = keys(screen, onPage, 'e')
  const sent = handleKey(screen, edited, 'enter', NOW)
  expect(sent.press).toEqual({ action: 'type', id: 'goal', text: SUGGESTED })
  expect(sent.ui).toMatchObject({ typing: null })
})

test('with no suggestion New opens the empty field labelled Set, and Edit of a running goal is labelled Save', () => {
  const none = screenWith({})
  const field = keys(none, onPage, 'n')
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
    const lines = drawn(screen, onPage, width).map(strip)
    expect(lines.every(l => l.length <= width)).toBe(true)
    expect(lines.join('\n')).toContain('Next goal')
  }
})

test('with Undo on the heading and the offer below, only the pressed button draws as focused', () => {
  const goal = {
    text: 'Old goal',
    setAt: NOW - 60_000,
    metAt: null,
    was: null,
    isAwaitingMilestones: false,
    source: 'inferred',
  } as const
  const screen = screenWith({
    suggestedGoal: SUGGESTED,
    goalRemoved: { goal, milestones: [], serves: {}, askSubjects: {} },
  })
  const focused = (ui: typeof onPage) =>
    text(screen, ui, 120)
      .split('\n')
      .filter(l => /Undo|Set goal/.test(l) && l.includes('↵')).length
  expect(focused(keys(screen, onPage, 'right'))).toBe(1)
  expect(focused(keys(screen, onPage, 'right', 'right'))).toBe(1)
})
