import { expect, test } from 'bun:test'

import type { Block } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import type { LookUi } from '../src/draw'
import { freshUi } from '../../core/view/ui-controller-types'
import { HERDR_LOOK, applyEvents } from '../src/controller'
import { NOW, demoScreen, uiOn } from './fixtures'

const SUGGESTION = 'Ship 0.5.0 to the store'

function screenWith(goal: 'none' | 'running') {
  const screen = demoScreen()
  const page = screen.view.statusPage
  const statusPage = { ...page, goal: goal === 'none' ? null : page.goal, suggestedGoal: SUGGESTION }

  return { ...screen, view: { ...screen.view, statusPage } }
}

const offerOf = (blocks: Block[]) => {
  const note = blocks.find(b => b.kind === 'note' && b.id === 'goal text')
  return note?.kind === 'note' ? note : null
}
const labelsOf = (blocks: Block[]) => offerOf(blocks)?.buttons ?? []

const textsOf = (blocks: Block[]) => blocks.flatMap(b => (b.kind === 'note' ? [b.text] : []))

test('the suggestion shows at once as an offer with Set goal and Edit after it, and nothing on the heading', () => {
  const open = tabBlocks(screenWith('none'), uiOn('overview'))
  const heading = open.find(b => b.kind === 'heading' && b.id === 'goal heading')
  expect(heading?.kind === 'heading' && heading.buttons).toEqual([])
  expect(offerOf(open)).toMatchObject({ text: `Next goal: “${SUGGESTION}”?`, tone: null, isStrong: true })
  expect(labelsOf(open).map(b => b.label)).toEqual(['Set goal', 'Edit'])
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
  expect(labelsOf(left).map(b => b.label)).toEqual(['Set goal', 'Edit'])
})

test('sending the goal field closes it, and a refused send opens it again with its words while the person has not moved', () => {
  const { view } = demoScreen()
  const onStatus = applyEvents(freshUi(HERDR_LOOK, 'overview'), view, [{ type: 'open-field', id: 'goal' }], NOW).ui
  const sent = applyEvents(
    onStatus,
    view,
    [{ type: 'press', press: { action: 'type', id: 'goal', text: 'Ship it' }, by: 'key' }],
    NOW + 1,
  )
  expect(sent.ui.typing).toBeNull()
  const outcome = { error: 'the session refused it', note: null, isUnconfirmed: false }
  const refused = applyEvents(sent.ui, view, [{ type: 'press-settled', pressId: 1, outcome }], NOW + 2)
  expect({ typing: refused.ui.typing, draft: refused.ui.drafts.goal?.text }).toEqual({
    typing: 'goal',
    draft: 'Ship it',
  })
  const moved = applyEvents(
    sent.ui,
    view,
    [
      { type: 'show-tab', tab: 'needsYou' },
      { type: 'press-settled', pressId: 1, outcome },
    ],
    NOW + 2,
  )
  expect(moved.ui.typing).toBeNull()
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
  const heading = tabBlocks(noSuggestion, uiOn('overview')).find(b => b.kind === 'heading' && b.id === 'goal heading')
  expect(heading?.kind === 'heading' && heading.buttons[0]!.does).toMatchObject({ is: 'type', text: '' })
  expect(send(noSuggestion)).toBe('Set')
  expect(send(screenWith('running'))).toBe('Save')
})
