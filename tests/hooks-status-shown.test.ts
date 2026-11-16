import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LOOK_MIN_MS } from '../hooks/status-children'
import type { Session, SessionStatus } from '../types'
import { w, world } from './hooks-world'
import { PANE, seedTasks } from './hooks-helpers'

const taskLook = async ($: Engine, on: On, surface: 'desktop' | 'terminal', bodyRows: number) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  let saved: Session | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    saved = e.value as Session
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
  w.statusReply = 'HEAD: Project | Building it'
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } })
  await seedTasks(
    $,
    Array.from({ length: 40 }, (_, n) => ({
      id: `s${n + 1}`,
      title: `Piece ${n + 1}`,
      status: 'working' as const,
      detail: 'under way',
    })),
  )
  await $.turn.complete({ answer: 'Started.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount({
    ...PANE,
    surface,
    props: { ...PANE.props, scroll: { offset: 0, bodyRows } },
  })
  if (surface === 'desktop') await pane.post({ tab: 'overview' }, { in: 'tabs' })
  else await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  await clock.advance(LOOK_MIN_MS)
  if (surface === 'desktop') await pane.post({ tab: 'needsYou' }, { in: 'tabs' })
  else await pane.press({ key: 'tab-key-needsYou' })
  await clock.settle()

  const overview = saved!.ledger.overview as SessionStatus
  return {
    lastLookAt: overview.lastLookAt,
    seen: saved!.taskTree.filter(task => !(task.id in overview.missedInLastLook)).map(task => task.id),
    ids: saved!.taskTree.map(task => task.id),
  }
}

test('a desktop Status look marks only task rows whose first line appeared in the pane', async ($, on) => {
  const look = await taskLook($, on, 'desktop', 12)

  expect(look.lastLookAt).toBe(1_000_000 + LOOK_MIN_MS)
  expect(look.seen).toEqual(look.ids.slice(0, 1))
})

test('a desktop Status look marks every task row when they all fit in the pane', async ($, on) => {
  const look = await taskLook($, on, 'desktop', 400)

  expect(look.seen).toEqual(look.ids)
})

test('a terminal Status look counts rows shown before and after scrolling', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  let saved: Session | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    saved = e.value as Session
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.statusReply = 'HEAD: Project | Building it'
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } })
  await seedTasks(
    $,
    Array.from({ length: 40 }, (_, n) => ({
      id: `s${n + 1}`,
      title: `Piece ${n + 1}`,
      status: 'working' as const,
      detail: 'under way',
    })),
  )
  await $.turn.complete({ answer: 'Started.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const mountAt = (offset: number, bodyRows = 12) =>
    $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset, bodyRows } } })
  const top = await mountAt(0, 24)
  await top.press({ key: 'tab-overview' })
  await clock.settle()
  await clock.advance(LOOK_MIN_MS)
  expect(await top.find({ key: 'status-s1' })).toBeDefined()
  await top.press({ key: 'tab-needsYou' })
  await clock.settle()
  expect(saved!.ledger.overview?.lastLookAt).toBe(1_000_000 + LOOK_MIN_MS)
  await top.unmount()
  const scrolled = await mountAt(30)
  await scrolled.press({ key: 'tab-overview' })
  await clock.settle()
  await clock.advance(LOOK_MIN_MS)
  await scrolled.press({ key: 'tab-needsYou' })
  await clock.settle()

  const overview = saved!.ledger.overview as SessionStatus
  const seen = saved!.taskTree.filter(task => !(task.id in overview.missedInLastLook)).map(task => task.id)
  expect(overview.lastLookAt).toBe(1_000_000 + 2 * LOOK_MIN_MS)
  for (const id of ['s1', 's10', 's11', 's12', 's13', 's14', 's15']) expect(seen).toContain(id)
})
