import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPress } from '../../hooks/press-reducer'
import type { RowPress } from '../../hooks/presses'
import { PRESS_GUARD_MS, SETTLED_MS } from '../../hooks/view'
import type { Holds } from '../../hooks/view'
import { recordClose, recordItem } from '../../hooks/tools'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'
import { buttons, named, task, window } from './row-actions-fixtures'

test('the actual Codex tab replaces actions and shortcuts while replying, restores a cancelled draft, sends its current words, keeps them when the send cannot be confirmed, and keeps a done row in place past its Undo until the person switches tab or types a message', async () => {
  const state = emptyState('renderer')
  state.ledger = task().ledger
  state.heard.startAt = 1
  state.presence = { ...state.presence, turnsStarted: 1, turnsApplied: 1 }
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'renderer-page', configurable: true })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { value: true })
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
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const presses: RowPress[] = []
  let isUnconfirmed = false
  let pressesAnswered = 0
  const tabView = (holds?: Partial<Holds>): TabView => ({
    ...viewOf(state, Date.now(), {
      replies: holds?.replies ?? {},
      discarded: holds?.discarded ?? {},
      shownSince: holds?.shownSince ?? null,
    }),
    thread: state.sessionId,
    devPage: 'renderer-page',
    serverBuild: SERVER_BUILD,
    isFetchingPrs: false,
    isGhMissing: false,
  })
  window.parent.postMessage = message => {
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { press?: RowPress } & Partial<Holds> }
    }
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') result = {}
    else if (request.params?.name === 'inbox_view') result = { structuredContent: tabView(request.params.arguments) }
    else if (request.params?.name === 'inbox_press') {
      const press = request.params.arguments?.press
      assert.ok(press)
      presses.push(press)
      const applied = applyPress(state.ledger, state.lastActions[press.id], press, {
        now: Date.now(),
        turnsStarted: 1,
        extraSteps: [],
        comparePage: '/plugin/dist/compare-page.html',
      })
      assert.ok(!('stale' in applied))
      state.ledger = applied.ledger
      if (applied.last) state.lastActions[press.id] = applied.last
      result = {
        structuredContent: {
          view: tabView(request.params.arguments),
          copy: null,
          error: null,
          note: null,
          ...(isUnconfirmed ? { delivery: 'unconfirmed' } : {}),
        },
      }
    } else throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
    queueMicrotask(() => {
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } }))
      if (request.params?.name === 'inbox_press') pressesAnswered++
    })
  }
  const root = document.getElementById('app')!
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n++) await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(ready())
  }
  try {
    await import('../src/tab')
    await until(() => buttons(root).some(b => b.textContent === 'Reply'))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    await until(() => presses.length === 1)
    assert.deepEqual(presses[0], { action: 'explain', id: 'i1' })
    assert.equal(state.ledger.items[0]?.id, 'i1')
    assert.equal(state.lastActions.i1?.kind, 'talk')
    named(root, 'Reply').click()
    const input = root.querySelector('input')!
    assert.ok(input)
    assert.ok(document.activeElement === input, 'the reply field has focus')
    assert.deepEqual(
      buttons(root)
        .map(b => b.textContent)
        .filter(label => ['Run tests', 'Done', 'Reply', 'Explain'].includes(label ?? '')),
      [],
    )
    named(root, 'Cancel').focus()
    named(root, 'Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    named(root, 'Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    assert.equal(presses.length, 1)
    named(root, 'Send').click()
    assert.equal(presses.length, 1)
    assert.ok(root.querySelector('input') === input, 'the reply field was replaced')
    input.value = '  Waiting for access  '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    named(root, 'Cancel').click()
    assert.ok(root.querySelector('input') === null, 'the reply field is still drawn')
    named(root, 'Reply').click()
    assert.equal(root.querySelector('input')!.value, '  Waiting for access  ')
    assert.ok(document.activeElement === root.querySelector('input'), 'the reply field has focus')
    named(root, 'Send').click()
    await until(() => state.lastActions.i1?.kind === 'handoff' && root.querySelector('input') === null)
    assert.deepEqual(presses, [
      { action: 'explain', id: 'i1' },
      { action: 'type', id: 'i1', text: 'Waiting for access' },
    ])
    assert.equal(state.ledger.items[0]?.id, 'i1')
    assert.ok(root.querySelector('input') === null, 'the reply field is still drawn')

    const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    await until(() => root.querySelector('.row.selected') === null)
    root.querySelector<HTMLElement>('.row .line')!.click()
    await pause(PRESS_GUARD_MS + 50)
    named(root, 'Reply').click()
    const unconfirmed = root.querySelector('input')!
    unconfirmed.value = 'Still blocked'
    unconfirmed.dispatchEvent(new Event('input', { bubbles: true }))
    isUnconfirmed = true
    named(root, 'Send').click()
    await until(() => pressesAnswered === 3 && root.querySelector('input') === null)
    isUnconfirmed = false
    named(root, 'Reply').click()
    const held = root.querySelector('input')!
    assert.equal(held.value, 'Still blocked')
    const unconfirmedAt = state.lastActions.i1!.at
    state.ledger = recordClose(CODEX, state.ledger, { id: 'i1', reason: 'the build passed' }, unconfirmedAt + 1).ledger
    await pause(POLL_MS + 100)
    assert.ok(root.querySelector('input') === held, 'the reply field was replaced')
    assert.equal(held.value, 'Still blocked')
    assert.ok(document.activeElement === held, 'the reply field has focus')
    assert.match(root.textContent ?? '', /Closed by Codex: the build passed/)
    assert.deepEqual(
      buttons(root)
        .map(b => b.textContent)
        .filter(label => label === 'Cancel' || label === 'Discard'),
      ['Discard'],
    )
    named(root, 'Discard').click()
    assert.ok(root.querySelector('input') === null, 'the reply field is still drawn')
    await until(() => !buttons(root).some(b => b.textContent === 'Reply' || b.textContent === 'Discard'))
    assert.doesNotMatch(root.textContent ?? '', /the build passed/)
    await pause(POLL_MS + 100)
    assert.doesNotMatch(root.textContent ?? '', /the build passed/)
    assert.equal(presses.length, 3)

    state.ledger = recordItem(CODEX, state.ledger, { kind: 'task', ask: 'Tag the release' }, Date.now()).ledger
    await pause(POLL_MS + 100)
    root.querySelector<HTMLElement>('.row .line')!.click()
    await pause(PRESS_GUARD_MS + 50)
    named(root, 'Done').click()
    await until(() => buttons(root).some(b => b.textContent === 'Undo'))
    const tabNamed = (label: string) =>
      [...root.querySelectorAll<HTMLElement>('button.tab')].find(
        b => b.querySelector('.tab-word')?.textContent === label,
      )!
    const realNow = Date.now
    Date.now = () => realNow() + SETTLED_MS
    try {
      await pause(POLL_MS + 100)
      assert.match(root.querySelector('.row.settled')?.textContent ?? '', /Tag the release/)
      assert.ok(root.querySelector('.key.undo:not(.spent)') === null, 'Undo is still offered')
      assert.ok(root.querySelector('.row.settled .key.undo.spent'))
      tabNamed('Finds').click()
      tabNamed('Asks').click()
      assert.ok(root.querySelector('.row.settled') === null, 'a settled row is still drawn')
      await pause(POLL_MS + 100)
      assert.ok(root.querySelector('.row.settled') === null, 'a settled row is still drawn')

      state.ledger = recordItem(CODEX, state.ledger, { kind: 'task', ask: 'Publish the notes' }, Date.now()).ledger
      const notes = state.ledger.items.find(i => i.ask === 'Publish the notes')!.id
      const doneElsewhere = applyPress(
        state.ledger,
        undefined,
        { action: 'done', id: notes },
        {
          now: Date.now(),
          turnsStarted: 1,
          extraSteps: [],
          comparePage: '/plugin/dist/compare-page.html',
        },
      )
      assert.ok(!('stale' in doneElsewhere))
      state.ledger = doneElsewhere.ledger
      if (doneElsewhere.last) state.lastActions[notes] = doneElsewhere.last
      Date.now = () => realNow() + 2 * SETTLED_MS + 4 * POLL_MS
      await pause(POLL_MS + 100)
      const notesRow = [...root.querySelectorAll('.row.settled')].find(r =>
        /Publish the notes/.test(r.textContent ?? ''),
      )
      assert.ok(notesRow)
      assert.ok(notesRow.querySelector('.key.undo:not(.spent)') === null, 'Undo is still offered')
      assert.ok(notesRow.querySelector('.key.undo.spent'))

      state.presence = { ...state.presence, lastTypedMessageAt: Date.now() }
      await pause(POLL_MS + 100)
      assert.doesNotMatch(root.querySelector('.row.settled')?.textContent ?? '', /Publish the notes/)
      assert.match(root.textContent ?? '', /3 closed/)
    } finally {
      Date.now = realNow
    }
  } finally {
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
