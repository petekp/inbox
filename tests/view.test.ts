import { expect, test } from 'claude-code/testing'

import { actionLines } from '../hooks/action-plan'
import { deliveryLabel, settledLabel } from '../hooks/rows'
import { FOLD_QUIET_MS, SETTLED_MS, isSettledInPlace, nextFoldAt, withListInput } from '../hooks/timing'
import type { ListInput, Placing } from '../hooks/timing'

test('a row’s follow-ups stay on its buttons’ last line only when all of them fit there, and otherwise start the next line together', async () => {
  const spacing = { gap: 1, separator: 0 }
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 20 })).toEqual({
    lines: [[0, 1, 2, 3]],
    isFollowUpLineNew: false,
  })
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 14 })).toEqual({
    lines: [
      [0, 1],
      [2, 3],
    ],
    isFollowUpLineNew: true,
  })
  expect(actionLines([4, 4], [3, 3], { ...spacing, width: 5 })).toEqual({
    lines: [[0], [1], [2], [3]],
    isFollowUpLineNew: true,
  })
  expect(actionLines([6, 6], [1, 1], { ...spacing, width: 10 })).toEqual({
    lines: [[0], [1, 2, 3]],
    isFollowUpLineNew: false,
  })
  expect(actionLines([6, 6], [1, 1], { ...spacing, separator: 1, width: 10 })).toEqual({
    lines: [[0], [1], [2, 3]],
    isFollowUpLineNew: true,
  })
  expect(actionLines([], [3, 3], { ...spacing, width: 5 })).toEqual({ lines: [[0], [1]], isFollowUpLineNew: false })
})

const AT = 1_000_000
const settled = { at: AT, canUndo: false, delivery: null } as const
const placing = (now: number, more: Partial<Placing> = {}): Placing => ({
  shownSince: AT - 1,
  lastTypedMessageAt: null,
  listInput: null,
  now,
  settleWindowMs: SETTLED_MS,
  pressOutSince: null,
  ...more,
})

test('a settled row stays in place for the settle window, then folds, and showing the tab again folds it at once', () => {
  expect(isSettledInPlace(settled, placing(AT + SETTLED_MS - 1))).toBe(true)
  expect(isSettledInPlace(settled, placing(AT + SETTLED_MS))).toBe(false)
  expect(isSettledInPlace(settled, placing(AT + 1, { shownSince: AT + 1 }))).toBe(false)
})

test('a row that comes due while the person keeps using the list waits until they stop, and input that starts after it folded does not bring it back', () => {
  const due = AT + SETTLED_MS
  const run = [due - 600, due - 100, due + 700].reduce<ListInput | null>((input, at) => withListInput(input, at), null)
  expect(isSettledInPlace(settled, placing(due + 1000, { listInput: run }))).toBe(true)
  expect(isSettledInPlace(settled, placing(due + 700 + FOLD_QUIET_MS, { listInput: run }))).toBe(false)
  const later = withListInput(withListInput(null, due - 600), due + FOLD_QUIET_MS)
  expect(isSettledInPlace(settled, placing(due + FOLD_QUIET_MS + 1, { listInput: later }))).toBe(false)
})

test('a row whose message is on its way stays past the settle window, a refused or unconfirmed one folds then, and a message typed after its Undo ended folds a row before the window', () => {
  expect(isSettledInPlace({ ...settled, delivery: 'queued' }, placing(AT + 10 * SETTLED_MS))).toBe(true)
  expect(isSettledInPlace({ ...settled, delivery: 'held' }, placing(AT + SETTLED_MS))).toBe(true)
  expect(isSettledInPlace({ ...settled, delivery: 'unconfirmed' }, placing(AT + SETTLED_MS))).toBe(false)
  const refused = { error: 'blocked', canUndo: false }
  expect(isSettledInPlace({ ...settled, delivery: refused }, placing(AT + SETTLED_MS))).toBe(false)
  expect(isSettledInPlace(settled, placing(AT + 20, { lastTypedMessageAt: AT + 10 }))).toBe(false)
  expect(isSettledInPlace({ ...settled, canUndo: true }, placing(AT + 20, { lastTypedMessageAt: AT + 10 }))).toBe(true)
})

test('the next fold time is a row’s due time, then the end of the person’s use of the list, and none for a row whose message is on its way', () => {
  const due = AT + SETTLED_MS
  expect(nextFoldAt([settled], placing(AT))).toBe(due)
  const run = withListInput(null, due - 100)
  expect(nextFoldAt([settled], placing(due + 50, { listInput: run }))).toBe(due - 100 + FOLD_QUIET_MS)
  expect(nextFoldAt([{ ...settled, delivery: 'queued' }], placing(due + 50))).toBeNull()
  expect(nextFoldAt([{ ...settled, delivery: 'held' }], placing(due + 50, { listInput: run }))).toBeNull()
})

test('a press begun before a row came due keeps it in place until the press ends, and a look that still shows a row’s Undo keeps that row', () => {
  const due = AT + SETTLED_MS
  expect(isSettledInPlace(settled, placing(due + 10 * SETTLED_MS, { pressOutSince: due - 1 }))).toBe(true)
  expect(isSettledInPlace(settled, placing(due + 10 * SETTLED_MS, { pressOutSince: due }))).toBe(true)
  expect(isSettledInPlace(settled, placing(due + 10 * SETTLED_MS, { pressOutSince: null }))).toBe(false)
  expect(isSettledInPlace(settled, placing(due + 1, { undoShown: ['i1'] }), 'i1')).toBe(true)
  expect(isSettledInPlace(settled, placing(due + 1, { undoShown: ['i1'] }), 'i2')).toBe(false)
})

test('a folded row stays folded: a press on another row, a Talk press or list input that begins after it came due does not bring it back', () => {
  const due = AT + SETTLED_MS
  const later = due + 60_000
  expect(isSettledInPlace(settled, placing(later, { pressOutSince: due + 1 }))).toBe(false)
  expect(isSettledInPlace(settled, placing(later, { pressOutSince: later - 100 }))).toBe(false)
  expect(isSettledInPlace(settled, placing(later, { listInput: withListInput(null, later - 100) }))).toBe(false)
  const typedAt = AT + 1000
  const typed = { lastTypedMessageAt: typedAt }
  expect(isSettledInPlace(settled, placing(typedAt + 1, typed))).toBe(false)
  expect(isSettledInPlace(settled, placing(later, { ...typed, pressOutSince: typedAt + 1 }))).toBe(false)
  expect(isSettledInPlace(settled, placing(later, { lastTypedMessageAt: later - 1, pressOutSince: due + 1 }))).toBe(
    false,
  )
})

test('a reply reads with the words the person typed at every step of its way, on one line, and an answer reads as its option', () => {
  const words = 'Go with Redis,\n  it survives restarts.\n\nKeep the  old API.'
  const line = 'Go with Redis, it survives restarts. Keep the old API.'
  expect(deliveryLabel('sending', 'Reply', words)).toBe(`Sending reply: ${line}`)
  expect(deliveryLabel('queued', 'Reply', words)).toBe(`Queued reply: ${line}`)
  expect(deliveryLabel('unconfirmed', 'Reply', words)).toBe(`Reply not confirmed: ${line}`)
  expect(deliveryLabel('arrived', 'Replied', words)).toBe(`Replied: ${line}`)

  expect(deliveryLabel('sending', 'Yes')).toBe('Yes')
  expect(deliveryLabel('queued', 'Yes')).toBe('Queued: Yes')
  expect(deliveryLabel('unconfirmed', 'Yes')).toBe('Not confirmed: Yes')
  expect(deliveryLabel('arrived', 'Yes')).toBe('Yes')

  expect(deliveryLabel('queued', 'Reply')).toBe('Queued: Reply')
  expect(deliveryLabel('arrived', 'Replied')).toBe('Replied')
})

test('a settled row reads its reply’s words with its message’s step, and a refused message with why', () => {
  expect(settledLabel('Replied', 'queued', 'Call it hello')).toBe('Queued reply: Call it hello')
  expect(settledLabel('Replied', 'sending', 'Call it hello')).toBe('Sending reply: Call it hello')
  expect(settledLabel('Replied', null, 'Call it hello')).toBe('Replied: Call it hello')
  expect(settledLabel('Yes', 'held')).toBe('Yes')
  expect(settledLabel('Yes', 'unconfirmed')).toBe('Not confirmed: Yes')
  expect(settledLabel('Yes', { error: 'a hook refused it', canUndo: true })).toBe('Yes · Not sent: a hook refused it')
})
