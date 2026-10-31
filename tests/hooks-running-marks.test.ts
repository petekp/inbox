import { expect, mock, test } from 'claude-code/testing'
import { RUNNING_FRAME_MS, runningMark } from '../hooks/timing'
import { IDLE_MARK, RUNNING_FRAMES } from '../hooks/help'
import { w, arrive, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('an answer on its way runs its mark each frame in the terminal and as an Svg on desktop, and shows ✓ once it arrives', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await clock.settle()
  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'answer-i1-0' }))
  await clock.settle()
  const markOf = async () =>
    [...((await pane.find({ key: 'settled-i1' }))?.text ?? '')].filter(c => RUNNING_FRAMES.some(f => f === c)).join('')
  const drawn: string[] = []
  const moving: string[] = []
  for (let n = 0; n < RUNNING_FRAMES.length; n++) {
    drawn.push(await markOf())
    moving.push(runningMark(clock.now()))
    await clock.advance(RUNNING_FRAME_MS)
  }
  expect(new Set(moving).size).toBeGreaterThan(1)
  expect(drawn).toEqual(moving)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  expect((await desktop.find({ key: 'settled-i1-mark' }))?.text ?? null).not.toBeNull()

  await arrive($)
  await clock.settle()
  expect(await markOf()).toBe('')
  expect((await pane.find({ key: 'settled-i1' }))?.text).toMatch(/✓\s*Node/)
})

test('a working subject’s mark on the Status moves each frame only while a turn runs, and a queued subject’s never does', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply = [
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
    'NEW: working | Help text | being written',
    'NEW: queued | Loud flag | after the help text',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  const markOf = async (key: string) =>
    [...((await pane.find({ key }))?.text ?? '')].filter(c => [...RUNNING_FRAMES, IDLE_MARK.mark].includes(c)).join('')
  const frames = async () => {
    const working: string[] = []
    const queued: string[] = []
    const moving: string[] = []
    for (let n = 0; n < RUNNING_FRAMES.length; n++) {
      working.push(await markOf('status-s1'))
      queued.push(await markOf('status-s2'))
      moving.push(runningMark(clock.now()))
      await clock.advance(RUNNING_FRAME_MS)
    }
    expect(new Set(moving).size).toBeGreaterThan(1)

    return { working, queued, moving, still: moving.map(() => IDLE_MARK.mark) }
  }

  const idle = await frames()
  expect(idle.working).toEqual(idle.still)
  expect(idle.queued).toEqual(idle.moving.map(() => ''))

  await $.turn.start({ text: 'go on', turnId: 't2' })
  await clock.settle()
  const running = await frames()
  expect(running.working).toEqual(running.moving)
  expect(running.queued).toEqual(running.moving.map(() => ''))

  await $.turn.complete({
    answer: 'Help text written.',
    durationMs: 5,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
  })
  await clock.settle()
  const ended = await frames()
  expect(ended.working).toEqual(ended.still)
})

test('a running mark on the terminal Status keeps moving while the desktop app draws the same pane, and no frame redraws the desktop pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Help text | being written'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await $.turn.start({ text: 'go on', turnId: 't2' })
  await clock.settle()
  const markOf = async () =>
    [...((await pane.find({ key: 'status-s1' }))?.text ?? '')].filter(c => RUNNING_FRAMES.some(f => f === c)).join('')
  const frames = async () => {
    const drawn: string[] = []
    const moving: string[] = []
    for (let n = 0; n < RUNNING_FRAMES.length; n++) {
      drawn.push(await markOf())
      moving.push(runningMark(clock.now()))
      await clock.advance(RUNNING_FRAME_MS)
    }
    expect(new Set(moving).size).toBeGreaterThan(1)

    return { drawn, moving }
  }
  const alone = await frames()
  expect(alone.drawn).toEqual(alone.moving)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  const desktopFrames: string[] = []
  for (let n = 0; n < RUNNING_FRAMES.length; n++) {
    desktopFrames.push(JSON.stringify(await desktop.drawn()))
    await clock.advance(RUNNING_FRAME_MS)
  }
  expect(desktopFrames[0]).toContain('<animate')
  expect(new Set(desktopFrames).size).toBe(1)
  const beside = await frames()
  expect(beside.drawn).toEqual(beside.moving)
})

test('a running mark moves again at the next redraw after the engine ends its timer', async ($, on) => {
  let isPeriodRefused = false
  on('clock.every', { ms: RUNNING_FRAME_MS }, (_$, e, next) => (isPeriodRefused ? { deny: 'refused' } : next(e)))
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Help text | being written'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await $.turn.start({ text: 'go on', turnId: 't2' })
  await clock.settle()
  const markOf = async () =>
    [...((await pane.find({ key: 'status-s1' }))?.text ?? '')].filter(c => RUNNING_FRAMES.some(f => f === c)).join('')
  const frames = async () => {
    const drawn: string[] = []
    const moving: string[] = []
    for (let n = 0; n < RUNNING_FRAMES.length; n++) {
      drawn.push(await markOf())
      moving.push(runningMark(clock.now()))
      await clock.advance(RUNNING_FRAME_MS)
    }
    expect(new Set(moving).size).toBeGreaterThan(1)

    return { drawn, moving }
  }
  const before = await frames()
  expect(before.drawn).toEqual(before.moving)

  isPeriodRefused = true
  await clock.advance(RUNNING_FRAME_MS)
  isPeriodRefused = false
  const ended = await frames()
  expect(new Set(ended.drawn).size).toBe(1)

  await pane.redraw()
  const after = await frames()
  expect(after.drawn).toEqual(after.moving)
})
