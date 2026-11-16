import { expect, test } from 'claude-code/testing'

import type { Ledger, SessionStatus } from '../types'
import { emptyTab } from '../hooks/empty-tab'
import { goalPressed } from '../hooks/goal-press'
import { removeGoal, setTypedGoal } from '../hooks/status-goal-ops'
import { goalBlocks } from '../hooks/status-prompt-goal'
import { goalKeys, goalSubmitLabel } from '../hooks/status-keys'
import { upgradeStatus } from '../hooks/status-upgrade'
import { after, MIN, opsOf, page } from './status-helpers'

const WORK = 'NEW: working | Import | CSV works\nNEW: queued | Dark mode | not started'
const GOAL = 'GOAL: Import ready to demo | done Import works; working Error messages'
const SUGGEST = 'SUGGEST: Import ready to demo'

const suggested = (): SessionStatus => after(null, `${WORK}\n${SUGGEST}`, 20 * MIN)
const record = () => ({ kind: 'mark' as const, action: 'take-goal', text: 'Set', at: 0 })
const ledgerOf = (overview: SessionStatus) => ({ overview }) as unknown as Ledger

test('reads SUGGEST, with - or none for no suggestion, and leaves out an empty one', () => {
  expect(opsOf('SUGGEST: Import ready to demo\nSUGGEST: -\nSUGGEST: none')).toEqual([
    { kind: 'suggest', text: 'Import ready to demo' },
    { kind: 'suggest', text: null },
    { kind: 'suggest', text: null },
  ])
  expect(() => opsOf('SUGGEST:')).toThrow()
})

test('a suggestion is kept while no goal runs, until a SUGGEST - clears it, and an answer without SUGGEST keeps it', () => {
  const o = suggested()
  expect(o.suggestedGoal).toBe('Import ready to demo')
  expect(after(o, 'SET: Import | done | CSV works', 21 * MIN).suggestedGoal).toBe('Import ready to demo')
  expect(after(o, 'SUGGEST: -', 21 * MIN).suggestedGoal).toBeNull()
})

test('no suggestion is kept while a goal runs, or one that restates the goal or a removed goal', () => {
  const withGoal = after(null, `${WORK}\n${GOAL}\n${SUGGEST}`, 20 * MIN)
  expect(withGoal.goal?.text).toBe('Import ready to demo')
  expect(withGoal.suggestedGoal).toBeNull()
  const removed = removeGoal(withGoal)
  expect(after(removed, SUGGEST, 21 * MIN).suggestedGoal).toBeNull()
  expect(after(removed, 'SUGGEST: Dark mode shipped', 21 * MIN).suggestedGoal).toBe('Dark mode shipped')
})

test('Set makes the suggestion an inferred goal that waits for its milestones, and a typed goal clears the suggestion', () => {
  const o = suggested()
  const pressed = goalPressed(ledgerOf(o), { action: 'take-goal', id: 'goal' }, record, 22 * MIN)
  expect('stale' in pressed).toBe(false)
  const taken = 'ledger' in pressed ? pressed.ledger.overview : null
  expect(taken?.goal).toMatchObject({ text: 'Import ready to demo', source: 'inferred', isAwaitingMilestones: true })
  expect(taken?.suggestedGoal).toBeNull()
  expect(goalPressed(ledgerOf(taken!), { action: 'take-goal', id: 'goal' }, record, 23 * MIN)).toEqual({ stale: true })
  expect(setTypedGoal(o, 'Dark mode shipped', 22 * MIN).suggestedGoal).toBeNull()
})

test('a saved Status from before suggestions upgrades with none, and one with a suggestion keeps it', () => {
  const o = suggested()
  const { suggestedGoal: _, ...old } = o
  expect(upgradeStatus(old)?.suggestedGoal).toBeNull()
  expect(upgradeStatus(o)?.suggestedGoal).toBe('Import ready to demo')
})

test('the Status call reads the suggestion only while no goal runs', () => {
  expect(goalBlocks(suggested(), 22 * MIN).join('\n')).toContain('<suggested>\nImport ready to demo')
  const withGoal = setTypedGoal(suggested(), 'Dark mode shipped', 22 * MIN)
  expect(goalBlocks(withGoal, 22 * MIN).join('\n')).not.toContain('<suggested>')
})

test('the suggestion shows at once with Set, Edit with its words and Dismiss, and the field sets a new goal and saves an edit', () => {
  const p = page(suggested(), 22 * MIN)
  expect(goalKeys(p).map(k => [k.label, k.press])).toEqual([
    ['Set', { action: 'take-goal' }],
    ['Edit', { action: 'type-goal', text: 'Import ready to demo' }],
    ['Dismiss', { action: 'dismiss-suggestion' }],
  ])
  expect(goalSubmitLabel(p)).toBe('Set')
  const typed = page(setTypedGoal(suggested(), 'Dark mode shipped', 22 * MIN), 22 * MIN)
  expect(goalSubmitLabel(typed)).toBe('Save')
  expect(goalKeys(typed).map(k => k.label)).toEqual(['Edit', 'Remove'])
})

test('Dismiss hides the suggestion, keeps the same words from coming back, and shows New for a goal of their own', () => {
  const o = suggested()
  const pressed = goalPressed(ledgerOf(o), { action: 'dismiss-suggestion', id: 'goal' }, record, 22 * MIN)
  const dismissed = 'ledger' in pressed ? pressed.ledger.overview : null
  expect(dismissed?.suggestedGoal).toBeNull()
  expect(goalKeys(page(dismissed!, 22 * MIN)).map(k => k.label)).toEqual(['New'])
  expect(after(dismissed!, SUGGEST, 23 * MIN).suggestedGoal).toBeNull()
  expect(after(dismissed!, 'SUGGEST: Dark mode shipped', 23 * MIN).suggestedGoal).toBe('Dark mode shipped')
  expect(goalPressed(ledgerOf(dismissed!), { action: 'dismiss-suggestion', id: 'goal' }, record, 24 * MIN)).toEqual({
    stale: true,
  })
})

test('the empty Status page carries the suggestion', () => {
  const o = after(null, SUGGEST, 20 * MIN)
  const view = { statusPage: page(o, 20 * MIN) } as Parameters<typeof emptyTab>[0]
  expect(emptyTab(view, { tab: 'overview', isGoalFieldOpen: false })?.under).toMatchObject({
    is: 'set-goal',
    suggestion: 'Import ready to demo',
    keys: [{ label: 'Set' }, { label: 'Edit' }, { label: 'Dismiss' }],
  })
})

test('Undo of a removed goal stays before the suggestion’s buttons', () => {
  const removed = removeGoal(after(null, `${WORK}\n${GOAL}`, 20 * MIN))
  const withSuggestion = after(removed, SUGGEST.replace('Import ready', 'Import almost ready'), 21 * MIN)
  expect(goalKeys(page(withSuggestion, 22 * MIN)).map(k => k.label)).toEqual(['Undo', 'Set', 'Edit', 'Dismiss'])
})
