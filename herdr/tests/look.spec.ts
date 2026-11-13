import { expect, setSystemTime, test } from 'bun:test'

import { isLookFile, pressFile } from '../../hooks/herdr-press-file'
import { seenSubjectIds, statusListRows } from '../../hooks/status-page'
import { StatusLook, isPanelShown } from '../src/look'
import type { LookBlock, LookCheck, Shown } from '../src/look'
import { PRESS_LABEL } from '../src/press-file'
import { NOW } from './fixtures'
import { allOf, app, openPanel } from './gpui-stand-in'

const S = 1_000
const block = (id: string, content = id): [string, LookBlock] => [id, { subjects: [`subject ${id}`], content }]
const ROWS = new Map([block('a'), block('b'), block('c')])

function lookAt(heights: [string, number][], viewport = 100) {
  const look = new StatusLook()
  look.place.listSized(300, viewport)
  look.place.drawn(heights.map(([id]) => id))
  for (const [id, height] of heights) look.place.blockSized(id, height)

  return look
}

const scrolledList = () =>
  lookAt([
    ['a', 40],
    ['b', 40],
    ['c', 200],
  ])

const check = (look: StatusLook, at: number, c: Partial<LookCheck> = {}) =>
  look.check({
    now: NOW + at,
    sessionId: 's1',
    terminal: 't1',
    isRunning: true,
    typedAt: null,
    listInputAt: null,
    rows: ROWS,
    ...c,
  })

function point(look: StatusLook, at: number, offset = 0) {
  look.place.listPointer({ top: 100 - offset, x: 5, y: 5, at: NOW + at })
  look.place.areaPointer({ top: 100, x: 5, y: 5, at: NOW + at })
}

function runEachSecond(look: StatusLook, from: number, to: number, each: (at: number) => void = () => {}) {
  for (let at = from; at <= to; at += S) {
    each(at)
    check(look, at)
  }
}

const shownBy = (look: StatusLook) => look.close()[0]?.look.shown

test('a row the pointer keeps on screen counts from five seconds before its last check', () => {
  const look = scrolledList()
  runEachSecond(look, 0, 6 * S, at => point(look, at))
  const [ended] = look.close()
  expect(ended?.look).toEqual({
    startedAt: NOW,
    endedAt: NOW + 6 * S,
    shown: { 'subject a': NOW + S, 'subject b': NOW + S },
  })
})

test.each([
  ['an offset measured once', [S]],
  ['readings that stop after two seconds', [S, 2 * S, 3 * S]],
  ['readings five seconds apart', [S, 6 * S, 11 * S, 16 * S, 21 * S, 26 * S]],
])('%s count no row, however long a scrolled list stays on screen', (_name, readings) => {
  const look = scrolledList()
  runEachSecond(look, 0, 30 * S, at => readings.includes(at) && point(look, at))
  expect(shownBy(look)).toEqual({})
})

test('a list that fits its pane counts its rows without the pointer', () => {
  const look = lookAt(
    [
      ['a', 40],
      ['b', 40],
    ],
    200,
  )
  runEachSecond(look, 0, 5 * S)
  expect(shownBy(look)).toEqual({ 'subject a': NOW, 'subject b': NOW })
})

test.each([
  ['no change', () => {}],
  ['a wheel step', (look: StatusLook) => look.place.wheel(NOW + 4 * S)],
  ['a change of the list’s size', (look: StatusLook) => look.place.listSized(300, 120)],
  ['a change of the content above the rows', (look: StatusLook) => look.place.drawn(['x', 'a', 'b', 'c'])],
  ['a block above changing height', (look: StatusLook) => look.place.blockSized('a', 44)],
  ['a change of the row’s content', () => new Map([...ROWS, block('b', 'b changed')])],
])(
  '%s at 4 s starts the rows’ time on screen again',
  (name, change: (look: StatusLook) => LookCheck['rows'] | void) => {
    const look = scrolledList()
    let rows = ROWS
    for (let at = 0; at <= 8 * S; at += S) {
      point(look, at)
      if (at === 4 * S) rows = change(look) ?? rows
      check(look, at, { rows })
    }
    const isRestarted = name !== 'no change'
    expect(shownBy(look)?.['subject b']).toBe(isRestarted ? undefined : NOW + 3 * S)
  },
)

test('a hide ends the look at the last check that saw it, and a short look reports nothing', () => {
  const look = scrolledList()
  runEachSecond(look, 0, 6 * S, at => point(look, at))
  const [hidden] = check(look, 9 * S, { isRunning: false })
  expect(hidden?.look.endedAt).toBe(NOW + 6 * S)
  runEachSecond(look, 10 * S, 13 * S, at => point(look, at))
  expect(look.close()).toEqual([])
})

test('a typed message ends the look when it came, unless the person used the list just before', () => {
  const typedAt = NOW + 6.5 * S
  const typing = (listInputAt: number | null) => {
    const look = lookAt(
      [
        ['a', 40],
        ['b', 40],
      ],
      200,
    )
    runEachSecond(look, 0, 7 * S)
    const ended = check(look, 8 * S, { typedAt, listInputAt })
    return [...ended, ...look.close()].map(r => r.look)
  }
  expect(typing(null)).toEqual([
    { startedAt: NOW, endedAt: typedAt, shown: { 'subject a': NOW + 1.5 * S, 'subject b': NOW + 1.5 * S } },
  ])
  expect(typing(typedAt - 500).map(l => l.endedAt)).toEqual([NOW + 8 * S])
})

test('the panel shows only in the focused window’s shown tab, and under a zoom only when its own pane is zoomed', () => {
  const on = (changes: { isWindowActive?: boolean; tabId?: string; zoomed?: string | null }): Shown => {
    const { isWindowActive = true, tabId = 'tab1', zoomed = null } = changes
    return {
      isWindowActive,
      spaces: [{ active: true, tabs: [{ id: tabId, active: true, zoomed: zoomed !== null }] }],
      panes: [
        { pane: 'p-inbox', tab: 'tab1', mod: 'inbox', zoomed: zoomed === 'p-inbox' },
        { pane: 'p-agent', tab: 'tab1', zoomed: zoomed === 'p-agent' },
      ],
      ownPane: null,
    }
  }
  expect(isPanelShown('tab1', on({}))).toBe(true)
  expect(isPanelShown('tab1', on({ isWindowActive: false }))).toBe(false)
  expect(isPanelShown('tab1', on({ tabId: 'tab2' }))).toBe(false)
  expect(isPanelShown('tab1', on({ zoomed: 'p-agent' }))).toBe(false)
  expect(isPanelShown('tab1', on({ zoomed: 'p-inbox' }))).toBe(true)
})

test('the panel writes a look at the Status it showed to the session’s press folder and wakes the host', async () => {
  setSystemTime(new Date(NOW))
  const { panel, cx, paint } = await openPanel()
  panel.ui.tab = 'overview'
  const list = allOf(paint()).find(n => n.id === 'inbox-list')
  list?.listeners.get('on_size_change')?.({ width: 300, height: 5_000 }, cx)
  for (const block of list?.kids ?? []) block.listeners.get('on_size_change')?.({ width: 300, height: 20 }, cx)
  for (let at = 0; at <= 6 * S; at += S) {
    setSystemTime(new Date(NOW + at))
    panel.checkLook()
  }
  app.written = []
  app.labels = []
  await panel.close()
  const [file] = app.written
  const read = file ? pressFile(file.text) : null
  const look = read?.ok && isLookFile(read.file) ? read.file : null
  const page = panel.view?.statusPage
  const subjects = page ? statusListRows(page).flatMap(seenSubjectIds) : []
  expect(subjects.length).toBeGreaterThan(0)
  expect(Object.keys(look?.look.shown ?? {}).sort()).toEqual([...subjects].sort())
  expect(file?.path).toBe(`/app/inbox/presses/s1/${look?.id}.json`)
  expect(app.labels).toEqual([['label', 't1', `${PRESS_LABEL}=${look?.id}`]])
  setSystemTime(new Date(NOW))
})
