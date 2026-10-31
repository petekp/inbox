import { expect, test } from 'bun:test'

import { applyStatus, parseStatus } from '../../hooks/status'
import { SETTLED_MS, NO_HOLDS, STATUS_TEXT_LINES, LOOK_DASH } from '../../hooks/view'
import { sessionView } from '../../hooks/session'
import { cellWidth } from '../../hooks/text'
import { render } from '../src/panel'
import type { Style } from '../src/panel'
import { emptyState } from '../src/state'
import { drawn, ESC, labelOf, NOW, onPage, screenOf, strip, style, text } from './panel-harness'

const toneNamed: Style = { ...style, tone: (name, s) => `<${name}>${s}</${name}>` }

test('the Status page shows the head’s title and description, then its rows in order, each subject’s marks in the head’s column, where it stands under its name and its was line under that, and Last seen in the middle of its dashed rule with a blank line above and below it', () => {
  const screen = screenOf()
  const page = screen.view.statusPage
  const lines = text(screen, onPage).split('\n')
  const at = (s: string) => lines.findIndex(l => l.includes(s))
  const order = [page.head!.title, page.head!.description!, ...page.rows.map(labelOf)].map(at)
  expect(order.every(n => n >= 0)).toBe(true)
  expect(order).toEqual([...order].sort((a, b) => a - b))
  const headAt = lines[at(page.head!.title)]!.search(/\S/)
  expect(lines[at(page.head!.description!)]!.search(/\S/)).toBe(headAt)
  const subjects = page.rows.flatMap(r => (r.kind === 'subject' ? [r] : []))
  for (const row of subjects) expect(lines[at(row.name)]!.search(/\S/)).toBe(headAt)
  const withWas = subjects.filter(r => r.was !== null && r.text !== null)
  expect(withWas.length).toBeGreaterThan(0)
  for (const row of withWas) {
    expect(lines[at(row.name) + 1]).toContain(row.text!)
    expect(lines[at(row.name) + 2]).toContain(`was: ${row.was}`)
  }
  const seenAt = at(' Last seen ')
  const [left, right] = lines[seenAt]!.trim().split(' Last seen ')
  expect(left!.length - right!.length).toBeLessThanOrEqual(1)
  expect(LOOK_DASH).not.toBe('─')
  expect(left).toMatch(new RegExp(`^${LOOK_DASH}+$`))
  expect([lines[seenAt - 1], lines[seenAt + 1]].map(l => l!.trim())).toEqual(['', ''])
})

test('on the Status page, Last seen at the end of the list leaves no blank line below it', () => {
  const screen = screenOf()
  const page = screen.view.statusPage
  const through = page.rows.findIndex(r => r.kind === 'look')
  const rows = page.rows.slice(0, through + 1).map(r => ({ ...r, isLast: r.kind === 'look' }))
  const ending = { ...screen, view: { ...screen.view, statusPage: { ...page, rows } } }
  const lines = text(ending, onPage).split('\n')
  const seenAt = lines.findIndex(l => l.includes(' Last seen '))

  expect(lines[seenAt - 1]!.trim()).toBe('')
  expect(lines[seenAt + 1]).not.toBe(undefined)
  expect(lines[seenAt + 1]!.trim()).not.toBe('')
})

test('on the Status page, the rows under a subject hang from its mark, ├─ for each and └─ for the last, and the line runs beside each wrapped line', () => {
  const lines = text(screenOf(), onPage, 28).split('\n')
  const at = (s: string) => lines.findIndex(l => l.includes(s))
  const [subject, first, mid, last, next] = [
    at('Dismiss gesture'),
    at('Review the'),
    at('Tune how hard'),
    at('Time the'),
    at('Fade-out'),
  ]
  const col = lines[subject]!.search(/\S/)
  const glyphs = (from: number, to: number) => lines.slice(from, to).map(l => l.slice(col, col + 2))

  expect(subject).toBeLessThan(first)
  expect(glyphs(subject + 1, first).every(g => g.startsWith('│'))).toBe(true)
  expect(glyphs(first, mid)).toEqual(['├─', ...Array<string>(mid - first - 1).fill('│ ')])
  expect(glyphs(mid, last)).toEqual(['├─', ...Array<string>(last - mid - 1).fill('│ ')])
  expect(last - mid).toBeGreaterThan(1)
  expect(glyphs(last, next)).toEqual(['└─', ...Array<string>(next - last - 1).fill('  ')])
})

test('on the Status page, a row’s stall word follows its name on the line of its last word, at every width, and running work and work waiting on someone else show none', () => {
  const wide = text(screenOf(), onPage, 80).split('\n')
  expect(wide.some(l => l.includes('Tune how hard a pinch must be · waiting'))).toBe(true)
  expect(wide.some(l => l.includes('Time the fade-out · finished'))).toBe(true)
  expect(wide.some(l => l.includes('Watch the pairing log') && !l.includes(' · '))).toBe(true)
  expect(wide.some(l => l.includes('Glasses trial') && !l.includes(' · '))).toBe(true)

  for (const width of [26, 28, 30, 34, 40, 50]) {
    const lines = text(screenOf(), onPage, width).split('\n')
    for (const word of ['waiting', 'finished'])
      expect(lines.filter(l => l.includes(` ${word}`) && !l.includes('waits')).every(l => /\S · /.test(l))).toBe(true)
  }
})

test('on the Status page, a rule from the text column sets each item apart, with none inside a subject’s tree or beside the look line', () => {
  const lines = text(screenOf(), onPage, 40).split('\n')
  const subject = lines.find(l => l.includes('Dismiss gesture'))!
  const rule = new RegExp(`^ {${subject.indexOf('Dismiss')}}─+$`)
  const rowsAfterRules = lines.flatMap((l, n) => (rule.test(l) ? [lines[n + 1]!] : []))

  expect(rowsAfterRules).toHaveLength(4)
  for (const [n, row] of ['Flick option', 'Dismiss gesture', 'Fade-out', 'more done'].entries())
    expect(rowsAfterRules[n]).toContain(row)
})

test('on the Status page, a subject’s name stays plain, and where it stands goes dim under it, wrapped to three lines and cut with an ellipsis past them', () => {
  const name = 'Help text for every greeting command'
  const where = 'being written with examples, defaults, descriptions, environment variables, configuration precedence'
  const state = emptyState('s1')
  state.ledger = {
    ...state.ledger,
    overview: applyStatus(null, parseStatus(`NEW: working | ${name} | ${where}`)!, NOW, new Set()),
  }
  const screen = screenOf({ view: sessionView(state, NOW, SETTLED_MS, true, NO_HOLDS) })
  const raw = drawn(screen, onPage, 34)
  const first = raw.findIndex(l => strip(l).includes('Help text'))
  const subject = raw.slice(first, first + 2 + STATUS_TEXT_LINES + 1).map(strip)

  expect(subject.slice(0, 3)).toEqual([
    ' ◐ Help text for every greeting',
    '   command',
    '   being written with examples,',
  ])
  expect(subject[1 + STATUS_TEXT_LINES]).toMatch(/…$/)
  expect(subject[2 + STATUS_TEXT_LINES]?.trim() ?? '').not.toMatch(/^[a-z]/)
  expect(raw[first + 1]).not.toContain(ESC)
  expect(raw[first + 2]).toContain(`${ESC}2mbeing`)
  const wide = text(screen, onPage, 200).split('\n')
  expect(wide[wide.findIndex(l => l.includes(name)) + 1]?.trim()).toBe(where)
})

test('each subject’s mark takes its tone, and a mark with no tone is muted', () => {
  const screen = screenOf()
  const subjects = screen.view.statusPage.rows.flatMap(r => (r.kind === 'subject' ? [r] : []))
  const lines = render(screen, onPage, 200, NOW, toneNamed)
  const lineOf = (s: string) => lines.find(l => l.includes(s))!
  for (const row of subjects.filter(r => r.tone !== null))
    expect(lineOf(row.name)).toContain(`<${row.tone}>${row.mark}</${row.tone}> `)
  const muted = subjects.find(r => r.tone === null && !r.isRunning)!
  expect(lineOf(muted.name)).toContain(`${ESC}2m${muted.mark}${ESC}22m `)
})

test('a Status page with nothing yet reads its empty text', () => {
  const screen = screenOf({ view: sessionView(emptyState('s1'), NOW, SETTLED_MS, true, NO_HOLDS) })
  const { empty } = screen.view.statusPage
  expect(screen.view.statusPage.isEmpty).toBe(true)
  expect(text(screen, onPage)).toContain(empty.title)
  expect(text(screen, onPage)).toContain(empty.hint)
})

test('no line on the Status page is wider than the panel', () => {
  const screen = screenOf()
  for (const width of [30, 50, 60, 80, 120])
    for (const line of drawn(screen, onPage, width)) expect(cellWidth(strip(line))).toBeLessThanOrEqual(width)
})
