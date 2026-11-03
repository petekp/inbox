import { expect, test } from 'claude-code/testing'
import type { SiteScroll, UiScrollInput } from 'claude-code'
import { noteStatusDrawn, probedScroll, takeShownRows } from '../hooks/pane-status-shown'
import type { StatusEngine } from '../hooks/pane-status-shown'
import { statusPage } from '../hooks/status-page'
import type { StatusPage } from '../hooks/status-page'
import { minutes } from '../evals/status-replay'
import { sessionOf, statusOf, subject } from './status-evals-scenes'

const PIECES = 40
const ROW_LINES = 2
const ABOVE_LIST = 4
const WINDOW: SiteScroll = { offset: 0, bodyRows: 12 }
const CONTENT_ROWS = ABOVE_LIST + PIECES * ROW_LINES

const changedPage = (): StatusPage => {
  const o = statusOf(
    Array.from({ length: PIECES }, (_, n) => subject(`s${n + 1}`, 'working', `Piece ${n + 1}`, 'under way', 10)),
    { lastLookAt: minutes(0) },
  )
  return statusPage(sessionOf(o, [], 20), minutes(20))
}

/** An engine that lays each subject row out `ROW_LINES` tall under `ABOVE_LIST` lines, and resolves a key scroll as the terminal does. */
function engine(at: () => number) {
  const tops = new Map(Array.from({ length: PIECES }, (_, n) => [`status-s${n + 1}`, ABOVE_LIST + n * ROW_LINES]))
  const scrollToTop = async (key: string) => {
    const top = tops.get(key)
    if (top === undefined) return true
    const input = {
      component: 'Pane',
      requestId: 'inbox',
      offset: Math.min(top, CONTENT_ROWS - WINDOW.bodyRows),
      by: 0,
      bodyRows: WINDOW.bodyRows,
      contentRows: CONTENT_ROWS,
      origin: { kind: 'plugin', name: 'inbox' },
    } satisfies UiScrollInput
    probedScroll(input)
    return true
  }
  return { scrollToTop, now: async () => at() } satisfies StatusEngine
}

const settle = async () => {
  for (let n = 0; n < PIECES * 10; n++) await Promise.resolve()
}

test('the terminal counts a Status row as shown when its first line was in the pane’s window at any point in the look, and the last screenful only once scrolled to the end', async () => {
  let now = 1000
  const $ = engine(() => now)
  const page = changedPage()
  const draw = (offset: number) =>
    noteStatusDrawn($, {
      look: 'terminal',
      page,
      unfolded: [],
      scroll: { ...WINDOW, offset },
      layout: 'same',
      now,
    })
  takeShownRows()

  draw(0)
  await settle()
  const firstScreen = takeShownRows()
  expect(Object.keys(firstScreen)).toEqual(['s1', 's2', 's3', 's4'])

  draw(0)
  now = 2000
  draw(40)
  const scrolled = takeShownRows() as Record<string, number>
  expect(Object.keys(scrolled)).toEqual(['s1', 's2', 's3', 's4', 's19', 's20', 's21', 's22', 's23', 's24'])
  expect(scrolled.s1).toBe(1000)
  expect(scrolled.s19).toBe(2000)

  draw(CONTENT_ROWS - WINDOW.bodyRows - 1)
  expect(Object.keys(takeShownRows())).not.toContain('s40')
  draw(CONTENT_ROWS - WINDOW.bodyRows)
  expect(Object.keys(takeShownRows())).toContain('s40')
})

test('a desktop drawing of the Status counts every subject, and a look starts with no rows shown', () => {
  const $ = engine(() => 0)
  noteStatusDrawn($, {
    look: 'desktop',
    page: changedPage(),
    unfolded: [],
    scroll: WINDOW,
    layout: 'same',
    now: 0,
  })

  expect(takeShownRows()).toBe('all')
  expect(takeShownRows()).toEqual({})
})
