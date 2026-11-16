import { expect, test } from 'bun:test'

import { drawPanel } from '../src/panel'
import { NOW, onPage, style, taskNode, taskScreen } from './panel-harness'

const MIN = 60_000

test('the panel reports done tasks represented by a collapsed done row as shown', () => {
  const screen = taskScreen(
    Array.from({ length: 5 }, (_, n) =>
      taskNode(`s${n + 1}`, `Piece ${n + 1}`, 'done', NOW - (n < 2 ? MIN : 40 * MIN)),
    ),
    { lastLookAt: NOW - 30 * MIN, children: [], askSubjects: {} },
  )
  expect(screen.view.statusPage.rows.map(r => r.kind)).toEqual(['subject', 'subject', 'done-fold'])
  expect(drawPanel(screen, onPage, 80, NOW, style, 40).shownSubjects.sort()).toEqual(['s1', 's2', 's3', 's4', 's5'])
})
