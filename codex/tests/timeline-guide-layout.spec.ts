import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import type { TaskNode, TaskProgressSegments } from '../../types'

const now = 1_000_000
const segments: TaskProgressSegments = { total: 1, done: 0, working: 1, stalled: 0, waiting: 0, queued: 0 }
const task = (id: string, parentId: string | null = null): TaskNode => ({
  id,
  parentId,
  status: 'working',
  weight: 1,
  title: id,
  detail: '',
  notes: [],
  createdAt: now,
  updatedAt: now,
  history: [],
})

test('the Codex Timeline guide stays on its connector stem column', () => {
  const css = readFileSync(new URL('../src/tab-css/status-page.css', import.meta.url), 'utf8')
  assert.match(css, /--timeline-guide-stem-offset:\s*0\.59em;/)
  assert.match(
    css,
    /left:\s*calc\(var\(--tree-x\)\s*\+\s*var\(--timeline-guide-stem-offset\)\s*\+\s*var\(--timeline-guide-depth,\s*0\)\s*\*\s*var\(--step\)\);/,
  )
})

test('a folded Codex Timeline branch has no visible child guide', async context => {
  const window = new Window()
  Object.assign(globalThis, {
    window,
    document: window.document,
    Event: window.Event,
    matchMedia: window.matchMedia.bind(window),
  })
  context.after(() => window.happyDOM.close())

  const { timelineData, timelinePage } = await import('../../hooks/timeline-page')
  const { timelineRowForm } = await import('../src/rows')
  const data = timelineData([task('root'), task('child', 'root')], segments, {}, [], now)
  const expandedRoot = timelinePage(data, 'root', []).rows[0]!
  const foldedRoot = timelinePage(data, 'root', ['root']).rows[0]!

  assert.equal(foldedRoot.hasChildren, true)
  assert.equal(foldedRoot.hasVisibleChildren, false)
  assert.equal(timelineRowForm(expandedRoot, foldedRoot).childGuide, null)
})
