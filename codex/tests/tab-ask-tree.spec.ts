import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { render } from 'preact'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import { askTree } from '../src/tab-ask-tree'
import { inboxToolText } from '../src/texts'

test('the Codex tab draws a question’s earlier answer on the line after its context, with the answer bold', () => {
  const now = 1_000_000
  const row = sessionView(demoSession(now, 'Codex'), now, SETTLED_MS).needsYou.questions.find(r => r.id === 'd11')
  assert.ok(row)
  const window = new Window()
  Object.assign(globalThis, { document: window.document })
  const root = window.document.createElement('div')
  render(askTree(row, [], null, () => false).body!(), root as never)
  const lines = [...root.querySelectorAll('.context-line')]
  assert.deepEqual(
    lines.map(l => l.textContent),
    [row.contextLine, 'You answered Flick 3 days ago, in glasses-app, to “Which gesture should clear a glance?”'],
  )
  assert.equal(lines[1]?.querySelector('strong')?.textContent, 'Flick')
})

test('the inbox tool’s answer to the model leaves the earlier answer out', () => {
  const now = 1_000_000
  const view = sessionView(demoSession(now, 'Codex'), now, SETTLED_MS)
  assert.ok(view.needsYou.questions.some(r => r.earlierLine))
  assert.doesNotMatch(inboxToolText(view), /Which gesture should clear a glance|You answered/)
})
