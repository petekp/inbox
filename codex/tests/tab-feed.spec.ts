import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { h, render } from 'preact'
import { Window } from 'happy-dom'

import { applyFeed, parseFeed } from '../../hooks/feed'
import { EMPTY } from '../../hooks/ledger'
import { viewOf } from '../src/core'
import { emptyState } from '../src/state'

const window = new Window()
Object.assign(globalThis, {
  window,
  document: window.document,
  Event: window.Event,
  matchMedia: window.matchMedia.bind(window),
})
const [{ Findings }, { stepLists }, { tabState }] = await Promise.all([
  import('../src/tab-groups'),
  import('../src/tab-list'),
  import('../src/tab-state'),
])
const { TabBar } = await import('../src/tab-chrome')
after(() => window.happyDOM.close())

test('the Codex tab draws feed entries under Progress', () => {
  const now = Date.now()
  const state = emptyState('s1')
  state.ledger = applyFeed(
    EMPTY,
    parseFeed(
      JSON.stringify({
        version: 1,
        source: 'herdr-meta-patrol',
        writtenAt: now,
        entries: [
          {
            key: 'machine/worker',
            state: 'working',
            title: 'Implement the progress feed',
            detail: 'Update state.',
            at: now,
          },
        ],
      }),
    )!,
    now,
  )
  state.shownTab = 'findings'
  const view = { ...viewOf(state, now), thread: 's1', devPage: '', isFetchingPrs: false, isGhMissing: false }
  tabState.view = view
  tabState.tab = 'findings'
  tabState.shownSince = now
  tabState.lastLists = null
  const lists = stepLists(view).lists
  const root = document.createElement('div')
  render(h(Findings, { v: view, lists, now }), root)
  assert.match(root.textContent ?? '', /Progress/)
  assert.match(root.textContent ?? '', /Implement the progress feed/)
})

test('the Codex tab draws untracked live work as a warning banner', () => {
  const now = Date.now()
  const state = emptyState('s1')
  state.ledger.untrackedWork = [
    {
      key: 'herdr/local/meta-worker/untracked-work',
      title: 'meta-worker',
      detail: 'working agent has no open item',
      at: now,
      feedSource: '/feed/herdr-local.json',
    },
  ]
  const view = { ...viewOf(state, now), thread: 's1', devPage: '', isFetchingPrs: false, isGhMissing: false }
  tabState.view = view
  tabState.tab = 'needsYou'
  const root = document.createElement('div')
  render(h(TabBar, { v: view }), root)
  assert.match(root.textContent ?? '', /Untracked work/)
  assert.match(root.textContent ?? '', /meta-worker/)
})
