import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { DOT } from '../../hooks/rows'
import { applyPrPress } from '../../hooks/pr-tab'
import type { PrPress } from '../../hooks/pr-press'
import type { PrCheck, PrView } from '../../types'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'
import { NO_HOLDS } from '../../hooks/timing'
import { EXIT_MS, MOVE_MS, ROW_STATE_MS, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'

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

test('in the Codex tab, j and k wrap between a tab’s first and last rows, a PR row closes with its panel, leaves from its place with its group and title, a block’s press line grows in, a dismissed block settles under its settled line and grows back on Undo, a merged block’s Dismiss settles it and it leaves with its view, and with reduced motion each move ends as it starts', async context => {
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
  const prView = (number: number, title: string, prState: 'OPEN' | 'MERGED', checks: PrCheck[]): PrView => ({
    ref: `acme/app#${number}`,
    number,
    title,
    url: `https://github.com/acme/app/pull/${number}`,
    isDraft: false,
    state: prState,
    base: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: '',
    checks,
    threads: [],
    isYours: true,
    wasSeenOpen: true,
    error: null,
    fetchedAt: Date.now(),
  })
  const setViews = (views: PrView[]) => {
    state.prViews = {
      views: { ...state.prViews.views, ...Object.fromEntries(views.map(pr => [pr.ref, pr])) },
      branchRef: null,
      isFetching: false,
    }
  }
  const setChecks = (checks: PrCheck[]) => setViews([prView(12, 'Add a CLI', 'OPEN', checks)])
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
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { press?: PrPress; shownSince?: number | null } }
    }
    if (request.id === undefined) return
    const press = request.params?.name === 'inbox_press' ? request.params.arguments!.press! : null
    if (press) {
      const applied = applyPrPress(state.ledger, state.prViews, state.lastActions, press, {
        now: Date.now(),
        turnsStarted: 0,
      })
      assert.ok(!('stale' in applied), press.action)
      state.ledger = applied.ledger
      state.lastActions = { ...state.lastActions, ...applied.lasts }
    }
    const view: TabView = {
      ...viewOf(state, Date.now(), { ...NO_HOLDS, shownSince: request.params?.arguments?.shownSince ?? null }),
      thread: state.sessionId,
      devPage: 'pr-rows-page',
      serverBuild: SERVER_BUILD,
      isFetchingPrs: false,
      isGhMissing: false,
    }
    assert.ok(request.method === 'ui/initialize' || request.params?.name === 'inbox_view' || press, request.method)
    const result =
      request.method === 'ui/initialize'
        ? {}
        : { structuredContent: press ? { view, copy: null, error: null, note: null } : view }
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
  const block = (n: number) =>
    [...root.querySelectorAll<HTMLElement>('main > section')].find(
      e => e.querySelector('.num, .tone-prs')?.textContent === `#${n}`,
    )!
  const press = async (scope: HTMLElement, label: string) => {
    ;[...scope.querySelectorAll<HTMLElement>('button')].find(b => b.textContent?.trim() === label)!.click()
    await settle()
  }
  const isMoving = (e: HTMLElement) => e.getAnimations().length > 0
  const blockEntry = (n: number, name: string) =>
    [...block(n).querySelectorAll<HTMLElement>('.entry')].find(
      e => e.querySelector('.line .text')?.textContent === `CI / ${name}`,
    )
  const isSettlingOverBlock = (n: number) =>
    !!block(n).querySelector('.settled-line') && !!block(n).querySelector('.closing[inert] .pr-actions')
  const line = () => root.querySelector('.pr-last')?.textContent ?? null
  const isLineGrowing = () => (root.querySelector('.pr-last')?.parentElement?.getAnimations().length ?? 0) > 0
  try {
    await import('../src/tab')
    await settle()
    assert.deepEqual(groups(), [`Failing checks${DOT}1`, `Cancelled checks${DOT}2`])
    assert.ok(entry('lint') && entry('e2e') && entry('e2e-mac'))
    const selectedAfter = async (key: string) => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await settle()
      return ['lint', 'e2e', 'e2e-mac'].filter(name => entry(name)!.querySelector('.row.selected'))
    }
    assert.deepEqual(await selectedAfter('j'), ['e2e'])
    assert.deepEqual(await selectedAfter('j'), ['e2e-mac'])
    assert.deepEqual(await selectedAfter('j'), ['lint'])
    assert.deepEqual(await selectedAfter('k'), ['e2e-mac'])
    assert.deepEqual(await selectedAfter('ArrowDown'), ['lint'])
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
    isReduced = false
    window.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const drawn = [this, ...this.querySelectorAll<HTMLElement>('*')].filter(
        e => !e.closest('[style*="display: none"]'),
      )
      return new window.DOMRect(0, 0, 100, drawn.length)
    }
    setViews([
      prView(13, 'Fix the login redirect', 'MERGED', []),
      prView(14, 'Bump the parser', 'MERGED', []),
      prView(15, 'Speed up the build', 'OPEN', [check('lint', 'fail'), check('e2e', 'fail')]),
    ])
    const refs = ['acme/app#15', ref]
    state.ledger = {
      ...state.ledger,
      prs: [ref, 'acme/app#13', 'acme/app#14', 'acme/app#15'],
      prOrder: { refs, label: null, why: null, statuses: null, dismissed: [], by: 'Claude', at: Date.now() },
    }
    await after(POLL_MS + 100)
    assert.ok(block(15).querySelector('.rank'))
    setViews([prView(15, 'Speed up the build', 'OPEN', [check('lint', 'fail')])])
    await after(POLL_MS + 100)
    const leaving = blockEntry(15, 'e2e')!
    assert.ok(isMoving(leaving))
    await press(block(15), 'Dismiss')
    assert.ok(blockEntry(15, 'e2e') === leaving)
    assert.ok(isMoving(leaving))
    assert.ok(isSettlingOverBlock(15))
    assert.ok(isMoving(block(15)))
    await after(MOVE_MS + 100)
    assert.ok(block(15).querySelector('.settled-line'))
    assert.equal(block(15).querySelector('[inert]'), null)
    await press(block(15), 'Undo')
    assert.ok(block(15).querySelector('.pr-head'))
    assert.ok(isMoving(block(15)))
    await after(MOVE_MS + 100)
    assert.ok(!isMoving(block(15)))
    await press(block(13), 'Dismiss')
    assert.ok(isSettlingOverBlock(13))
    await after(MOVE_MS + 100)
    assert.ok(!isSettlingOverBlock(13))
    state.prViews = {
      ...state.prViews,
      views: Object.fromEntries(Object.entries(state.prViews.views).filter(([r]) => r !== 'acme/app#13')),
    }
    await after(POLL_MS + 100)
    assert.ok(block(13).querySelector('.settled-line'))
    assert.ok(isMoving(block(13)))
    await after(EXIT_MS + 100)
    assert.equal(block(13), undefined)
    isReduced = true
    await press(block(12), 'Dismiss')
    assert.ok(block(12).querySelector('.settled-line'))
    assert.equal(block(12).querySelector('[inert]'), null)
  } finally {
    await window.happyDOM.abort()
    await window.happyDOM.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
