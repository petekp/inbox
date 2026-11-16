import { expect, test } from 'bun:test'

import type { Block, Does } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import type { LookUi } from '../src/draw'
import { afterSend, withChange, withoutStaleSuggestion } from '../src/keys'
import { demoScreen, uiOn } from './fixtures'

const SUGGESTION = 'Ship 0.5.0 to the store'

function screenWith(goal: 'none' | 'running') {
  const screen = demoScreen()
  const page = screen.view.statusPage
  const statusPage = { ...page, goal: goal === 'none' ? null : page.goal, suggestedGoal: SUGGESTION }

  return { ...screen, view: { ...screen.view, statusPage } }
}

const labelsOf = (blocks: Block[]) => {
  const heading = blocks.find(b => b.kind === 'heading' && b.id === 'goal heading')
  return heading?.kind === 'heading' ? heading.buttons : []
}

const pressed = (ui: LookUi, does: Does): LookUi => {
  if (does.is !== 'view' || 'toggleHelp' in does.change) throw new Error('not a view change')
  return withChange(ui, does.change)
}

const textsOf = (blocks: Block[]) => blocks.flatMap(b => (b.kind === 'note' ? [b.text] : []))

test('New with a suggestion shows it with Set, Edit and Cancel, and Cancel closes it', () => {
  const screen = screenWith('none')
  const closed = tabBlocks(screen, uiOn('overview'))
  expect(labelsOf(closed).map(b => b.label)).toEqual(['New'])
  const opened = pressed(uiOn('overview'), labelsOf(closed)[0]!.does)
  const open = tabBlocks(screen, opened)
  expect(labelsOf(open).map(b => b.label)).toEqual(['Set', 'Edit', 'Cancel'])
  expect(textsOf(open)).toEqual(expect.arrayContaining(['Suggested', SUGGESTION]))
  const shut = tabBlocks(screen, pressed(opened, labelsOf(open)[2]!.does))
  expect(labelsOf(shut).map(b => b.label)).toEqual(['New'])
  expect(textsOf(shut)).not.toContain(SUGGESTION)
})

test('Set sends the goal press for the suggestion', () => {
  const open = tabBlocks(screenWith('none'), uiOn('overview', { isSuggestionOpen: true }))
  expect(labelsOf(open)[0]!.does).toMatchObject({ is: 'press', press: { action: 'take-goal', id: 'goal' } })
})

test('Edit opens the field with the suggestion and a Set button, and the field’s Cancel shows the suggestion again', () => {
  const screen = screenWith('none')
  const edit = labelsOf(tabBlocks(screen, uiOn('overview', { isSuggestionOpen: true })))[1]!.does
  expect(edit).toMatchObject({ is: 'type', rowId: 'goal', text: SUGGESTION })
  const typing: LookUi = uiOn('overview', { isSuggestionOpen: true, typing: 'goal' })
  const field = tabBlocks(screen, typing).find(b => b.kind === 'field')
  expect(field?.kind === 'field' && field.field.buttons.map(b => b.label)).toEqual(['Set', 'Cancel'])
  expect(textsOf(tabBlocks(screen, typing))).not.toContain(SUGGESTION)
  const left = tabBlocks(screen, { ...typing, typing: null })
  expect(labelsOf(left).map(b => b.label)).toEqual(['Set', 'Edit', 'Cancel'])
})

test('sending the goal field closes the suggestion, and a page with no suggestion closes it', () => {
  const typing = uiOn('overview', { isSuggestionOpen: true, typing: 'goal' })
  expect(afterSend(typing, 'goal', true)).toMatchObject({ isSuggestionOpen: false, typing: null })
  expect(afterSend(typing, 'goal', false)).toMatchObject({ isSuggestionOpen: true, typing: 'goal' })
  const page = { ...screenWith('none').view.statusPage, suggestedGoal: null }
  expect(withoutStaleSuggestion(typing, page).isSuggestionOpen).toBe(false)
})

test('with no suggestion New opens the empty field labelled Set, and Edit of a running goal labelled Save', () => {
  const none = demoScreen()
  const page = { ...none.view.statusPage, goal: null, suggestedGoal: null }
  const noSuggestion = { ...none, view: { ...none.view, statusPage: page } }
  const typing = uiOn('overview', { typing: 'goal' })
  const send = (screen: typeof none) => {
    const f = tabBlocks(screen, typing).find(b => b.kind === 'field')
    return f?.kind === 'field' ? f.field.buttons[0]!.label : null
  }
  expect(labelsOf(tabBlocks(noSuggestion, uiOn('overview')))[0]!.does).toMatchObject({ is: 'type', text: '' })
  expect(send(noSuggestion)).toBe('Set')
  expect(send(screenWith('running'))).toBe('Save')
})
