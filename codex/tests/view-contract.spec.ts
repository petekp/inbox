import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { h, render } from 'preact'
import { NO_HOLDS } from '../../hooks/timing'
import type { Session } from '../../types'
import { contractSessions } from '../../tests/view-contract-sessions'
import { drawnGaps, missingTexts, rowTexts, statusFoldIds, statusTexts } from '../../tests/view-contract'
import type { Expected } from '../../tests/view-contract'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'

const DAY = 86_400_000
const WIDE_ROOM = 1000
const TAB_CSS = new URL('../src/tab-css/', import.meta.url)
const ANSWER_W = 60

function installPage(): () => void {
  const window = new Window()
  window.document.body.innerHTML = '<div id="app"></div>'
  const style = window.document.createElement('style')
  style.textContent = readdirSync(TAB_CSS)
    .map(file => readFileSync(new URL(file, TAB_CSS), 'utf8'))
    .join('\n')
  window.document.head.appendChild(style)
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { get: () => true })
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => WIDE_ROOM, configurable: true })
  window.HTMLElement.prototype.getBoundingClientRect = () => new window.DOMRect(0, 0, ANSWER_W, 20)
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

  return () => {
    for (const [key, d] of previous)
      if (d) Object.defineProperty(globalThis, key, d)
      else delete (globalThis as Record<string, unknown>)[key]
  }
}

const INLINE_TAGS = new Set(['STRONG', 'EM', 'CODE', 'A', 'S', 'B', 'I', 'DEL'])

const isHidden = (node: Node): boolean =>
  node.nodeType === node.ELEMENT_NODE && getComputedStyle(node as Element).display === 'none'

const textOf = (node: Node): string => {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? ''
  if (isHidden(node)) return ''
  const inner = [...node.childNodes].map(textOf).join('')

  return INLINE_TAGS.has(node.nodeName) ? inner : ` ${inner} `
}

const failures = (expected: Expected[], drawn: string) => ({
  missing: missingTexts('codex', expected, drawn),
  gapsDrawn: drawnGaps('codex', expected, drawn),
})

test('the Codex tab draws every field of each open row and of the Status page with its folds open', async () => {
  const restore = installPage()
  try {
    const { tabState, selection, statusUnfolded, root } = await import('../src/tab-state')
    const { stepLists } = await import('../src/tab-list')
    const { NeedsYou, Findings } = await import('../src/tab-groups')
    const { StatusTab } = await import('../src/tab-status')
    const { TabBar } = await import('../src/tab-chrome')
    const { settleAnswers } = await import('../src/tab-ask-tree')
    const now = Date.now()
    const viewFor = (session: Session): TabView => ({
      ...viewOf({ ...emptyState('contract'), ...session }, now, { ...NO_HOLDS, shownSince: now - DAY }),
      thread: 'contract',
      devPage: '',
      isFetchingPrs: false,
      isGhMissing: false,
    })
    tabState.shownSince = now - DAY
    const drawn = (v: TabView, tab: 'needsYou' | 'findings' | 'overview') => {
      tabState.view = v
      tabState.tab = tab
      const step = stepLists(v)
      tabState.lastBanners = step.banners
      const draw = () => {
        const page =
          tab === 'overview'
            ? h(StatusTab, { v, drawn: step.status! })
            : h(tab === 'findings' ? Findings : NeedsYou, { v, lists: step.lists, now })
        render(h('div', null, h(TabBar, { v }), page), root)
      }
      draw()
      if (settleAnswers(root)) draw()

      return textOf(root)
    }
    const results = contractSessions(now, 'Codex').flatMap(({ name, session }) => {
      const v = viewFor(session)
      const tabs = [
        ['needsYou', [...v.needsYou.questions, ...v.needsYou.tasks]],
        ['findings', v.findings.rows],
      ] as const
      const rows = tabs.flatMap(([tab, list]) =>
        list.map(row => {
          selection[tab] = { id: row.id, openedAt: now }

          return { name, part: row.id, ...failures(rowTexts(row, { look: 'codex', now }), drawn(v, tab)) }
        }),
      )
      const open = statusFoldIds(v.statusPage)
      statusUnfolded.clear()
      for (const id of open) statusUnfolded.add(id)
      const expected = statusTexts(v.statusPage, { look: 'codex', now }, id => open.includes(id))
      const status = { name, part: 'Status', ...failures(expected, drawn(v, 'overview')) }

      return [...rows, status]
    })
    assert.deepEqual(
      results,
      results.map(r => ({ ...r, missing: [], gapsDrawn: [] })),
    )
  } finally {
    restore()
  }
})
