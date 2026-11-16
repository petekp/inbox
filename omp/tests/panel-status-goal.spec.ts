import { expect, test } from 'bun:test'

import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { goalKeyPlan, statusKeyRows } from '../../hooks/status-keys'
import { sessionView } from '../../hooks/session-view'
import type { SessionStatus } from '../../types'
import { demoState } from '../src/demo'
import { drawPanel } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { drawn, keys, NOW, onPage, screenOf, strip, style, text } from './panel-harness'

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
      {
        id: 'm1',
        name: 'Fixes built',
        status: 'done',
        text: '',
        was: null,
        changedAt: NOW - 50 * MIN,
        closedAt: null,
        startedAt: null,
      },
      {
        id: 'm2',
        name: 'Announced',
        status: 'queued',
        text: 'after deploy',
        was: null,
        changedAt: NOW - MIN,
        closedAt: null,
        startedAt: null,
      },
    ],
    nextMilestoneId: 3,
    serves: { s5: 'm2' },
  })
const lineAt = (lines: string[], s: string) => lines.findIndex(l => l.includes(s))
const metGoal = () =>
  screenWith({
    goal: {
      text: 'Pilot ready to announce',
      setAt: NOW - 60 * MIN,
      metAt: NOW - MIN,
      was: null,
      isAwaitingMilestones: false,
      source: 'inferred',
    },
    milestones: (['Fixes built', 'Announced'] as const).map((name, n) => ({
      id: `m${n + 1}`,
      name,
      status: 'done' as const,
      text: '',
      was: null,
      changedAt: NOW - 50 * MIN,
      closedAt: null,
      startedAt: null,
    })),
    nextMilestoneId: 3,
  })

test('a met goal hangs a green ✓ beside Goal met, starts its text at the text column, folds its milestones into a line that names them, which j selects and f opens, and draws the head in its own section, and New opens its field at the text column', () => {
  const screen = metGoal()
  const page = screen.view.statusPage
  const lines = text(screen, onPage, 60).split('\n')
  const heading = lines.find(l => l.includes('Goal met'))!
  expect(heading).toMatch(/^ ✓ Goal met ─+/)
  expect(drawn(screen, onPage, 60).find(l => strip(l).includes('Goal met'))).toContain(style.tone('done', '✓'))
  const textColumn = heading.indexOf('Goal met')
  expect(lines[lineAt(lines, 'Pilot ready to announce')]!.indexOf('Pilot')).toBe(textColumn)
  const fold = lines[lineAt(lines, 'Fixes built, Announced ›')]!
  expect(fold.indexOf('Fixes')).toBe(textColumn)
  expect(lineAt(lines, '✓ Fixes built')).toBe(-1)
  expect(lineAt(lines, 'Now:')).toBe(-1)
  expect(lineAt(lines, page.head!.title)).toBeGreaterThan(lineAt(lines, 'Fixes built, Announced'))

  const foldId = page.goal!.milestonesFold!.id
  const opened = keys(screen, onPage, 'j', 'f')
  expect(opened.selectedId).toBe(foldId)
  expect(opened.statusUnfolded).toContain(foldId)
  const shown = text(screen, opened, 60).split('\n')
  expect(shown[lineAt(shown, 'Fixes built, Announced')]).toContain('⌄')
  expect(lineAt(shown, '✓ Fixes built')).toBeGreaterThan(lineAt(shown, 'Fixes built, Announced'))
  expect(statusKeyRows(page, id => opened.statusUnfolded.includes(id)).map(t => t.id)[1]).toBe(foldId)

  const typing = text(screen, keys(screen, onPage, 'n'), 60).split('\n')
  expect(typing[lineAt(typing, 'An outcome to work toward:')]!.indexOf('An outcome')).toBe(textColumn)
})

test('Remove presses the goal by its key and selects the goal’s place, where Undo and New then show', () => {
  const removed = handleKey(withGoal(), onPage, 'r', NOW)
  expect(removed.press).toEqual({ action: 'remove-goal', id: 'goal' })
  expect(removed.ui).toMatchObject({ selectedId: 'goal', pageReveal: 'goal' })
})

test('a set goal draws Edit and Remove at the right end of its Goal heading row, then its text, the head as its Now line, and its milestones as a path, the next on the line under a done one folded to its name, with the work on the line after the milestone’s text joined to it by a connector, and next at the right edge of its name’s line', () => {
  const screen = withGoal()
  const page = screen.view.statusPage
  expect(goalKeyPlan(page).map(k => k.label)).toEqual(['Edit', 'Remove'])
  const lines = text(screen, onPage, 60).split('\n')
  const heading = lines.find(l => l.startsWith(' Goal ─'))!
  expect(heading).toMatch(/^ Goal ─+ ↵ Edit · r Remove $/)
  expect(heading.length).toBe(59)
  const order = [
    'Goal ─',
    'Pilot ready to announce',
    `Now: ${page.head!.description}`,
    '✓ Fixes built',
    '○ Announced',
    'after deploy',
    '◌ Glasses trial',
  ]
  const at = order.map(s => lineAt(lines, s))
  expect(at).toEqual([...at].sort((a, b) => a - b))
  expect(['✓ Fixes built', '○ Announced', '◌ Glasses trial'].map(s => lines[lineAt(lines, s) - 1])).toEqual([
    '',
    ' ✓ Fixes built',
    ' │ after deploy',
  ])
  expect(lines[lineAt(lines, '◌ Glasses trial')]).toMatch(/^ └─ ◌ Glasses trial/)
  expect(lines[lineAt(lines, '○ Announced')]).toMatch(/ next$/)
  expect(lines[lineAt(lines, '○ Announced')]!.length).toBe(59)
  expect(lines.slice(at[0]! + 1).some(l => l.includes('Edit'))).toBe(false)
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
  expect(lines.at(-1)).toContain('↵ Save')
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

test('New is the only button on a page with no goal and no held subject, at the right end of the Goal heading row above the line that says no goal is set, and is selected ahead of the done fold: it is keyed, up and down still scroll, and n opens an empty goal field above the head', () => {
  const screen = screenWith({})
  expect(statusKeyRows(screen.view.statusPage).map(t => t.id)).toEqual(['goal', 's1', 's2', 'done'])
  const shown = text(screen, onPage).split('\n')
  expect(lineAt(shown, 'Goal ─')).toBe(lineAt(shown, '↵ New'))
  expect(lineAt(shown, '↵ New')).toBeLessThan(lineAt(shown, 'No goal yet.'))
  expect(lineAt(shown, 'No goal yet.')).toBeLessThan(lineAt(shown, screen.view.statusPage.head!.title))
  expect(keys(screen, onPage, 'down').pageTop).toBe(1)
  const typing = keys(screen, onPage, 'n')
  expect(typing).toMatchObject({ typing: 'goal', drafts: { goal: { text: '' } } })
  const lines = text(screen, typing).split('\n')
  expect(lineAt(lines, 'An outcome to work toward:')).toBeLessThan(lineAt(lines, screen.view.statusPage.head!.title))
})

test('with a goal set, subjects that serve none of its milestones draw under the Other work rule, and the seen open ones fold into a count by mark after the open rows, with the done ones in a done fold at the end', () => {
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
    ' ✓ Fade-out',
    '   dismissed glances fade',
  ])
  expect(lineAt(lines, '1 waiting')).toBeGreaterThan(lineAt(lines, 'Other work'))
  expect(lineAt(lines, '2 more done ›')).toBeGreaterThan(lineAt(lines, '✓ Fade-out'))
})

test('in a short panel, after Remove its New shows, even from a page scrolled past it', () => {
  const removed = handleKey(withGoal(), { ...onPage, selectedId: 'goal', pageTop: 4 }, 'r', NOW).ui
  const lines = drawPanel(screenWith({}), removed, 60, NOW, style, 14).lines.map(strip)
  expect(lineAt(lines, 'Pilot ready to announce')).toBe(-1)
  expect(lineAt(lines, 'New')).toBeGreaterThan(-1)
})

test('in a narrow panel, the goal’s buttons wrap under its heading’s rule, at the right edge, with nothing cut', () => {
  const lines = text(withGoal(), onPage, 24).split('\n')
  const at = lineAt(lines, 'Goal ─')
  expect(lines[at]).toMatch(/^ Goal ─+$/)
  expect(lines[at + 1]).toMatch(/^ +↵ Edit · r Remove $/)
  expect(lines[at + 1]!.length).toBe(23)
})
