import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { h, render } from 'preact'
import { statusPage } from '../../hooks/status-page'
import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
import { emptySession } from '../../hooks/session-files'
import type { Subject } from '../../types'

const window = new Window()
const media = window.matchMedia('(prefers-reduced-motion: reduce)')
Object.assign(globalThis, {
  window,
  document: window.document,
  Event: window.Event,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  sessionStorage: window.sessionStorage,
  matchMedia: () => media,
  getComputedStyle: window.getComputedStyle.bind(window),
})
after(() => window.happyDOM.close())

const NOW = 1_000_000_000
const MIN = 60_000

const working = (n: number, changedAgo: number): Subject => ({
  id: `s${n}`,
  name: `Piece ${n}`,
  status: 'working',
  text: 'under way',
  was: null,
  merged: null,
  createdAt: NOW - 90 * MIN,
  changedAt: NOW - changedAgo * MIN,
  closedAt: null,
  into: null,
})

test('the Codex tab draws the New heading with when the person last looked over the changed work, and Earlier over the rest', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const { StatusTab } = await import('../src/tab-status')
  const overview = {
    ...EMPTY_SESSION_STATUS,
    subjects: [working(1, 60), working(2, 5)],
    lastLookAt: NOW - 30 * MIN,
  }
  const page = statusPage({ ledger: { overview, items: [] }, presence: emptySession().presence }, NOW)
  const root = document.getElementById('app')!
  render(h(StatusTab, { page }), root as unknown as Element)

  const lines = Array.from(root.querySelectorAll('.list > .row'), el => el.textContent ?? '')
  assert.deepEqual(
    lines.map(l => l.match(/^New since you looked 30m ago$|^Earlier$|Piece \d/)?.[0]),
    ['New since you looked 30m ago', 'Piece 2', 'Earlier', 'Piece 1'],
  )
})
