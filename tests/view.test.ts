import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { actionLines, answersFitLine, drawnLists, rowKeyPlan, steppedIndex, tabUndos } from '../core/view/action-plan'
import { demoSession } from '../core/view/demo'
import { emptySession } from '../core/view/session-files'
import { sessionView } from '../core/view/session-view'
import { footerError, inboxView, perTurnStatus } from '../core/view/view'
import { deliveryLabel, settledLabel } from '../core/view/rows'
import type { RowView } from '../core/view/rows'
import { cellWidth } from '../core/domain/text'
import { FOLD_QUIET_MS, SETTLED_MS, isSettledInPlace, nextFoldAt, withListInput } from '../core/view/timing'
import type { ListInput, Placing } from '../core/view/timing'
import type { Item } from '../types'

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

const dismissedAt = (at: number, now: number, undoOut: string[]) => {
  const s = demoSession(now, 'Claude')
  const closed = s.ledger.closed.map(c =>
    c.id === 'd8'
      ? {
          ...c,
          at,
          how: 'dismissed' as const,
          outcome: 'dismissed',
          item: { ...s.ledger.items[0]!, id: c.id, ask: c.ask },
        }
      : c,
  )
  const holds = {
    replies: {},
    discarded: {},
    shownSince: at - 1000,
    listInput: { since: at, last: now - 100 },
    undoOut,
  }

  return sessionView({ ...s, ledger: { ...s.ledger, closed } }, now, SETTLED_MS, holds)
}
const undoActionOf = (view: ReturnType<typeof sessionView>) =>
  [...view.needsYou.questions, ...view.needsYou.tasks]
    .find(r => r.id === 'd8')
    ?.actions.find(a => a.press.action === 'undo')

test('a settled row keeps its Undo, drawn out, after Undo ends while its Undo press is out, and loses it when the press ends', () => {
  const at = AT
  expect(undoActionOf(dismissedAt(at, at + 500, []))).toMatchObject({ isOut: false })
  const ended = at + SETTLED_MS + 500
  expect(undoActionOf(dismissedAt(at, ended, []))).toBeUndefined()
  expect(undoActionOf(dismissedAt(at, ended, ['d8']))).toMatchObject({ isOut: true })
  expect(undoActionOf(dismissedAt(at, ended, []))).toBeUndefined()
})

test('the Undo the u key presses is the plan’s, so it follows a kept Undo', () => {
  const view = dismissedAt(AT, AT + SETTLED_MS + 500, ['d8'])
  const lists = drawnLists(
    view,
    () => true,
    r => r,
  )
  expect(tabUndos('needsYou', lists, [])).toEqual([{ press: { action: 'undo', id: 'd8' }, at: AT }])
})

test('in every kind of open row, a primary action is the first action, and a task has none since its steps are shortcuts in no order', async () => {
  const view = sessionView(demoSession(AT, 'Claude'), AT, SETTLED_MS)
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const kinds = new Set(rows.map(r => r.type))
  expect([...kinds].sort()).toEqual(['finding', 'question', 'task'])
  for (const row of rows) {
    const primaries = row.actions.filter(a => a.emphasis === 'primary')
    expect(primaries.length <= 1).toBe(true)
    if (primaries.length === 1) expect(row.actions[0]).toBe(primaries[0])
    if (row.type === 'task') expect(primaries).toEqual([])
  }
  expect(rows.some(r => r.actions.some(a => a.emphasis === 'primary'))).toBe(true)
  expect(view.needsYou.tasks.some(r => r.actions.some(a => a.press.action === 'step'))).toBe(true)
})

test('a question offers its answers side by side only when two or more show and none has a note of its own, and they fit only when their widths and gaps fit the room, a wide character taking two cells', () => {
  const view = sessionView(demoSession(AT, 'Claude'), AT, SETTLED_MS)
  const question = (start: string) => view.needsYou.questions.find(r => r.title.startsWith(start))!
  const short = question('Bring a dismissed glance back')
  const described = question('Dismiss a glance with a pinch')
  const firstAnswer = short.actions.find(a => a.press.action === 'answer')
  const oneShown: RowView = {
    ...short,
    actions: short.actions.filter(a => a.press.action !== 'answer' || a === firstAnswer),
  }
  expect(rowKeyPlan(short, true).answerRow).not.toBeNull()
  expect(rowKeyPlan(described, true).answerRow).toBeNull()
  expect(rowKeyPlan(oneShown, true).answerRow).toBeNull()

  expect(answersFitLine([10, 8], 2, 20)).toBe(true)
  expect(answersFitLine([10, 8], 2, 19)).toBe(false)
  const wide = ['检查一下', '以后再说'].map(cellWidth)
  expect(wide).toEqual([8, 8])
  expect(answersFitLine(wide, 2, 18)).toBe(true)
  expect(answersFitLine(wide, 2, 17)).toBe(false)
})

const ask = (id: string, turn: number, kind: Item['kind'] = 'question'): Item => ({
  id,
  kind,
  label: null,
  ask: `Ask ${id}`,
  options: [],
  rec: null,
  helps: [],
  turn,
  at: turn,
  from: 'record',
})

test('the inbox view lists questions and tasks newest reply first, and counts each open one as waiting', () => {
  const s = emptySession()
  const v = inboxView({
    ledger: { ...s.ledger, items: [ask('q1', 1), ask('t1', 2, 'task'), ask('q2', 3)] },
    lastActions: {},
    notes: {},
    turns: s.presence,
    extraSteps: {},
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus('none'),
    now: 10,
    replies: {},
    discarded: {},
    shownSince: null,
    lastTypedMessageAt: null,
    listInput: null,
  })
  expect(v.needsYou.questions.map(r => r.id)).toEqual(['q2', 'q1'])
  expect(v.needsYou.tasks.map(r => r.id)).toEqual(['t1'])
  expect(v.needsYou.count).toBe(3)
  expect(v.findings.count).toBe(0)
})

test('the footer shows a failed update on every tab but PRs, and on Status puts the page’s error first, then the update’s, then a stale note', () => {
  const failed = perTurnStatus('waiting')
  expect(typeof failed.error).toBe('string')
  expect(perTurnStatus('retrying')).toEqual({ isRetrying: true, error: null })
  expect(footerError('prs', failed, null)).toBe(null)
  expect(footerError('needsYou', failed, { error: 'page', stale: 'old' })).toBe(failed.error)
  expect(footerError('overview', failed, { error: 'page', stale: 'old' })).toBe('page')
  expect(footerError('overview', failed, { error: null, stale: 'old' })).toBe(failed.error)
  expect(footerError('overview', perTurnStatus('none'), { error: null, stale: 'old' })).toBe('old')
})

test('stepping through a list wraps past either end, and with nothing selected starts from the end it steps toward', () => {
  expect(steppedIndex(2, 1, 3)).toBe(0)
  expect(steppedIndex(0, -1, 3)).toBe(2)
  expect(steppedIndex(-1, 1, 3)).toBe(0)
  expect(steppedIndex(-1, -1, 3)).toBe(2)
  expect(steppedIndex(-1, 1, 0)).toBe(-1)
})
