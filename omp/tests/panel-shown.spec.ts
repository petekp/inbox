import { expect, test } from 'bun:test'

import { statusListRows } from '../../hooks/status-page'
import { drawPanel } from '../src/panel'
import { NOW, onPage, screenOf, strip, style } from './panel-harness'

test('the panel reports as shown the Status subject rows whose first line is in its window, at every scroll', () => {
  const screen = screenOf()
  const subjects = statusListRows(screen.view.statusPage).flatMap(r => (r.kind === 'subject' ? [r] : []))
  const drawnAt = (pageTop: number) => drawPanel(screen, { ...onPage, pageTop }, 80, NOW, style, 14)
  const last = drawnAt(1000).pageTop
  expect(last).toBeGreaterThan(0)

  const everShown = new Set<string>()
  for (let top = 0; top <= last; top++) {
    const drawn = drawnAt(top)
    const lines = drawn.lines.map(strip)
    const visible = subjects.filter(r => lines.some(l => l.includes(r.name.split(' ').slice(0, 2).join(' '))))
    expect(drawn.shownSubjects).toEqual(visible.map(r => r.id))
    for (const id of drawn.shownSubjects) everShown.add(id)
  }
  expect(drawnAt(0).shownSubjects.length).toBeLessThan(subjects.length)
  expect([...everShown].sort()).toEqual(subjects.map(r => r.id).sort())
  expect(drawPanel(screen, { ...onPage, isHelpShown: true }, 80, NOW, style, 14).shownSubjects).toEqual([])
})
