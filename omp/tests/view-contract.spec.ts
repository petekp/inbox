import { expect, test } from 'bun:test'
import { sessionView } from '../../hooks/session-view'
import { NO_HOLDS, SETTLED_MS } from '../../hooks/timing'
import type { Session } from '../../types'
import { contractSessions } from '../../tests/view-contract-sessions'
import { drawnGaps, missingTexts, rowTexts, statusFoldIds, statusTexts } from '../../tests/view-contract'
import type { Expected } from '../../tests/view-contract'
import { INITIAL_UI } from '../src/panel'
import type { PanelScreen, PanelUi } from '../src/panel'
import { NOW, text } from './panel-harness'

const DAY = 86_400_000
const WIDE = 200

const screenOf = (session: Session): PanelScreen => ({
  view: sessionView(session, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - DAY }),
  modelName: 'Claude Sonnet 4.5',
  isGhMissing: false,
  isFetchingPrs: false,
  stop: null,
  version: '1.2.3',
})

const BOX_EDGES = /[│╭╮╰╯]/g

const failures = (expected: Expected[], boxed: string) => {
  const drawn = boxed.replace(BOX_EDGES, ' ')

  return {
    missing: missingTexts('omp', expected, drawn),
    gapsDrawn: drawnGaps('omp', expected, drawn),
  }
}

for (const { name, session } of contractSessions(NOW, 'Claude')) {
  test(`the omp panel draws every field of each open row: ${name}`, () => {
    const screen = screenOf(session)
    const { needsYou, findings } = screen.view
    const tabs = [
      ['needsYou', [...needsYou.questions, ...needsYou.tasks]],
      ['findings', findings.rows],
    ] as const
    for (const [tab, rows] of tabs)
      for (const row of rows) {
        const ui: PanelUi = { ...INITIAL_UI, tab, selectedId: row.id }
        const drawn = text(screen, ui, WIDE)
        expect({ row: row.id, ...failures(rowTexts(row, { look: 'omp', now: NOW }), drawn) }).toEqual({
          row: row.id,
          missing: [],
          gapsDrawn: [],
        })
      }
  })

  test(`the omp panel draws every field of the Status page with its folds open: ${name}`, () => {
    const screen = screenOf(session)
    const page = screen.view.statusPage
    const open = statusFoldIds(page)
    const drawn = text(screen, { ...INITIAL_UI, tab: 'overview', statusUnfolded: open }, WIDE)
    const expected = statusTexts(page, { look: 'omp', now: NOW }, id => open.includes(id))
    expect(failures(expected, drawn)).toEqual({ missing: [], gapsDrawn: [] })
  })
}
