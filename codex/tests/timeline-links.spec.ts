import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { prMarkId } from '../../hooks/pr-rows'
import type { PrPress } from '../../hooks/pr-press'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

test('a Timeline Local open stays disabled while pending and draws its done or failed result', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const now = Date.now()
  const ref = 'https://github.com/acme/inbox/pull/12'
  const state = emptyState('timeline-links')
  state.heard.startAt = 1
  state.taskTree = [
    {
      id: 'linked-task',
      parentId: null,
      status: 'working',
      weight: 1,
      title: 'Review the linked work',
      detail: 'Open the tracked pull request.',
      links: { pr: ref },
      notes: [],
      createdAt: now,
      updatedAt: now,
      history: [],
    },
  ]
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'timeline-links-page', configurable: true })
  Object.defineProperty(window, '__inboxKept', {
    value: {
      version: 2,
      isDemo: false,
      tab: 'timeline',
      selection: { needsYou: null, findings: null, prs: null },
      typing: null,
      drafts: [],
      optionsShown: [],
      unfolded: [],
    },
    configurable: true,
    writable: true,
  })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { value: true })
  const animate = window.HTMLElement.prototype.animate
  window.HTMLElement.prototype.animate = function (...args: Parameters<typeof animate>) {
    const animation = animate.apply(this, args)
    animation.finished.catch(() => {})
    return animation
  }
  const globals = {
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
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const windowTimers = { setTimeout, clearTimeout }
  for (const [key, value] of Object.entries(windowTimers))
    Object.defineProperty(window, key, { value, writable: true, configurable: true })

  const openPresses: PrPress[] = []
  const heldOpenReplies: (() => void)[] = []
  const tabView = (): TabView => ({
    ...viewOf(state, Date.now()),
    thread: state.sessionId,
    devPage: 'timeline-links-page',
    serverBuild: SERVER_BUILD,
    isFetchingPrs: false,
    isGhMissing: false,
  })
  window.parent.postMessage = message => {
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { press?: PrPress } }
    }
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') result = {}
    else if (request.params?.name === 'inbox_view') result = { structuredContent: tabView() }
    else if (request.params?.name === 'inbox_press' && request.params.arguments?.press?.action === 'pr-open') {
      openPresses.push(request.params.arguments.press)
      heldOpenReplies.push(() => {
        const reply = { structuredContent: { view: tabView(), error: null, note: null } }
        queueMicrotask(() =>
          window.dispatchEvent(
            new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result: reply } }),
          ),
        )
      })
      return
    } else throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
    queueMicrotask(() =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } })),
    )
  }

  const root = document.getElementById('app')!
  const openButton = () => root.querySelector<HTMLButtonElement>('.timeline-detail button')
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n++) await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(ready())
  }
  const setOpenResult = (result: 'done' | 'failed', error: string | null) => {
    const at = Date.now()
    state.lastActions[prMarkId(ref)] = {
      kind: 'local',
      action: 'open',
      text: 'Open PR',
      at,
      result: {
        state: result,
        parts: [{ kind: 'open', name: 'PR #12', isCommand: false, error }],
        at,
      },
    }
  }
  try {
    await import('../src/tab')
    await until(() => root.querySelector('.timeline-node') !== null && openButton() !== null)

    openButton()!.click()
    await until(() => openButton()?.textContent === 'Opening…')
    assert.equal(openButton()?.disabled, true)
    openButton()!.click()
    assert.equal(openPresses.length, 1, 'the second open press is ignored while pending')
    assert.equal(heldOpenReplies.length, 1)

    setOpenResult('done', null)
    heldOpenReplies.shift()?.()
    await until(() => root.querySelector('.timeline-detail .tone-done')?.textContent === '✓ Opened')
    assert.equal(openButton()?.disabled, false)

    openButton()!.click()
    await until(() => openButton()?.textContent === 'Opening…')
    assert.equal(openButton()?.disabled, true)
    assert.equal(root.querySelector('.timeline-detail .tone-done'), null)
    assert.equal(openPresses.length, 2)
    setOpenResult('failed', 'Browser unavailable')
    heldOpenReplies.shift()?.()
    await until(() => root.querySelector('.timeline-detail .tone-error')?.textContent === 'Browser unavailable')
    assert.match(root.querySelector('.timeline-detail .tone-error')?.className ?? '', /tone-error/)
  } finally {
    const { dispose } = await import('../src/tab-host')
    dispose()
    for (const [key, value] of previous)
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
  }
})
