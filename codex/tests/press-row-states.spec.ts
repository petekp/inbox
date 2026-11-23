import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { DOT } from '../../core/view/rows'
import { applyPrPress } from '../../core/view/pr-tab'
import type { PrPress } from '../../core/view/pr-press'
import type { PrCheck, PrView } from '../../types'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'
import { NO_HOLDS } from '../../core/view/timing'
import {
  ENTER_FADE_MS,
  ROW_STATE_MS,
  SLIDE_PX,
  drawsPanel,
  enterDelayMs,
  moveMs,
  stepRow,
} from '../../core/view/row-motion'
import { FRAME_MS, HEIGHT_SETTLE_MS, springStep } from '../../core/view/springs'
import { LINE_PT } from '../../core/view/layout'
import type { RowState, RowTarget, RowTrack } from '../../core/view/row-motion'

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

const OPEN_FORM = new Set<RowState>(['opening', 'open', 'closing', 'settling'])
const trackOf = (state: RowState, hasOpenForm = OPEN_FORM.has(state)): RowTrack => ({ state, since: 0, hasOpenForm })

test('every row state reaches every target, a row drawing its panel keeps it until its height has shrunk over it, and a settling row draws none', () => {
  for (const state of ROW_STATES)
    for (const target of ROW_TARGETS) {
      const first = stepRow(trackOf(state), target, 0)
      if (drawsPanel(trackOf(state)) && first && first.state !== 'settling')
        assert.ok(drawsPanel(first), `${state} toward ${target} dropped its panel as ${first.state}`)
      if (first?.state === 'settling') assert.equal(drawsPanel(first), false, `${state} toward ${target}`)
      let track = first
      for (let n = 0; n < 2 && track && track.state !== RESTS[target]; n++)
        track = stepRow(track, target, track.since + moveMs(track))
      assert.equal(track?.state ?? null, RESTS[target], `${state} toward ${target}`)
      if (track) assert.equal(track.hasOpenForm, track.state === 'open', `${state} toward ${target}`)
    }
  assert.equal(drawsPanel(stepRow(trackOf('open'), 'gone', 0)!), true)
  assert.equal(drawsPanel(stepRow(trackOf('closed'), 'gone', 0)!), false)
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
  assert.deepEqual(stepRow(undefined, 'open', 0, true), { state: 'entering', since: 0, hasOpenForm: true })
  assert.equal(stepRow(undefined, 'closed', 0, true)?.hasOpenForm, false)
  assert.equal(stepRow(undefined, 'closed', 0, true, true)?.state, 'closed')
  assert.equal(stepRow(undefined, 'open', 0)?.state, 'open')
  const settledIn = stepRow(undefined, 'settled', 0, true)
  assert.equal(settledIn?.state, 'entering')
  assert.equal(stepRow(settledIn!, 'settled', ROW_STATE_MS.entering)?.state, 'settled')
})

test('an entering space’s content waits until the space is within half the slide of open, and its fade ends as the space rests', () => {
  assert.equal(enterDelayMs(0), 0)
  for (const height of [LINE_PT, 2 * LINE_PT, 100, 400, 2000]) {
    const wait = enterDelayMs(height)
    const isCapped = wait === HEIGHT_SETTLE_MS - ENTER_FADE_MS
    const opened = springStep({ x: 0, v: 0 }, height, wait).x
    const frameBefore = springStep({ x: 0, v: 0 }, height, wait - FRAME_MS).x
    assert.ok(isCapped || height - opened <= SLIDE_PX / 2, `${height} px is ${height - opened} px from open`)
    assert.ok(isCapped || height - frameBefore > SLIDE_PX / 2, `${height} px waits a frame longer than it needs`)
    assert.ok(wait + ENTER_FADE_MS <= HEIGHT_SETTLE_MS, `${height} px fades past its rest`)
  }
})

test('in the Codex tab, j and k wrap between a tab’s first and last rows, a PR row closes with its panel, leaves from its place with its group and title, a block’s press line grows in, a dismissed block settles under its settled line and grows back on Undo, a merged block’s Dismiss draws its button out and no press line until its reply settles the block, which then leaves with its view, Clear merged and closed above the blocks settles the last merged block and leaves with it, and with reduced motion each move ends as it starts', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const window = new Window()
  const animate = window.HTMLElement.prototype.animate
  const slid: string[] = []
  window.HTMLElement.prototype.animate = function (...args: Parameters<typeof animate>) {
    const [frames] = args
    if (Array.isArray(frames) && frames.some(f => 'transform' in f)) slid.push(String(frames.at(-1)?.transform))
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
    ResizeObserver: window.ResizeObserver,
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
  let isReplyHeld = false
  const heldReplies: (() => void)[] = []
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
    const reply = () =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } }))
    if (press && isReplyHeld) heldReplies.push(reply)
    else queueMicrotask(reply)
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
  const isMoving = (e: HTMLElement) => e.getAnimations().some(a => a.playState === 'running')
  const blockEntry = (n: number, name: string) =>
    [...block(n).querySelectorAll<HTMLElement>('.entry')].find(
      e => e.querySelector('.line .text')?.textContent === `CI / ${name}`,
    )
  const isSettlingOverBlock = (n: number) =>
    !!block(n).querySelector('.settled-line') && !!block(n).querySelector('.closing[inert] .pr-actions')
  const clearLine = () => root.querySelector<HTMLElement>('[data-motion="pr-clear"]')
  const line = () => root.querySelector('.pr-last')?.textContent ?? null
  const isLineGrowing = () => (root.querySelector('.pr-last')?.parentElement?.getAnimations().length ?? 0) > 0
  try {
    await import('../src/tab')
    await settle()
    assert.deepEqual(groups(), [`Failing checks${DOT}1`, `Cancelled checks${DOT}2`])
    assert.ok(entry('lint') !== null && entry('e2e') !== null && entry('e2e-mac') !== null)
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
    assert.ok(entry('lint')!.querySelector('.row.selected .panel') !== null)
    assert.ok(entry('e2e')!.querySelector('.row.closing .panel.closing') !== null)
    await after(ROW_STATE_MS.closing + 100)
    assert.ok(entry('e2e')!.querySelector('.panel') === null)
    await open('e2e')
    await after(ROW_STATE_MS.closing + 100)
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
    assert.ok(entry('e2e')!.querySelector('.row.closing .panel.closing') !== null)
    assert.ok(entry('e2e-mac') !== null)
    assert.ok(line())
    assert.ok(isLineGrowing())
    assert.ok(slid.includes(`translateY(${-SLIDE_PX}px)`))
    assert.ok(root.querySelector('[data-motion][style*="pointer-events: none"]') !== null)
    await after(ROW_STATE_MS.leaving + 100)
    assert.deepEqual(groups(), [`Failing checks${DOT}1`])
    assert.ok(entry('e2e') === null)
    assert.ok(line())
    assert.ok(!isLineGrowing())
    isReduced = true
    await open('lint')
    setChecks([check('lint', 'pass'), check('e2e', 'pending'), check('e2e-mac', 'pending')])
    await after(POLL_MS + 100)
    assert.deepEqual(groups(), [])
    assert.ok(entry('lint') === null)
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
    assert.ok(root.querySelector('.pr-order') !== null)
    setViews([prView(15, 'Speed up the build', 'OPEN', [check('lint', 'fail')])])
    await after(POLL_MS + 100)
    const leaving = blockEntry(15, 'e2e')!
    assert.ok(isMoving(leaving))
    await press(block(15), 'Dismiss')
    assert.ok(blockEntry(15, 'e2e') === leaving)
    assert.ok(isMoving(leaving))
    assert.ok(isSettlingOverBlock(15))
    assert.ok(isMoving(block(15)))
    await after(ROW_STATE_MS.closing + 100)
    assert.ok(block(15).querySelector('.settled-line') !== null)
    assert.ok(block(15).querySelector('[inert]') === null)
    await press(block(15), 'Undo')
    assert.ok(block(15).querySelector('.pr-head') !== null)
    assert.ok(isMoving(block(15)))
    await after(ROW_STATE_MS.leaving + 100)
    await after(HEIGHT_SETTLE_MS + 100)
    assert.ok(!isMoving(block(15)))
    isReplyHeld = true
    await press(block(13), 'Dismiss')
    assert.ok(block(13).querySelector('button.key.out') !== null)
    assert.equal(block(13).querySelector('.pr-last')?.textContent ?? null, null)
    await after(FRAME_MS * 3)
    assert.equal(block(13).querySelector('.pr-last')?.textContent ?? null, null)
    assert.ok(!isSettlingOverBlock(13))
    isReplyHeld = false
    heldReplies.splice(0).forEach(reply => reply())
    await settle()
    assert.ok(isSettlingOverBlock(13))
    await after(ROW_STATE_MS.closing + 100)
    assert.ok(!isSettlingOverBlock(13))
    state.prViews = {
      ...state.prViews,
      views: Object.fromEntries(Object.entries(state.prViews.views).filter(([r]) => r !== 'acme/app#13')),
    }
    await after(POLL_MS + 100)
    assert.ok(block(13).querySelector('.settled-line') !== null)
    assert.ok(isMoving(block(13)))
    await after(ROW_STATE_MS.leaving + 100)
    assert.ok(block(13) === undefined)
    assert.ok(clearLine()!.compareDocumentPosition(block(14)) & window.Node.DOCUMENT_POSITION_FOLLOWING)
    await press(clearLine()!, 'Clear merged and closed')
    assert.ok(isSettlingOverBlock(14))
    assert.ok(clearLine()!.querySelector('[inert] .pr-actions') !== null)
    assert.ok(isMoving(clearLine()!))
    await after(ROW_STATE_MS.leaving + 100)
    assert.ok(clearLine() === null)
    assert.ok(!isSettlingOverBlock(14))
    isReduced = true
    await press(block(12), 'Dismiss')
    assert.ok(block(12).querySelector('.settled-line') !== null)
    assert.ok(block(12).querySelector('[inert]') === null)
  } finally {
    await window.happyDOM.abort()
    await window.happyDOM.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
