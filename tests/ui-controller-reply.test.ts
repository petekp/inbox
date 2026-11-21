import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { closeItem } from '../hooks/ledger-close'
import { PRESS_TIMEOUT_MS } from '../hooks/session-view'
import { SETTLED_MS } from '../hooks/timing'
import { noticeOf, rowErrorOf } from '../hooks/ui-controller'
import { holdsOf } from '../hooks/ui-controller-reply'
import { DEMO_REPLY_MS, type SettledOutcome } from '../hooks/ui-controller-types'
import type { Session } from '../types'
import {
  kinds,
  openOn,
  question,
  read,
  replyAction,
  send,
  sessionWith,
  T0,
  withItems,
  withLastAction,
} from './ui-controller-helpers'

const S = sessionWith({ items: [question('i1'), question('i2')] })
const reply = (text: string) => ({ action: 'type', id: 'i1', text }) as const
const OK: SettledOutcome = { error: null, note: null, isUnconfirmed: false }
const REFUSED: SettledOutcome = { error: 'The agent is not running.', note: null, isUnconfirmed: false }

function sent(text = 'Use Node') {
  const { ui } = openOn(S)
  const typing = send(ui, S, { type: 'open-field', id: 'i1' }, T0 + 10)
  const drafted = send(typing.ui, S, { type: 'edit-draft', id: 'i1', text }, T0 + 20)

  return { ...send(drafted.ui, S, { type: 'press', press: reply(text), by: 'key' }, T0 + 30), before: drafted.ui }
}

const dismissedByPerson = (s: Session, id: string, at: number): Session => ({
  ...s,
  ledger: closeItem(s.ledger, id, { how: 'dismissed', outcome: 'dismissed' }, at),
})

test('opening a field focuses it with the row’s draft, and asks for a read only when the row was not held', () => {
  const { ui } = openOn(S)
  const first = send(ui, S, { type: 'open-field', id: 'i1' }, T0 + 10)
  expect(first.commands).toEqual([{ kind: 'focus-field', id: 'i1' }, { kind: 'read' }])
  expect(first.ui.typing).toBe('i1')
  const again = send(first.ui, S, { type: 'open-field', id: 'i1' }, T0 + 20)
  expect(again.commands).toEqual([{ kind: 'focus-field', id: 'i1' }])
  const seeded = send(ui, S, { type: 'open-field', id: 'i1', seed: 'Yes, but' }, T0 + 10)
  expect(seeded.ui.drafts.i1?.text).toBe('Yes, but')
})

test('a reply closes its field, keeps its draft and sends the press with the holds it was made under', () => {
  const run = sent()
  expect(run.ui.typing).toBe(null)
  expect(run.ui.drafts.i1?.text).toBe('Use Node')
  expect(run.ui.sentReplies.i1).toEqual({ pressId: 1, text: 'Use Node', atBefore: null, isConfirmed: false })
  const command = run.commands[0]
  expect(command?.kind).toBe('press')
  expect(command?.kind === 'press' && command.holds.replies).toEqual(holdsOf(run.before, T0 + 30).replies)
})

test('closing a blank field without discarding, or picking another row, releases the row and asks for a read', () => {
  const { ui } = openOn(S)
  const typing = send(ui, S, { type: 'open-field', id: 'i1' }, T0 + 10)
  expect(send(typing.ui, S, { type: 'close-field', id: 'i1', isDiscard: false }, T0 + 20).commands).toEqual([
    { kind: 'read' },
  ])
  expect(
    kinds(send(typing.ui, S, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 20).commands),
  ).toContain('read')
  const drafted = send(typing.ui, S, { type: 'edit-draft', id: 'i1', text: 'Maybe' }, T0 + 15)
  expect(send(drafted.ui, S, { type: 'close-field', id: 'i1', isDiscard: false }, T0 + 20).commands).toEqual([])
})

test('a reply with no words, or a repeat of an action still out on its row, sends nothing', () => {
  const { ui } = openOn(S)
  expect(send(ui, S, { type: 'press', press: reply('  '), by: 'key' }, T0 + 10).commands).toEqual([])
  const answer = { action: 'answer', id: 'i2', option: 'Yes' } as const
  const first = send(ui, S, { type: 'press', press: answer, by: 'key' }, T0 + 10)
  expect(send(first.ui, S, { type: 'press', press: answer, by: 'key' }, T0 + 20).commands).toEqual([])
  const run = sent()
  expect(send(run.ui, S, { type: 'press', press: reply('Use Node'), by: 'key' }, T0 + 40).commands).toEqual([])
})

test('a reply with other words goes out while the first is out, and its draft stays until it arrives', () => {
  const run = sent()
  const second = send(run.ui, S, { type: 'press', press: reply('Use Bun'), by: 'key' }, T0 + 40)
  expect(kinds(second.commands)).toEqual(['press'])
  const firstArrived = withLastAction(S, 'i1', replyAction('Use Node', T0 + 45, { state: 'arrived' }))
  expect(read(second.ui, firstArrived, T0 + 50).ui.drafts.i1?.text).toBe('Use Bun')
  const secondArrived = withLastAction(S, 'i1', replyAction('Use Bun', T0 + 55, { state: 'arrived' }))
  expect(read(second.ui, secondArrived, T0 + 60).ui.drafts.i1).toBe(undefined)
})

test('a sent reply’s draft is deleted once the view shows the reply arrived', () => {
  const run = sent()
  const arrived = withLastAction(S, 'i1', replyAction('Use Node', T0 + 35, { state: 'arrived' }))
  const after = read(run.ui, arrived, T0 + 40)
  expect(after.ui.drafts.i1).toBe(undefined)
  expect(after.ui.sentReplies).toEqual({})
})

test('a sent reply’s draft stays while the message is held or queued, and after it failed', () => {
  const run = sent()
  const at = (delivery: Parameters<typeof replyAction>[2]) =>
    read(run.ui, withLastAction(S, 'i1', replyAction('Use Node', T0 + 35, delivery)), T0 + 40).ui
  const held = at({ state: 'held', message: 'Use Node', until: T0 + 60, by: null })
  expect(held.drafts.i1?.text).toBe('Use Node')
  expect(held.sentReplies.i1?.pressId).toBe(1)
  const queued = at({ state: 'queued', message: 'Use Node' })
  expect(queued.drafts.i1?.text).toBe('Use Node')
  expect(queued.sentReplies.i1?.pressId).toBe(1)
  const failed = at({ state: 'failed', reason: 'closed' })
  expect(failed.drafts.i1?.text).toBe('Use Node')
  expect(failed.sentReplies).toEqual({})
})

test('a draft edited after its reply was sent is kept when the reply arrives', () => {
  const run = sent()
  const edited = send(run.ui, S, { type: 'edit-draft', id: 'i1', text: 'Use Node 22' }, T0 + 32)
  const arrived = withLastAction(S, 'i1', replyAction('Use Node', T0 + 35))
  expect(read(edited.ui, arrived, T0 + 40).ui.drafts.i1?.text).toBe('Use Node 22')
})

test('when the row’s last action vanishes, a confirmed reply releases its draft and an unconfirmed one keeps it', () => {
  const run = sent()
  const confirmed = send(run.ui, S, { type: 'press-settled', pressId: 1, outcome: OK }, T0 + 35)
  expect(read(confirmed.ui, S, T0 + 40).ui.drafts.i1).toBe(undefined)
  const unconfirmed = { ...OK, isUnconfirmed: true }
  const kept = send(run.ui, S, { type: 'press-settled', pressId: 1, outcome: unconfirmed }, T0 + 35)
  expect(read(kept.ui, S, T0 + 40).ui.drafts.i1?.text).toBe('Use Node')
})

test('a refused reply shows its error on the row and reopens its field when the person has not moved', () => {
  const run = sent()
  const refused = send(run.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 40)
  expect(rowErrorOf(refused.ui, 'i1', T0 + 40)).toBe(REFUSED.error)
  expect(refused.ui.typing).toBe('i1')
  expect(refused.commands).toEqual([{ kind: 'focus-field', id: 'i1' }])
  expect(refused.ui.sentReplies).toEqual({})
  const moved = send(run.ui, S, { type: 'list-input' }, T0 + 35)
  const late = send(moved.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 40)
  expect(late.ui.typing).toBe(null)
  expect(late.commands).toEqual([])
})

test('a refused reply leaves its field closed once the person pressed something after it, in the same millisecond too', () => {
  const run = sent()
  const answer = { action: 'answer', id: 'i1', option: 'Yes' } as const
  const pressed = send(run.ui, S, { type: 'press', press: answer, by: 'click' }, T0 + 30)
  const refused = send(pressed.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 30)
  expect(refused.ui.typing).toBe(null)
  expect(refused.commands).toEqual([])
  expect(refused.ui.drafts.i1?.text).toBe('Use Node')
})

test('a refused reply reopens its field on its row when only the controller moved the cursor, as when the host saved the row as answered first', () => {
  const run = sent()
  const answered = dismissedByPerson(S, 'i1', T0 + 31)
  const movedOn = read(run.ui, answered, T0 + 35).ui
  expect(movedOn.selection.needsYou.id).toBe('i2')
  const refused = send(movedOn, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 40)
  expect(refused.ui.typing).toBe('i1')
  expect(refused.ui.selection.needsYou.id).toBe('i1')
  expect(refused.ui.drafts.i1?.text).toBe('Use Node')
})

test('a refused goal reopens its field on the Status page when the person has not moved, with no cursor to set', () => {
  const empty = sessionWith({})
  const goal = (text: string) => ({ action: 'type', id: 'goal', text }) as const
  const { ui } = openOn(empty, T0, 'overview')
  const typing = send(ui, empty, { type: 'open-field', id: 'goal' }, T0 + 10)
  const drafted = send(typing.ui, empty, { type: 'edit-draft', id: 'goal', text: 'Ship it' }, T0 + 20)
  const run = send(drafted.ui, empty, { type: 'press', press: goal('Ship it'), by: 'key' }, T0 + 30)
  expect(run.ui.typing).toBe(null)
  const refused = send(run.ui, empty, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 40)
  expect(refused.ui.typing).toBe('goal')
  expect(refused.ui.drafts.goal?.text).toBe('Ship it')
  expect(refused.ui.selection).toEqual(run.ui.selection)
  expect(refused.commands).toEqual([{ kind: 'focus-field', id: 'goal' }])
  const moved = send(run.ui, empty, { type: 'show-tab', tab: 'needsYou' }, T0 + 35)
  expect(send(moved.ui, empty, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 40).ui.typing).toBe(null)
})

test('a press whose row is gone reports its error or stale note under the tabs instead of on the row', () => {
  const { ui } = openOn(S)
  const pressed = send(ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 10)
  const gone = withItems(S, [question('i1')])
  const refused = send(pressed.ui, gone, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 20)
  expect(noticeOf(refused.ui, T0 + 20)).toEqual({ text: REFUSED.error, at: T0 + 20, isError: true })
  const stale = send(pressed.ui, S, { type: 'press-settled', pressId: 1, outcome: { ...OK, note: 'stale' } }, T0 + 20)
  expect(stale.ui.notes.i2).toEqual({ note: 'stale', at: T0 + 20 })
})

test('a new press on a row clears the error and stale note of its last press', () => {
  const { ui } = openOn(S)
  const first = send(ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 10)
  const refused = send(first.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 20)
  const stale = send(first.ui, S, { type: 'press-settled', pressId: 1, outcome: { ...OK, note: 'stale' } }, T0 + 20)
  expect(rowErrorOf(refused.ui, 'i2', T0 + 30)).toBe(REFUSED.error)
  const again = send(
    refused.ui,
    S,
    { type: 'press', press: { action: 'answer', id: 'i2', option: 'Yes' }, by: 'key' },
    T0 + 30,
  )
  expect(rowErrorOf(again.ui, 'i2', T0 + 30)).toBe(null)
  expect(stale.ui.notes.i2).toBeDefined()
  const noted = send(stale.ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 30)
  expect(noted.ui.notes.i2).toBe(undefined)
})

test('a press with no answer gives up after PRESS_TIMEOUT_MS unless its message is held or queued', () => {
  const { ui } = openOn(S)
  const pressed = send(ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 10)
  expect(pressed.nextWakeAt).toBe(T0 + 10 + PRESS_TIMEOUT_MS)
  expect(read(pressed.ui, S, T0 + 10 + PRESS_TIMEOUT_MS).ui.pressesOut).toEqual({})
  const queued = withLastAction(S, 'i2', {
    ...replyAction('', T0 + 12, { state: 'queued', message: 'x' }),
    action: 'explain',
  })
  expect(Object.keys(read(pressed.ui, queued, T0 + 10 + PRESS_TIMEOUT_MS).ui.pressesOut)).toEqual(['1'])
  const held = withLastAction(S, 'i2', {
    ...replyAction('', T0 + 12, { state: 'held', message: 'x', until: T0 + 2 * PRESS_TIMEOUT_MS, by: null }),
    action: 'explain',
  })
  expect(Object.keys(read(pressed.ui, held, T0 + 10 + PRESS_TIMEOUT_MS).ui.pressesOut)).toEqual(['1'])
})

test('discarding a field deletes the draft and its sent reply, and keeps the row closed until the next open', () => {
  const run = sent()
  const reopened = send(run.ui, S, { type: 'open-field', id: 'i1' }, T0 + 40)
  const discarded = send(reopened.ui, S, { type: 'close-field', id: 'i1', isDiscard: true }, T0 + 50)
  expect(discarded.ui.drafts).toEqual({})
  expect(discarded.ui.sentReplies).toEqual({})
  expect(discarded.ui.discarded.i1).toBe(T0 + 50)
  expect(discarded.commands).toEqual([{ kind: 'read' }])
})

test('a confirmed Undo selects the row it brought back once a tab lists it, guarded against a second click when Undo was clicked', () => {
  const closed = dismissedByPerson(S, 'i2', T0 + 5)
  const { ui } = openOn(closed)
  const undone = (by: 'click' | 'key') => {
    const pressed = send(ui, closed, { type: 'press', press: { action: 'undo', id: 'i2' }, by }, T0 + 10)
    expect(pressed.commands[0]).toMatchObject({ kind: 'press', holds: { undoOut: [] } })
    const settled = send(pressed.ui, closed, { type: 'press-settled', pressId: 1, outcome: OK }, T0 + 20)
    expect(settled.ui.restoring).toEqual({ id: 'i2', at: T0 + 20, by })
    return read(settled.ui, S, T0 + 30)
  }
  const back = undone('key')
  expect(back.ui.selection.needsYou).toMatchObject({ id: 'i2', guard: null })
  expect(back.ui.restoring).toBe(null)
  expect(back.commands).toContainEqual({ kind: 'reveal', tab: 'needsYou', id: 'i2', closedId: null })
  expect(undone('click').ui.selection.needsYou.guard).toEqual({ by: 'click', at: T0 + 30 })
})

test('a refused Undo whose row’s Undo time ended while it was out reports under the tabs, since its row folds', () => {
  const closed = dismissedByPerson(S, 'i2', T0 + 5)
  const { ui } = openOn(closed)
  const pressed = send(ui, closed, { type: 'press', press: { action: 'undo', id: 'i2' }, by: 'key' }, T0 + 10)
  const inTime = send(pressed.ui, closed, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 20)
  expect(rowErrorOf(inTime.ui, 'i2', T0 + 20)).toBe(REFUSED.error)
  const late = T0 + 5 + SETTLED_MS
  const ended = send(pressed.ui, closed, { type: 'press-settled', pressId: 1, outcome: REFUSED }, late)
  expect(rowErrorOf(ended.ui, 'i2', late)).toBe(null)
  expect(noticeOf(ended.ui, late)).toEqual({ text: REFUSED.error, at: late, isError: true })
})

test('a confirmed Undo whose answer lands after the read that lists its row selects the row at once', () => {
  const closed = dismissedByPerson(S, 'i2', T0 + 5)
  const { ui } = openOn(closed)
  const pressed = send(ui, closed, { type: 'press', press: { action: 'undo', id: 'i2' }, by: 'key' }, T0 + 10)
  const listed = read(pressed.ui, S, T0 + 15)
  const settled = send(listed.ui, S, { type: 'press-settled', pressId: 1, outcome: OK }, T0 + 20)
  expect(settled.ui.selection.needsYou.id).toBe('i2')
  expect(settled.ui.restoring).toBe(null)
  expect(settled.commands).toContainEqual({ kind: 'reveal', tab: 'needsYou', id: 'i2', closedId: null })
})

test('a close the person pressed moves the cursor at once when the read that shows it comes while the press is out', () => {
  const { ui } = openOn(S)
  const pressed = send(ui, S, { type: 'press', press: { action: 'dismiss', id: 'i1' }, by: 'key' }, T0 + 10)
  const shown = read(pressed.ui, dismissedByPerson(S, 'i1', T0 + 11), T0 + 12)
  expect(shown.ui.selection.needsYou.id).toBe('i2')
  expect(shown.ui.heldClose).toEqual({})
})

test('the undo key presses Undo on the shown tab’s row that closed last', () => {
  const closed = dismissedByPerson(dismissedByPerson(S, 'i1', T0 + 5), 'i2', T0 + 6)
  const { ui } = openOn(closed)
  const run = send(ui, closed, { type: 'undo-key' }, T0 + 10)
  expect(run.commands[0]).toMatchObject({ kind: 'press', press: { action: 'undo', id: 'i2' } })
  const findings = send(ui, closed, { type: 'show-tab', tab: 'findings' }, T0 + 10)
  expect(send(findings.ui, closed, { type: 'undo-key' }, T0 + 10).commands).toEqual([])
})

test('the demo’s reply is sent DEMO_REPLY_MS after its press settles', () => {
  const { ui } = openOn(S)
  const pressed = send(ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 10)
  const settled = send(
    pressed.ui,
    S,
    { type: 'press-settled', pressId: 1, outcome: { ...OK, isDemoSent: true } },
    T0 + 20,
  )
  expect(settled.nextWakeAt).toBe(T0 + 20 + DEMO_REPLY_MS)
  expect(kinds(send(settled.ui, S, { type: 'tick' }, T0 + 19 + DEMO_REPLY_MS).commands)).toEqual([])
  const due = send(settled.ui, S, { type: 'tick' }, T0 + 20 + DEMO_REPLY_MS)
  expect(due.commands).toEqual([{ kind: 'demo-reply', pressId: 1 }])
  expect(due.ui.demoReplies).toEqual([])
  const lateRead = read(settled.ui, S, T0 + 500 + DEMO_REPLY_MS)
  expect(lateRead.commands).toContainEqual({ kind: 'demo-reply', pressId: 1 })
})
