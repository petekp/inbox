import { expect, mock, test } from 'claude-code/testing'
import { isSubjectSeen, LOOK_MIN_MS } from '../hooks/status-children'
import type { SessionStatus } from '../types'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('on a next build, a look at the Status in the desktop pane counts every subject as seen, since the pane cannot say what it scrolled to', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  let seen: { lastLookAt: number | null; missedInLastLook: Record<string, number | null> } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    seen = (e.value as { ledger: { overview: typeof seen } }).ledger.overview
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  w.statusReply = Array.from({ length: 40 }, (_, n) => `NEW: working | Piece ${n + 1} | under way`).join('\n')
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Started.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, scroll: { offset: 0, bodyRows: 6 } },
  })

  await pane.post({ tab: 'overview' }, { in: 'tabs' })
  await clock.settle()
  await clock.advance(LOOK_MIN_MS)
  await pane.post({ tab: 'needsYou' }, { in: 'tabs' })
  await clock.settle()

  expect(seen).toMatchObject({ lastLookAt: 1_000_000 + LOOK_MIN_MS, missedInLastLook: {} })
})

test('on a next build, a look at the terminal Status counts as seen only the subjects whose first line was in the pane’s window, at any of its scrolls', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  let seen: unknown = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    seen = (e.value as { ledger: { overview: unknown } }).ledger.overview
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.statusReply = Array.from({ length: 40 }, (_, n) => `NEW: working | Piece ${n + 1} | under way`).join('\n')
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Started.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const mountAt = (offset: number) =>
    $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset, bodyRows: 12 } } })
  const top = await mountAt(0)
  await top.press({ key: 'tab-key-overview' })
  await clock.settle()
  await top.unmount()
  const scrolled = await mountAt(30)
  await clock.advance(LOOK_MIN_MS)
  await scrolled.press({ key: 'tab-key-needsYou' })
  await clock.settle()

  const o = seen as unknown as SessionStatus
  const inWindow = [0, 1, 8, 9, 10, 11].map(n => o.subjects[n]!.id)
  expect(o.lastLookAt).toBe(1_000_000 + LOOK_MIN_MS)
  expect(o.subjects.filter(x => isSubjectSeen(o, x)).map(x => x.id)).toEqual(inWindow)
})
