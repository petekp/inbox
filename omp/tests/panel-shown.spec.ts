import { expect, test } from 'bun:test'

import { seenSubjectIds, statusListRows } from '../../hooks/status-page'
import { drawPanel } from '../src/panel'
import { labelOf, NOW, onPage, screenOf, strip, style } from './panel-harness'

test('the panel reports as shown the Status subject rows whose first line is in its window, at every scroll', () => {
  const screen = screenOf()
  const rows = statusListRows(screen.view.statusPage)
  const ids = rows.flatMap(seenSubjectIds)
  const drawnAt = (pageTop: number) => drawPanel(screen, { ...onPage, pageTop }, 80, NOW, style, 14)
  const last = drawnAt(1000).pageTop
  expect(last).toBeGreaterThan(0)

  const everShown = new Set<string>()
  for (let top = 0; top <= last; top++) {
    const drawn = drawnAt(top)
    const lines = drawn.lines.map(strip)
    const visible = rows.filter(r => lines.some(l => l.includes(labelOf(r))))
    expect(drawn.shownSubjects).toEqual(visible.flatMap(seenSubjectIds))
    for (const id of drawn.shownSubjects) everShown.add(id)
  }
  expect(drawnAt(0).shownSubjects.length).toBeLessThan(ids.length)
  expect([...everShown].sort()).toEqual(ids.sort())
  expect(drawPanel(screen, { ...onPage, isHelpShown: true }, 80, NOW, style, 14).shownSubjects).toEqual([])
})
