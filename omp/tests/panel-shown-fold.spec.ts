import { expect, test } from 'bun:test'

import { statusPage } from '../../hooks/status-page'
import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
import { emptySession } from '../../hooks/session-files'
import type { Subject } from '../../types'
import { drawPanel } from '../src/panel'
import { NOW, onPage, screenOf, style } from './panel-harness'

const MIN = 60_000

const closed = (n: number): Subject => ({
  id: `s${n}`,
  name: `Piece ${n}`,
  status: 'done',
  text: 'merged',
  was: null,
  merged: null,
  createdAt: NOW - 60 * MIN,
  changedAt: NOW - n * MIN,
  closedAt: NOW - n * MIN,
  into: null,
})

test('the panel reports as shown the work a named fold stands for while the fold is in its window', () => {
  const overview = { ...EMPTY_SESSION_STATUS, subjects: [1, 2, 3, 4, 5].map(closed), lastLookAt: NOW - 30 * MIN }
  const page = statusPage({ ledger: { overview, items: [] }, presence: emptySession().presence }, NOW)
  expect(page.rows.map(r => r.kind)).toEqual(['subject', 'subject', 'fold'])
  const screen = screenOf()
  const withFold = { ...screen, view: { ...screen.view, statusPage: page } }

  expect(drawPanel(withFold, onPage, 80, NOW, style, 40).shownSubjects.sort()).toEqual(['s1', 's2', 's3', 's4', 's5'])
})
