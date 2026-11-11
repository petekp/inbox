import { expect, test } from 'bun:test'

import { SESSION_LABEL, follow } from '../src/follow'
import type { Where } from '../src/follow'

const claude = { name: 'Claude Code', shell: false }
const zsh = { name: 'zsh', shell: true }

const where = (focused: Where['focused']): Where => ({
  focused,
  panes: [
    { tab: 'tab1', terminal: 't1' },
    { tab: 'tab1', terminal: 't2' },
    { tab: 'tab1', terminal: null },
    { tab: 'tab2', terminal: 't3' },
  ],
  terminals: [
    { address: 't1', labels: {}, program: zsh },
    { address: 't2', labels: { [SESSION_LABEL]: 's2' }, program: claude },
    { address: 't3', labels: { [SESSION_LABEL]: 's3' }, program: claude },
  ],
})

test('the focused terminal in the look’s tab is the one it follows', () => {
  expect(follow(where({ tab: 'tab1', terminal: 't2' }), 'tab1', 't1')).toEqual({
    is: 'session',
    terminal: 't2',
    sessionId: 's2',
  })
})

test('while the look itself or another tab has focus, it keeps the terminal it followed last', () => {
  expect(follow(where({ tab: 'tab1', terminal: null }), 'tab1', 't2')).toMatchObject({ terminal: 't2' })
  expect(follow(where({ tab: 'tab2', terminal: 't3' }), 'tab1', 't2')).toMatchObject({ terminal: 't2' })
})

test('before anything in its tab had focus, it follows the first terminal with a session label', () => {
  expect(follow(where(null), 'tab1', null)).toMatchObject({ is: 'session', terminal: 't2' })
})

test('a terminal with no session label shows no inbox and names its program', () => {
  expect(follow(where({ tab: 'tab1', terminal: 't1' }), 'tab1', null)).toEqual({
    is: 'no-inbox',
    terminal: 't1',
    program: 'zsh',
  })
})

test('a labeled terminal back at its shell reads as an ended session', () => {
  const w = where({ tab: 'tab1', terminal: 't2' })
  const ended = { ...w, terminals: w.terminals.map(t => (t.address === 't2' ? { ...t, program: zsh } : t)) }
  expect(follow(ended, 'tab1', null)).toEqual({ is: 'ended', terminal: 't2' })
})

test('a terminal the look followed that left its tab gives way to one still there', () => {
  expect(follow(where(null), 'tab1', 't3')).toMatchObject({ terminal: 't2' })
})

test('a tab with no terminals follows none', () => {
  expect(follow(where(null), 'tab3', null)).toEqual({ is: 'no-terminal' })
})

test('a session label that is not a safe file name reads as no inbox', () => {
  const unsafe = where({ tab: 'tab1', terminal: 't2' })
  const terminals = unsafe.terminals.map(t => (t.address === 't2' ? { ...t, labels: { [SESSION_LABEL]: '../s2' } } : t))
  expect(follow({ ...unsafe, terminals }, 'tab1', 't1')).toMatchObject({ is: 'no-inbox', terminal: 't2' })
})
