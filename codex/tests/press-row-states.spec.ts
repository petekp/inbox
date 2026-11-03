import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { DOT } from '../../hooks/rows'
import type { PrCheck } from '../../types'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'
import { EXIT_MS, MOVE_MS, ROW_STATE_MS, stepRow } from '../src/rows'
import type { RowState, RowTarget, RowTrack } from '../src/rows'

const ROW_STATES: RowState[] = [
  'entering',
  'closed',
  'opening',
  'open',
  'closing',
  'settling',
  'settled',
  'undoing',
  'leaving',
]
const ROW_TARGETS: RowTarget[] = ['closed', 'open', 'settled', 'undoing', 'gone']
const RESTS: Record<RowTarget, RowState | null> = {
  closed: 'closed',
  open: 'open',
  settled: 'settled',
  undoing: 'undoing',
  gone: null,
}

const WITH_PANEL = new Set<RowState>(['opening', 'open', 'closing', 'settling'])
const trackOf = (state: RowState, hasPanel = WITH_PANEL.has(state)): RowTrack => ({ state, since: 0, hasPanel })

test('every row state reaches every target, and a row drawing its panel keeps it until its height has shrunk over it', () => {
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS) {
      const first = stepRow(trackOf(state), target, 0)
      if (WITH_PANEL.has(state) && first)
        assert.ok(
          first.hasPanel && (WITH_PANEL.has(first.state) || first.state === 'leaving'),
          `${state} toward ${target} dropped its panel as ${first.state}`,
        )
      let track = first
      for (let n = 0; n < 2 && track && track.state !== RESTS[target]; n++)
        track = stepRow(track, target, track.since + ROW_STATE_MS[track.state])
      assert.equal(track?.state ?? null, RESTS[target], `${state} toward ${target}`)
      if (track) assert.equal(track.hasPanel, track.state === 'open', `${state} toward ${target}`)
    }
  assert.equal(stepRow(trackOf('open'), 'gone', 0)?.hasPanel, true)
  assert.equal(stepRow(trackOf('closed'), 'gone', 0)?.hasPanel, false)
})

test('a row turned around mid-move starts the new move at once, and with reduced motion every move ends as it starts', () => {
  assert.equal(stepRow(trackOf('closing'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('opening'), 'closed', 50)?.state, 'closing')
  assert.equal(stepRow(trackOf('settling'), 'open', 50)?.state, 'opening')
  assert.equal(stepRow(trackOf('entering', false), 'open', 50)?.state, 'opening')
  const closing = trackOf('closing')
  assert.equal(stepRow(closing, 'closed', 50), closing)
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS)
      assert.equal(
        stepRow(trackOf(state), target, 0, false, true)?.state ?? null,
        RESTS[target],
        `${state} toward ${target}`,
      )
  assert.deepEqual(stepRow(undefined, 'open', 0, true), { state: 'entering', since: 0, hasPanel: true })
  assert.equal(stepRow(undefined, 'closed', 0, true)?.hasPanel, false)
  assert.equal(stepRow(undefined, 'closed', 0, true, true)?.state, 'closed')
  assert.equal(stepRow(undefined, 'open', 0)?.state, 'open')
})

test('in the Codex tab, a PR row closes with its panel, leaves from its place with its group and title, and a block’s press line grows in, and with reduced motion each move ends as it starts', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const window = new Window()
  const animate = window.HTMLElement.prototype.animate
  window.HTMLElement.prototype.animate = function (...args: Parameters<typeof animate>) {
    const animation = animate.apply(this, args)
    animation.finished.catch(() => {})
    return animation
  }
  const ref = 'acme/app#12'
  const check = (name: string, bucket: PrCheck['bucket']): PrCheck => ({
    name,
    bucket,
    url: `https://github.com/acme/app/actions/runs/7/job/${name}`,
    workflow: 'CI',
    startedAt: 1,
    finishedAt: 2,
  })
  const state = emptyState('pr-rows')
  state.heard.startAt = 1
  state.shownTab = 'prs'
  state.ledger = { ...state.ledger, prs: [ref] }
  const setChecks = (checks: PrCheck[]) => {
    state.prViews = {
      views: {
        [ref]: {
          ref,
          number: 12,
          title: 'Add a CLI',
          url: 'https://github.com/acme/app/pull/12',
          isDraft: false,
          state: 'OPEN',
          base: 'main',
          mergeable: 'MERGEABLE',
          reviewDecision: '',
          checks,
          threads: [],
          isYours: true,
          wasSeenOpen: true,
          error: null,
          fetchedAt: Date.now(),
        },
      },
      branchRef: null,
      isFetching: false,
    }
  }
  setChecks([check('lint', 'fail'), check('e2e', 'cancelled'), check('e2e-mac', 'cancelled')])
  window.document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'pr-rows-page', configurable: true })
  Object.defineProperty(window, '__inboxKept', {
    value: {
      version: 2,
      isDemo: false,
      tab: 'prs',
      selection: { needsYou: null, findings: null, prs: null },
      typing: null,
      drafts: [],
      optionsShown: [],
      unfolded: [],
    },
    configurable: true,
    writable: true,
  })
  let isReduced = false
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { get: () => isReduced })
  const globals = {
    window,
    document: window.document,
    Event: window.Event,
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    sessionStorage: window.sessionStorage,
    matchMedia: () => media,
    getComputedStyle: window.getComputedStyle.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  for (const [key, value] of Object.entries({ setTimeout, clearTimeout }))
    Object.defineProperty(window, key, { value, writable: true, configurable: true })
  window.parent.postMessage = message => {
    const request = message as { id?: number; method: string; params?: { name?: string } }
    if (request.id === undefined) return
    const view: TabView = {
      ...viewOf(state, Date.now()),
      thread: state.sessionId,
      devPage: 'pr-rows-page',
      serverBuild: SERVER_BUILD,
      isFetchingPrs: false,
      isGhMissing: false,
    }
    assert.ok(request.method === 'ui/initialize' || request.params?.name === 'inbox_view', request.method)
    const result = request.method === 'ui/initialize' ? {} : { structuredContent: view }
    queueMicrotask(() =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } })),
    )
  }
  const root = document.getElementById('app')!
  const settle = async () => {
    for (let n = 0; n < 20; n++) await new Promise<void>(resolve => setImmediate(resolve))
  }
  const after = async (ms: number) => {
    context.mock.timers.tick(ms)
    await settle()
  }
  const rowId = (name: string) => `${ref} check ${name}`
  const entry = (name: string) =>
    [...root.querySelectorAll<HTMLElement>('.pr-groups .entry')].find(
      e => e.querySelector('.line .text')?.textContent === `CI / ${name}`,
    ) ?? null
  const groups = () => [...root.querySelectorAll('.pr-groups .group-title')].map(g => g.textContent)
  const open = async (name: string) => {
    entry(name)!.querySelector<HTMLElement>('.line')!.click()
    await settle()
  }
  const line = () => root.querySelector('.pr-last')?.textContent ?? null
  const isLineGrowing = () => (root.querySelector('.pr-last')?.parentElement?.getAnimations().length ?? 0) > 0
  try {
    await import('../src/tab')
    await settle()
    assert.deepEqual(groups(), [`Failing checks${DOT}1`, `Cancelled checks${DOT}2`])
    assert.ok(entry('lint') && entry('e2e') && entry('e2e-mac'))
    await open('e2e')
    await open('lint')
    assert.ok(entry('lint')!.querySelector('.row.selected .panel'))
    assert.ok(entry('e2e')!.querySelector('.row.closing .panel.closing'))
    await after(MOVE_MS + 100)
    assert.equal(entry('e2e')!.querySelector('.panel'), null)
    await open('e2e')
    await after(MOVE_MS + 100)
    setChecks([check('lint', 'fail'), check('e2e', 'pending'), check('e2e-mac', 'pending')])
    const result = {
      state: 'done' as const,
      parts: [{ kind: 'rerun' as const, name: 'CI', isCommand: false, error: null }],
      at: Date.now(),
      pressId: 'p1',
      action: 'check-rerun',
    }
    const rerun = { kind: 'local' as const, action: 'check-rerun', text: 'Re-run', at: Date.now(), result }
    state.lastActions = { [rowId('e2e')]: rerun, [`pr:${ref}`]: rerun }
    await after(POLL_MS + 100)
    assert.deepEqual(groups(), [`Failing checks${DOT}1`, 'Cancelled checks'])
    assert.ok(entry('e2e')!.querySelector('.row.closing .panel.closing'))
    assert.ok(entry('e2e-mac'))
    assert.ok(line())
    assert.ok(isLineGrowing())
    await after(EXIT_MS + 100)
    assert.deepEqual(groups(), [`Failing checks${DOT}1`])
    assert.equal(entry('e2e'), null)
    assert.ok(line())
    assert.ok(!isLineGrowing())
    isReduced = true
    await open('lint')
    setChecks([check('lint', 'pass'), check('e2e', 'pending'), check('e2e-mac', 'pending')])
    await after(POLL_MS + 100)
    assert.deepEqual(groups(), [])
    assert.equal(entry('lint'), null)
  } finally {
    await window.happyDOM.abort()
    await window.happyDOM.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
