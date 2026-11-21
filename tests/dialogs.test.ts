import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { descriptionsFor, noteDialog } from '../core/domain/dialogs'
import { emptySession } from '../core/view/session-files'
import type { DialogQuestion, Item, Session } from '../types'

const question = (id: string, ask: string, options: string[]): Item => ({
  id,
  kind: 'question',
  label: null,
  ask,
  options,
  rec: null,
  helps: [],
  turn: 1,
  at: 1,
  from: 'record',
})

const withItems = (...items: Item[]): Session => {
  const s = emptySession()
  return { ...s, ledger: { ...s.ledger, turn: 1, items } }
}

test('option descriptions match options whatever their labels and recommended mark, and none matching gives null', () => {
  const descriptions = { 'A — Session rail': 'One rail per session', '2. Tabs': 'A tab each', Other: 'Unused' }
  expect(descriptionsFor(['Session rail (recommended)', 'Tabs'], descriptions)).toEqual({
    'Session rail (recommended)': 'One rail per session',
    Tabs: 'A tab each',
  })
  expect(descriptionsFor(['Yes'], { No: 'Stop' })).toBe(null)
})

test('a dialog question links to the one question of its turn with its options, takes its descriptions, and is noted once', () => {
  const dialog: DialogQuestion[] = [
    { question: 'Which cache should the API use?', options: ['Redis', 'Memory'], descriptions: { Redis: 'Shared' } },
  ]
  const s = noteDialog(withItems(question('q1', 'Pick a cache', ['Redis', 'Memory'])), 'call-1', dialog)
  expect(s.dialogQuestions.map(q => q.itemId)).toEqual(['q1'])
  expect(s.ledger.items[0]?.dialog).toEqual({ callId: 'call-1', index: 0, question: 'Which cache should the API use?' })
  expect(s.ledger.items[0]?.optionDescriptions).toEqual({ Redis: 'Shared' })
  expect(noteDialog(s, 'call-1', dialog)).toBe(s)
})

test('a dialog question whose options two questions share stays unlinked when neither restates it', () => {
  const s = noteDialog(
    withItems(question('q1', 'Ship it today?', ['Yes', 'No']), question('q2', 'Delete the old branch?', ['Yes', 'No'])),
    null,
    [{ question: 'Should I merge the pull request?', options: ['Yes', 'No'], descriptions: {} }],
  )
  expect(s.dialogQuestions.map(q => q.itemId)).toEqual([null])
  expect(s.ledger.items.map(i => i.dialog)).toEqual([undefined, undefined])
})
