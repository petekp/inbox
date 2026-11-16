import { expect, test } from 'bun:test'

import type { Block } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import type { LookUi } from '../src/draw'
import { afterSend } from '../src/keys'
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

const textsOf = (blocks: Block[]) => blocks.flatMap(b => (b.kind === 'note' ? [b.text] : []))

test('the suggestion shows at once with Set, Edit and Dismiss, and Dismiss sends its press', () => {
  const open = tabBlocks(screenWith('none'), uiOn('overview'))
  expect(labelsOf(open).map(b => b.label)).toEqual(['Set', 'Edit', 'Dismiss'])
  expect(textsOf(open)).toEqual(expect.arrayContaining(['Suggested', SUGGESTION]))
  expect(labelsOf(open)[2]!.does).toMatchObject({ is: 'press', press: { action: 'dismiss-suggestion', id: 'goal' } })
})

test('Set sends the goal press for the suggestion', () => {
  const open = tabBlocks(screenWith('none'), uiOn('overview'))
  expect(labelsOf(open)[0]!.does).toMatchObject({ is: 'press', press: { action: 'take-goal', id: 'goal' } })
})

test('Edit opens the field with the suggestion and a Set button, and the field’s Cancel shows the suggestion again', () => {
  const screen = screenWith('none')
  const edit = labelsOf(tabBlocks(screen, uiOn('overview')))[1]!.does
  expect(edit).toMatchObject({ is: 'type', rowId: 'goal', text: SUGGESTION })
  const typing: LookUi = uiOn('overview', { typing: 'goal' })
  const field = tabBlocks(screen, typing).find(b => b.kind === 'field')
  expect(field?.kind === 'field' && field.field.buttons.map(b => b.label)).toEqual(['Set', 'Cancel'])
  expect(textsOf(tabBlocks(screen, typing))).not.toContain(SUGGESTION)
  const left = tabBlocks(screen, { ...typing, typing: null })
  expect(labelsOf(left).map(b => b.label)).toEqual(['Set', 'Edit', 'Dismiss'])
})

test('sending the goal field closes it, and a refused send keeps it open', () => {
  const typing = uiOn('overview', { typing: 'goal' })
  expect(afterSend(typing, 'goal', true)).toMatchObject({ typing: null })
  expect(afterSend(typing, 'goal', false)).toMatchObject({ typing: 'goal' })
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
