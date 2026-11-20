import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { NEW_FADE_MS, NEW_HOLD_MS, NEW_STEPS } from '../hooks/arrivals'
import { closeItem } from '../hooks/ledger-close'
import { RUNNING_FRAME_MS, SETTLED_MS } from '../hooks/timing'
import { keptUiStates, noticeOf, restoredUi, rowErrorOf } from '../hooks/ui-controller'
import { readWakeAt } from '../hooks/ui-controller-clock'
import { holdsOf } from '../hooks/ui-controller-reply'
import { freshUi, MAX_KEPT_UI, type UiState } from '../hooks/ui-controller-types'
import type { Session } from '../types'
import { FOLD_QUIET_MS } from '../hooks/timing'
import {
  closedByAgent,
  finding,
  LOOK,
  openOn,
  question,
  read,
  send,
  sessionWith,
  T0,
  viewOf,
  withFindings,
} from './ui-controller-helpers'

const S = sessionWith({ items: [question('i1'), question('i2')], findings: [finding('f1')] })
const REFUSED = { error: 'Not sent.', note: null, isUnconfirmed: false }
const dismissed = (s: Session, id: string, at: number): Session => ({
  ...s,
  ledger: closeItem(s.ledger, id, { how: 'dismissed', outcome: 'dismissed' }, at),
})

test('a look with nothing timed wants no wake', () => {
  expect(openOn(S).nextWakeAt).toBe(null)
})

test('a look that draws running marks as frames wakes on each frame while a mark runs, and a pulsing look does not', () => {
  const frames = openOn(S, T0, 'needsYou', { ...LOOK, runningMarks: 'frames' })
  const helped = send(frames.ui, S, { type: 'show-help', isShown: true }, T0 + 1)
  expect(helped.nextWakeAt).toBe((Math.floor((T0 + 1) / RUNNING_FRAME_MS) + 1) * RUNNING_FRAME_MS)
  const pulse = send(openOn(S).ui, S, { type: 'show-help', isShown: true }, T0 + 1)
  expect(pulse.nextWakeAt).toBe(null)
  const closed = send(helped.ui, S, { type: 'closed' }, T0 + 2)
  expect(closed.nextWakeAt).toBe(null)
})

test('a running-mark frame wakes the look without a read, and work that needs the view wakes both', () => {
  const frames = openOn(S, T0, 'needsYou', { ...LOOK, runningMarks: 'frames' })
  const helped = send(frames.ui, S, { type: 'show-help', isShown: true }, T0 + 1)
  expect(helped.nextWakeAt).not.toBe(null)
  expect(readWakeAt(helped.ui, viewOf(S, helped.ui, T0 + 1), T0 + 1)).toBe(null)
  const refused = send(
    openOn(S).ui,
    S,
    { type: 'press', press: { action: 'answer', id: 'i1', option: 'Yes' }, by: 'key' },
    T0,
  )
  const settled = send(refused.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 5)
  expect(readWakeAt(settled.ui, viewOf(S, settled.ui, T0 + 5), T0 + 5)).toBe(T0 + 5 + SETTLED_MS)
})

test('a new row’s title tint wakes a stepped look at each step and the end of its fade, and an end look only at the end', () => {
  const base = sessionWith({ findings: [finding('f1')] })
  const grown = withFindings(base, [finding('f1'), finding('f2')])
  const run = (titleTint: UiState['config']['titleTint']) => {
    const { ui } = openOn(base, T0, 'findings', { ...LOOK, titleTint })
    return read(ui, grown, T0 + 10).nextWakeAt
  }
  expect(run('steps')).toBe(T0 + 10 + NEW_HOLD_MS)
  expect(run('end')).toBe(T0 + 10 + NEW_HOLD_MS + NEW_FADE_MS)
  expect(run('self')).toBe(null)
  const { ui } = openOn(base, T0, 'findings', { ...LOOK, titleTint: 'steps' })
  const midFade = T0 + 10 + NEW_HOLD_MS + 1
  const shown = read(ui, grown, T0 + 10)
  expect(send(shown.ui, grown, { type: 'tick' }, midFade).nextWakeAt).toBe(
    T0 + 10 + NEW_HOLD_MS + NEW_FADE_MS / NEW_STEPS,
  )
})

test('a row’s error shows for SETTLED_MS, wakes the look when it ends, and a tick then drops it', () => {
  const { ui } = openOn(S)
  const pressed = send(ui, S, { type: 'press', press: { action: 'explain', id: 'i1' }, by: 'key' }, T0 + 10)
  const refused = send(pressed.ui, S, { type: 'press-settled', pressId: 1, outcome: REFUSED }, T0 + 20)
  expect(refused.nextWakeAt).toBe(T0 + 20 + SETTLED_MS)
  expect(rowErrorOf(refused.ui, 'i1', T0 + 19 + SETTLED_MS)).toBe('Not sent.')
  expect(rowErrorOf(refused.ui, 'i1', T0 + 20 + SETTLED_MS)).toBe(null)
  const ended = send(refused.ui, S, { type: 'tick' }, T0 + 20 + SETTLED_MS)
  expect(ended.ui.errors).toEqual({})
  expect(noticeOf(ended.ui, T0 + 20 + SETTLED_MS)).toBe(null)
})

test('Undo timed from the first read starts when the look first draws the closed row, and the host is told which rows it keeps', () => {
  const closed = dismissed(S, 'i1', T0)
  const late = T0 + SETTLED_MS / 2
  const firstOpen = openOn(S, T0 - 100, 'needsYou', { ...LOOK, undoClock: 'first-read' })
  const firstRead = read(firstOpen.ui, closed, late)
  expect(firstRead.ui.undoSeen).toEqual({ i1: late })
  expect(read(firstRead.ui, closed, late + 10).ui.undoSeen).toEqual({ i1: late })
  expect(holdsOf(firstRead.ui, late + SETTLED_MS - 1).undoShown).toEqual(['i1'])
  expect(holdsOf(firstRead.ui, late + SETTLED_MS).undoShown).toEqual([])
  const key = send(firstRead.ui, closed, { type: 'undo-key' }, late + 10)
  expect(key.commands[0]).toMatchObject({ kind: 'press', press: { action: 'undo', id: 'i1' } })
  const sessionLook = read(openOn(S, T0 - 100).ui, closed, late)
  expect(sessionLook.ui.undoSeen).toEqual({})
  expect(holdsOf(sessionLook.ui, late).undoShown).toBe(undefined)
})

test('a restored look keeps drafts, folds and cursors, and drops presses, timers and held moves', () => {
  const { ui } = openOn(S)
  const drafted = send(ui, S, { type: 'edit-draft', id: 'i1', text: 'Maybe' }, T0 + 10)
  const pressed = send(drafted.ui, S, { type: 'press', press: { action: 'explain', id: 'i2' }, by: 'key' }, T0 + 20)
  const settled = send(
    pressed.ui,
    S,
    { type: 'press-settled', pressId: 1, outcome: { ...REFUSED, isDemoSent: true } },
    T0 + 25,
  )
  const pending = send(settled.ui, S, { type: 'press', press: { action: 'explain', id: 'i1' }, by: 'key' }, T0 + 30)
  const restored = restoredUi(pending.ui)
  expect(restored.pressesOut).toEqual({})
  expect(restored.demoReplies).toEqual([])
  expect(restored.drafts.i1?.text).toBe('Maybe')
  expect(restored.errors.i2?.text).toBe('Not sent.')
  expect(restored.nextPressId).toBe(3)
})

test('a restored look keeps its cursors and folds, and drops the closes and arrivals it held while the list was in use', () => {
  const { ui } = openOn(S)
  const picked = send(ui, S, { type: 'select', tab: 'needsYou', id: 'i2', by: 'key' }, T0 + 10)
  const folded = send(picked.ui, S, { type: 'fold', fold: 'question', isOpen: true }, T0 + 11)
  const closed = closedByAgent(S, 'i2', T0 + 20)
  const restored = restoredUi(read(folded.ui, closed, T0 + 20).ui)
  expect(restored.selection.needsYou.id).toBe('i2')
  expect(restored.unfolded).toEqual(folded.ui.unfolded)
  const quiet = T0 + 11 + FOLD_QUIET_MS
  expect(send(restored, closed, { type: 'tick' }, quiet).ui.selection.needsYou.id).toBe('i2')
  const empty = sessionWith({})
  const start = openOn(empty, T0, 'findings')
  const used = send(start.ui, empty, { type: 'list-input' }, T0 + 10)
  const arrived = sessionWith({ items: [question('i1')] })
  const held = restoredUi(read(used.ui, arrived, T0 + 20).ui)
  expect(send(held, arrived, { type: 'tick' }, T0 + 10 + FOLD_QUIET_MS).ui.tab).toBe('findings')
})

test('a host keeps the shown session’s state and the most recently shown others that hold a draft or a sent reply', () => {
  const plain = freshUi(LOOK)
  const drafted = { ...plain, drafts: { i1: { text: 'x', since: 1 } } }
  const blank = { ...plain, drafts: { i1: { text: '  ', since: 1 } } }
  const states = Object.fromEntries(
    Array.from({ length: MAX_KEPT_UI + 2 }, (_, k) => [`s${k}`, { ui: drafted, shownAt: k }]),
  )
  const kept = keptUiStates(
    {
      ...states,
      shown: { ui: plain, shownAt: 0 },
      idle: { ui: plain, shownAt: 99 },
      blank: { ui: blank, shownAt: 98 },
    },
    'shown',
  )
  expect(Object.keys(kept)).toHaveLength(MAX_KEPT_UI + 1)
  expect(kept.shown?.ui).toBe(plain)
  expect(kept.idle).toBe(undefined)
  expect(kept.blank).toBe(undefined)
  expect(kept.s0).toBe(undefined)
  expect(kept[`s${MAX_KEPT_UI + 1}`]?.shownAt).toBe(MAX_KEPT_UI + 1)
})
