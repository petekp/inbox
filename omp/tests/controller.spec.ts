import { expect, test } from 'bun:test'

import { COMPARE_LIMIT_MS, NO_HOLDS, RUNNING_FRAME_MS, SETTLED_MS } from '../../hooks/view'
import { createPanel } from '../src/controller'
import type { PanelSource } from '../src/controller'
import { demoSource } from '../src/demo'
import type { PanelPress, Style } from '../src/panel'

const style: Style = {
  bold: s => s,
  dim: s => s,
  inverse: s => s,
  underline: s => s,
  tone: (_n, s) => s,
  banner: (_t, _p, s) => s,
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function open(overrides: Partial<PanelSource> = {}) {
  let now = 1_700_000_000_000
  const timers: { fn: () => void; ms: number; stopped: boolean }[] = []
  const pressed: PanelPress[] = []
  const calls = { renders: 0, closes: 0, fetches: 0 }
  const replies: (() => void)[] = []
  const demo = demoSource({
    modelName: 'Claude Sonnet 5.5',
    now: () => now,
    after: fn => void replies.push(fn),
    settleWindowMs: SETTLED_MS,
    comparePage: '/omp/dist/compare-page.html',
  })
  const source: PanelSource = {
    ...demo,
    press: async (p, holds) => {
      pressed.push(p)

      return demo.press(p, holds)
    },
    fetchPrsWhenDue: () => void calls.fetches++,
    ...overrides,
  }
  const panel = createPanel({
    source,
    style,
    now: () => now,
    openedAt: now,
    requestRender: () => void calls.renders++,
    close: () => void calls.closes++,
    timers: {
      every: (fn, ms) => timers.push({ fn, ms, stopped: false }) - 1,
      stop: handle => void (timers[handle as number]!.stopped = true),
    },
    height: () => undefined,
  })

  return { panel, timers, pressed, calls, replies, source, advance: (ms: number) => void (now += ms) }
}

const live = (timers: { fn: () => void; ms: number; stopped: boolean }[], ms: number) =>
  timers.filter(t => t.ms === ms && !t.stopped)

test('the panel shows a loading line until the first screen arrives', async () => {
  const { panel } = open()
  expect(panel.render(80).join('\n')).toContain('Reading the inbox…')
  await panel.start()
  expect(panel.render(80).join('\n')).toContain('Asks')
})

async function replyThenReopen(panel: ReturnType<typeof open>['panel'], reply: string): Promise<string> {
  const typed = [...reply].map(ch => [ch, ch])
  for (const [key, text] of [['r'], ...typed, ['enter']] as [string, string?][]) {
    panel.handleInput(key, text)
    await flush()
  }
  panel.handleInput('r')
  await flush()
  const lines = panel.render(80)

  return lines[lines.findIndex(l => l.includes('Your answer:')) + 1]!.trim()
}

test('a reply typed in the panel reaches the source as a type press, and Reply then opens an empty field', async () => {
  const { panel, pressed } = open()
  await panel.start()
  expect(await replyThenReopen(panel, 'hi')).toBe('')
  expect(pressed[0]).toMatchObject({ action: 'type', text: 'hi' })
})

test('a type press the source calls stale keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: null, note: 'stale', isUnconfirmed: false }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a type press whose send fails keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: 'Not sent: omp is busy', note: null, isUnconfirmed: false }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a type press whose send cannot be confirmed keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: null, note: null, isUnconfirmed: true }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a failed send shows its reason below the rows', async () => {
  const { panel } = open({ press: async () => ({ error: 'Not sent: omp is busy', note: null, isUnconfirmed: false }) })
  await panel.start()
  panel.handleInput('b')
  await flush()
  expect(panel.render(80).join('\n')).toContain('Not sent: omp is busy')
})

test('after Address on a PR thread, the selection moves to the next PR row that waits', async () => {
  const { panel, pressed } = open()
  await panel.start()
  for (const key of ['3', 'a', 'enter', 'a']) {
    panel.handleInput(key)
    await flush()
  }
  expect(pressed).toHaveLength(2)
  expect(pressed[0]).toMatchObject({ action: 'thread-address' })
  expect(pressed[1]).toMatchObject({ action: 'thread-address', thread: 'DT4' })
})

test('Esc closes the panel', async () => {
  const { panel, calls } = open()
  await panel.start()
  panel.handleInput('escape')
  expect(calls.closes).toBe(1)
})

test('the redraw timer runs only while something on the screen moves, as a settled row’s Undo', async () => {
  const { panel, timers, advance, source } = open()
  await panel.start()
  expect(live(timers, 200)).toHaveLength(0)
  await source.press({ action: 'done', id: 'd14' }, NO_HOLDS)
  await flush()
  expect(live(timers, 200)).toHaveLength(1)
  advance(SETTLED_MS + 1000)
  live(timers, 200)[0]!.fn()
  await flush()
  expect(live(timers, 200)).toHaveLength(0)
})

test('the open panel keeps its line count through tab switches, presses and a closed row leaving, and never shrinks after it grows', async () => {
  const { panel, timers, advance } = open()
  await panel.start()
  const height = panel.render(100).length
  for (const key of ['tab', 'tab', 'tab', '2', 'enter', '1', 'enter']) {
    panel.handleInput(key)
    await flush()
    expect(panel.render(100), `after ${key}`).toHaveLength(height)
  }
  panel.handleInput('r')
  await flush()
  const withField = panel.render(100).length
  expect(withField).toBeGreaterThan(height)
  panel.handleInput('escape')
  await flush()
  expect(panel.render(100)).toHaveLength(withField)
  advance(SETTLED_MS + 1000)
  live(timers, 200)[0]!.fn()
  await flush()
  expect(panel.render(100)).toHaveLength(withField)
})

test('the frame timer runs while the Status shows a running mark, re-renders without reading the session, and stops on another tab and on dispose', async () => {
  const demo = demoSource({
    modelName: 'Claude Sonnet 5.5',
    now: () => 0,
    after: () => undefined,
    settleWindowMs: SETTLED_MS,
    isNextBuild: true,
    comparePage: '/omp/dist/compare-page.html',
  })
  let reads = 0
  const { panel, timers, calls } = open({
    screen: async holds => {
      reads++

      return demo.screen(holds)
    },
  })
  await panel.start()
  expect(live(timers, RUNNING_FRAME_MS)).toHaveLength(0)
  panel.handleInput('1')
  await flush()
  const frames = live(timers, RUNNING_FRAME_MS)
  expect(frames).toHaveLength(1)
  const [rendersBefore, readsBefore] = [calls.renders, reads]
  frames[0]!.fn()
  expect(calls.renders).toBe(rendersBefore + 1)
  expect(reads).toBe(readsBefore)
  panel.handleInput('2')
  await flush()
  expect(frames[0]!.stopped).toBe(true)
  panel.handleInput('1')
  await flush()
  expect(live(timers, RUNNING_FRAME_MS)).toHaveLength(1)
  panel.dispose()
  expect(live(timers, RUNNING_FRAME_MS)).toHaveLength(0)
})

test('a Compare press with no report redraws the panel at its limit, reading No comparison came back', async () => {
  const { panel, timers, pressed, replies, advance } = open()
  await panel.start()
  panel.handleInput('p')
  await flush()
  expect(pressed[0]).toMatchObject({ action: 'compare' })
  for (const reply of replies.splice(0)) reply()
  await flush()
  expect(panel.render(80).join('\n')).toContain('Comparing…')
  const limit = timers.filter(t => t.ms >= COMPARE_LIMIT_MS && !t.stopped)
  expect(limit).toHaveLength(1)
  advance(limit[0]!.ms)
  limit[0]!.fn()
  await flush()
  expect(panel.render(120).join('\n')).toContain('No comparison came back')
  expect(limit[0]!.stopped).toBe(true)
})

test('the panel checks the PRs every two minutes until it is disposed', async () => {
  const { panel, timers, calls } = open()
  await panel.start()
  const check = live(timers, 120_000)
  expect(check).toHaveLength(1)
  check[0]!.fn()
  expect(calls.fetches).toBe(1)
  panel.dispose()
  expect(timers.every(t => t.stopped)).toBe(true)
})

test('a change in the saved state redraws the panel', async () => {
  let notify = () => {}
  const { panel, calls } = open({
    onChange: listener => {
      notify = listener

      return () => {}
    },
  })
  await panel.start()
  const before = calls.renders
  notify()
  await flush()
  expect(calls.renders).toBeGreaterThan(before)
})

test('a refused Resume shows why on the stop row', async () => {
  const demo = demoSource({
    modelName: 'Claude Sonnet 5.5',
    now: () => 0,
    after: () => {},
    settleWindowMs: SETTLED_MS,
    comparePage: '/omp/dist/compare-page.html',
  })
  const stop = { kind: 'api-error' as const, detail: 'overloaded', resets: null, at: 1_700_000_000_000 }
  const { panel } = open({
    screen: async holds => ({ ...(await demo.screen(holds)), stop }),
    resume: async () => 'no session to send to',
  })
  await panel.start()
  panel.handleInput('enter')
  await flush()
  await flush()
  expect(panel.render(200).join('\n')).toContain('Not sent: no session to send to')
})
