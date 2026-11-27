import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { setTypedGoal } from '../../core/domain/status-goal-ops'
import { viewOf } from '../src/core'
import { demoState } from '../src/demo'
import type { SessionState } from '../src/state'

function withGlobals(window: Window) {
  const globals = {
    window,
    document: window.document,
    Event: window.Event,
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    ResizeObserver: window.ResizeObserver,
    sessionStorage: window.sessionStorage,
    matchMedia: () => window.matchMedia('(prefers-reduced-motion: reduce)'),
    getComputedStyle: window.getComputedStyle.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })

  return () => {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
  }
}

test("when a Status moves subjects into a new goal's milestones and back, the rows that stay keep their order with their children, and the Later label grows in and leaves", async () => {
  const restore = withGlobals(new Window())
  try {
    const { tabState, drawnRows } = await import('../src/tab-state')
    const { stepStatus } = await import('../src/tab-status-steps')
    const now = Date.now()
    const demo = demoState(now)
    const overview = demo.ledger.overview
    if (!overview) throw new Error('the demo has no Status')
    const typed: SessionState = {
      ...demo,
      ledger: { ...demo.ledger, overview: setTypedGoal(overview, 'Pinch and flick ship in the beta', now) },
    }
    const withMilestones = viewOf(demo, now).statusPage
    const withNone = viewOf(typed, now).statusPage
    const step = (page: typeof withNone, at: number) => {
      tabState.lastStatus = stepStatus(page, at, new Set(), new Set())
      return tabState.lastStatus
    }
    const ids = (rows: { id: string }[]) => rows.map(r => r.id)

    step(withNone, now)
    const toMilestones = step(withMilestones, now + 10)
    assert.deepEqual(ids(toMilestones.rows), [
      'other',
      's2',
      's2-ask',
      'c5',
      's3',
      's3-ask',
      's1',
      'c1',
      'c3',
      'c4',
      's5',
      's4',
      'done',
      'other-done',
    ])
    assert.deepEqual(ids(toMilestones.later), ['m5'])
    assert.equal(drawnRows.get('later-m5')?.track.state, 'entering')

    step(withMilestones, now + 5_000)
    const fromMilestones = step(withNone, now + 5_010)
    assert.deepEqual(ids(fromMilestones.rows), [
      'other',
      's2',
      's2-ask',
      'c5',
      'other-done',
      's3',
      's3-ask',
      's1',
      'c1',
      'c3',
      'c4',
      's5',
      's4',
      'done',
    ])
    assert.equal(drawnRows.get('later-m5')?.track.state, 'leaving')
  } finally {
    restore()
  }
})
