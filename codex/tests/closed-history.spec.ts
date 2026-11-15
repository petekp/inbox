import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordClose, recordItem } from '../../hooks/tools'
import { shortAgo } from '../../hooks/rows'
import { NO_HOLDS } from '../../hooks/timing'
import type { Holds } from '../../hooks/timing'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'
import { window } from './row-actions-fixtures'

test('the Codex Closed fold lists every record newest first at a narrow viewport and folds it back', async () => {
  const state = emptyState('closed-history')
  state.heard.startAt = 1
  const closedAt = Date.now() - 120_000
  const records = Array.from({ length: 5 }, (_, n) => ({ ask: `History question ${n + 1}?`, at: closedAt + n * 1000 }))
  let ledger = state.ledger
  for (const [index, record] of records.entries()) {
    const added = recordItem(CODEX, ledger, { kind: 'question', ask: record.ask, options: ['Yes', 'No'] }, record.at)
    const id = added.ledger.items.at(-1)!.id
    ledger = recordClose(CODEX, added.ledger, { id, answer: `Answer ${index + 1}` }, record.at, {
      lastActions: {},
      turnStartedAt: null,
    }).ledger
  }
  state.ledger = ledger
  const viewport = Object.getOwnPropertyDescriptor(window, 'innerWidth')
  Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'closed-history-page', configurable: true })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { value: true, configurable: true })
  const globals = {
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    sessionStorage: window.sessionStorage,
    matchMedia: () => media,
    getComputedStyle: window.getComputedStyle.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const tabView = (holds?: Partial<Holds>): TabView => ({
    ...viewOf(state, Date.now(), {
      ...NO_HOLDS,
      replies: holds?.replies ?? {},
      discarded: holds?.discarded ?? {},
      shownSince: holds?.shownSince ?? null,
    }),
    thread: state.sessionId,
    devPage: 'closed-history-page',
    serverBuild: SERVER_BUILD,
    isFetchingPrs: false,
    isGhMissing: false,
  })
  window.parent.postMessage = message => {
    const request = message as { id?: number; method: string; params?: { name?: string; arguments?: Partial<Holds> } }
    if (request.id === undefined) return
    const result =
      request.method === 'ui/initialize'
        ? {}
        : request.params?.name === 'inbox_view'
          ? { structuredContent: tabView(request.params.arguments) }
          : (() => {
              throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
            })()
    queueMicrotask(() =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } })),
    )
  }
  const root = document.getElementById('app')!
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n++) await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(ready())
  }

  try {
    const { closedAll, unfolded } = await import('../src/tab-state')
    closedAll.clear()
    unfolded.clear()
    await import('../src/tab')
    await until(() => root.querySelector('[data-fold="question"]') !== null)
    assert.equal(root.querySelector('.closed-list'), null)
    root.querySelector<HTMLButtonElement>('[data-fold="question"]')!.click()
    await until(() => root.querySelectorAll('.closed-list > .entry').length === 3)
    assert.ok(root.querySelector('.earlier'))
    root.querySelector<HTMLButtonElement>('.earlier')!.click()
    await until(() => root.querySelectorAll('.closed-list > .entry').length === records.length)
    const rows = [...root.querySelectorAll<HTMLElement>('.closed-list > .entry')]
    assert.deepEqual(
      rows.map(row => row.querySelector('.muted')?.textContent),
      [...records].reverse().map(r => r.ask),
    )
    for (const [index, row] of rows.entries()) {
      assert.match(row.textContent ?? '', new RegExp(`Answer ${records.length - index}`))
      assert.equal(
        row.querySelector('.side')?.textContent,
        shortAgo(Date.now() - records[records.length - index - 1]!.at),
      )
    }
    root.querySelector<HTMLButtonElement>('[data-fold="question"]')!.click()
    await until(() => root.querySelector('.closed-list') === null)
    root.querySelector<HTMLButtonElement>('[data-fold="question"]')!.click()
    await until(() => root.querySelectorAll('.closed-list > .entry').length === 3)
    root.querySelector<HTMLButtonElement>('.earlier')!.click()
    await pause(POLL_MS + 50)
    assert.equal(root.querySelectorAll('.closed-list > .entry').length, records.length)
  } finally {
    await window.happyDOM.abort()
    if (viewport) Object.defineProperty(window, 'innerWidth', viewport)
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
