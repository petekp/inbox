import { expect, test } from 'bun:test'

import { prMarkId } from '../../hooks/pr-rows'
import { entriesOf } from '../src/panel-entries'
import { INITIAL_UI } from '../src/panel'
import type { PanelUi } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { drawn, ESC, NOW, strip, taskNode, taskScreen, text } from './panel-harness'

test('Timeline draws the shared empty state, task details and planned buttons, and moves and folds branches', () => {
  const empty = taskScreen([])
  const emptyText = text(empty, { ...INITIAL_UI, tab: 'timeline' })
  expect(emptyText).toContain('No tasks have been recorded for this session.')

  const root = taskNode('root', 'Build the view', 'working', NOW - 60_000, {
    detail: 'Keep the task-tree view compact.',
  })
  root.links = { pr: 'https://github.com/example/project/pull/4', issue: 'https://github.com/example/project/issues/7' }
  root.notes = ['Preserve the title.']
  root.history = [{ at: NOW - 60_000, source: 'agent', kind: 'updated', detail: 'Added the panel view.' }]
  const first = taskNode('first', 'Read the design', 'done', NOW - 60_000, { parentId: 'root' })
  const second = taskNode('second', 'Draw the panel', 'queued', NOW, { parentId: 'root' })
  const screen = taskScreen([root, first, second])
  screen.view.timeline.rows[0]!.warnings.push('PR merged, task still open')
  const ui: PanelUi = { ...INITIAL_UI, tab: 'timeline', timelineSelection: 'root', selectedId: 'root' }
  const rootLine = entriesOf(screen, ui, 'timeline', NOW).find(
    entry => entry.kind === 'row' && entry.line.id === 'root',
  )
  expect(rootLine?.kind === 'row' ? rootLine.line.buttons.map(button => button.label) : []).toEqual([
    'Close branch',
    'Open PR',
    'Open issue',
  ])
  const childLine = entriesOf(screen, ui, 'timeline', NOW).find(
    entry => entry.kind === 'row' && entry.line.id === 'first',
  )
  expect(childLine?.kind === 'row' ? childLine.line.buttons.map(button => button.label) : []).toEqual(['Select'])
  const detailed = text(screen, ui, 100)
  const planLines = detailed.split('\n').filter(line => line.includes('Task plan'))
  expect(planLines).toHaveLength(1)
  const detailLabels = ['Detail ·', 'Updated ·', 'Note ·', 'History ·', 'Links ·', 'Open PR', 'Open issue']
  const detailPositions = detailLabels.map(label => detailed.indexOf(label))
  expect(detailPositions.every(position => position >= 0)).toBe(true)
  expect(detailPositions).toEqual([...detailPositions].sort((left, right) => left - right))
  expect(detailed).not.toContain('Updated 1m')
  const drawnRows = strip(detailed)
  const detailRows = drawnRows.split('\n').filter(line => /└─ (Detail|Updated|Note|History|Links) ·/.test(line))
  expect(detailRows.slice(0, 4).map(line => line.trimStart())).toEqual([
    '└─ Detail · Keep the task-tree view compact.',
    '└─ Updated · 1m',
    '└─ Note · Preserve the title.',
    '└─ History · 1m · agent · Added the panel view.',
  ])
  const linksLine = detailRows.at(-1)!
  expect(linksLine.trimStart()).toContain('└─ Links ·')
  expect(linksLine.indexOf('Open PR')).toBeLessThan(linksLine.indexOf('Open issue'))
  expect(drawnRows.split('\n').filter(line => line.includes('Open PR'))).toHaveLength(1)
  expect(drawnRows.split('\n').filter(line => line.includes('Open issue'))).toHaveLength(1)
  expect(drawnRows).toContain('> ● Build the view · working ·')
  expect(drawnRows).toContain('├─ ✓ Read the design · done · w1')
  expect(drawnRows).toContain('└─ · Draw the panel · queued · w1')
  expect(drawnRows).toContain('└─ ⚠ PR merged, task still open')
  expect(drawnRows).not.toContain('! PR merged, task still open')
  const selectedChild = strip(text(screen, { ...ui, timelineSelection: 'first', selectedId: 'first' }, 100))
  expect(selectedChild).toContain('> ├─ ✓ Read the design · done · w1')
  const shown = text(screen, ui, 42)
  expect(shown).toContain('Task plan')
  expect(shown).toContain('Note · Preserve the title.')
  expect(shown).toContain('PR merged, task still open')
  expect(shown).toContain('├─ ✓ Read the design')
  expect(shown).toContain('└─ · Draw the panel')
  const narrowRows = strip(shown).split('\n')
  const narrowLinks = narrowRows.find(line => line.includes('└─ Links ·'))!
  expect(narrowLinks.indexOf('Open PR')).toBeLessThan(narrowLinks.indexOf('Open issue'))
  expect(narrowRows.every(line => line.length <= 42)).toBe(true)

  expect(handleKey(screen, { ...ui, timelineSelection: null, selectedId: null }, 'j', NOW).ui.timelineSelection).toBe(
    'root',
  )
  expect(handleKey(screen, { ...ui, focus: { rowId: 'root', index: 0 } }, 'enter', NOW).ui.timelineFolded).toEqual([
    'root',
  ])
  expect(handleKey(screen, { ...ui, timelineFolded: ['root'] }, 'l', NOW).ui.timelineFolded).toEqual([])
  expect(handleKey(screen, { ...ui, focus: { rowId: 'root', index: 1 } }, 'enter', NOW).press).toEqual({
    action: 'pr-open',
    ref: 'https://github.com/example/project/pull/4',
  })
})

test('Timeline j and k run the planned Select action for the task they land on', () => {
  const screen = taskScreen([taskNode('root', 'Root', 'working'), taskNode('child', 'Child', 'queued')])
  let ui: PanelUi = { ...INITIAL_UI, tab: 'timeline', selectedId: 'root', timelineSelection: 'root' }
  const plannedSelect = (id: string) => {
    const line = entriesOf(screen, ui, 'timeline', NOW).find(entry => entry.kind === 'row' && entry.line.id === id)
    return line?.kind === 'row'
      ? line.line.buttons.find(button => button.press.action === 'timeline-select' && button.press.id === id)
      : undefined
  }

  expect(plannedSelect('child')?.label).toBe('Select')
  ui = handleKey(screen, ui, 'j', NOW).ui
  expect(ui.timelineSelection).toBe('child')
  expect(plannedSelect('root')?.label).toBe('Select')
  ui = handleKey(screen, ui, 'k', NOW).ui
  expect(ui.timelineSelection).toBe('root')
})

test('Timeline link open results stay on the Links line', () => {
  const root = taskNode('root', 'Root', 'working')
  const pr = 'https://github.com/example/project/pull/4'
  const issue = 'https://github.com/example/project/issues/7'
  root.links = { pr, issue }
  const screen = taskScreen([root])
  screen.view.lastActions[prMarkId(pr)] = {
    kind: 'local',
    action: 'pr-open',
    text: 'Open PR',
    at: NOW,
    result: { state: 'done', at: NOW, parts: [{ kind: 'open', name: 'PR #4', error: null, isCommand: false }] },
  }
  screen.view.lastActions[prMarkId(issue)] = {
    kind: 'local',
    action: 'pr-open',
    text: 'Open issue',
    at: NOW,
    result: {
      state: 'failed',
      at: NOW,
      parts: [{ kind: 'open', name: 'Issue #7', error: 'no browser', isCommand: false }],
    },
  }
  const ui: PanelUi = { ...INITIAL_UI, tab: 'timeline', selectedId: 'root', timelineSelection: 'root' }
  const lines = text(screen, ui).split('\n')
  const links = lines.find(line => line.includes('Links ·'))!
  expect(links).toContain('Open PR')
  expect(links).toContain('✓ Opened')
  expect(links).toContain('Open issue')
  expect(links).toContain('no browser')
  expect(lines.filter(line => line.includes('no browser'))).toHaveLength(1)
  const rawLinks = drawn(screen, ui).find(line => strip(line).includes('Links ·'))!
  expect(rawLinks).toContain(`${ESC}35mno browser${ESC}39m`)
})
