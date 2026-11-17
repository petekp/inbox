import './gpui-stand-in'
import { afterEach, expect, setSystemTime, test } from 'bun:test'
import { pressFolder } from '../../hooks/herdr'
import { pressFile } from '../../hooks/herdr-press-file'
import { HEIGHT_SETTLE_MS } from '../../hooks/springs'
import { LOOK_MIN_MS } from '../../hooks/status-children'
import { statusListRows } from '../../hooks/status-folds'
import { seenSubjectIds } from '../../hooks/status-page'
import type { StatusDrawn } from '../src/status-look'
import { allOf, openPanel, writtenFiles } from './gpui-stand-in'

const { isPaneShown, statusPlaced, surelyShown, StatusLook, writeLook } = await import('../src/status-look')
const { tabBlocks } = await import('../src/draw')
const { NOW, demoScreen, uiOn } = await import('./fixtures')

const BLOCK_HEIGHT = 40

afterEach(() => setSystemTime())

function demoPlaced(room: number) {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const placed = statusPlaced(blocks, () => BLOCK_HEIGHT, screen.view.statusPage, room)
  const drawnIds = new Set(blocks.map(b => b.id))
  const subjects = statusListRows(screen.view.statusPage)
    .filter(r => drawnIds.has(r.id))
    .flatMap(seenSubjectIds)

  return { placed: placed!, subjects, blocks, screen }
}

test('every subject row on the Status counts as on screen when the whole list fits between the edge fades', () => {
  const { placed, subjects } = demoPlaced(100_000)
  expect(subjects.length).toBeGreaterThan(0)
  expect(surelyShown({ ...placed, room: placed.height }).sort()).toEqual([...subjects].sort())
})

test('in a list that scrolls, only rows whose first line is in view at both ends of the scroll count', () => {
  const rows = [0, 100, 160, 200, 230, 240].map((top, i) => ({ top, subjects: [`s${i}`] }))
  expect(surelyShown({ rows, height: 400, room: 250 })).toEqual(['s2', 's3', 's4'])
  expect(surelyShown({ rows, height: 600, room: 250 })).toEqual([])
})

test('the Status rows have no places until every drawn block has a measured height', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const last = blocks.at(-1)!.id
  expect(statusPlaced(blocks, id => (id === last ? undefined : 40), screen.view.statusPage, 500)).toBeNull()
})

const panes = [
  { pane: 'p-inbox', tab: 'tab1', zoomed: false },
  { pane: 'p-agent', tab: 'tab1', zoomed: false },
]
const spacesWith = (tab: { active: boolean; zoomed: boolean }, isSpaceShown = true) => [
  { active: isSpaceShown, tabs: [{ id: 'tab1', ...tab }] },
]

test('the pane counts as shown only while its window has focus and its tab shows with no other pane zoomed', () => {
  const shownTab = spacesWith({ active: true, zoomed: false })
  expect(isPaneShown('p-inbox', panes, shownTab, { active: true })).toBe(true)
  expect(isPaneShown('p-inbox', panes, shownTab, { active: false })).toBe(false)
  expect(isPaneShown('p-inbox', panes, spacesWith({ active: false, zoomed: false }), { active: true })).toBe(false)
  expect(isPaneShown('p-inbox', panes, spacesWith({ active: true, zoomed: false }, false), { active: true })).toBe(
    false,
  )
  expect(isPaneShown('p-inbox', panes, spacesWith({ active: true, zoomed: true }), { active: true })).toBe(false)
  const zoomedInbox = panes.map(p => ({ ...p, zoomed: p.pane === 'p-inbox' }))
  expect(isPaneShown('p-inbox', zoomedInbox, spacesWith({ active: true, zoomed: true }), { active: true })).toBe(true)
  expect(isPaneShown(undefined, panes, shownTab, { active: true })).toBe(false)
})

const drawnOf = (sessionId: string, placed: StatusDrawn['placed'], writtenAt = NOW + 100_000): StatusDrawn => ({
  sessionId,
  terminal: `t-${sessionId}`,
  writtenAt,
  placed,
})

const fitting = { rows: [{ top: 0, subjects: ['a'] }], height: 40, room: 400 }

function checksEverySecond(look: InstanceType<typeof StatusLook>, from: number, to: number) {
  const ended = []
  for (let at = from; at <= to; at += 1_000) ended.push(look.check(true, at))

  return ended.filter(e => e !== null)
}

test('a look at the Status ends at the last check that found it shown, with each row surely on screen once it rested', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting), NOW)
  expect(checksEverySecond(look, NOW, NOW + 6_000)).toEqual([])
  const ended = look.check(false, NOW + 7_000)
  expect(ended).toEqual({
    sessionId: 's1',
    terminal: 't-s1',
    look: { startedAt: NOW, endedAt: NOW + 6_000, shown: { a: NOW + 6_000 }, drawnWrittenAt: NOW + 100_000 },
  })
  expect(look.check(false, NOW + 8_000)).toBeNull()
})

test('a look reports when the host wrote the last file it drew, and no row counts as shown after that write', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting, NOW - 4_000), NOW)
  checksEverySecond(look, NOW, NOW + 3_000)
  look.drew(drawnOf('s1', fitting, NOW + 3_500), NOW + 3_500)
  checksEverySecond(look, NOW + 4_000, NOW + 6_000)
  expect(look.check(false, NOW + 7_000)?.look).toMatchObject({ shown: { a: NOW + 3_500 }, drawnWrittenAt: NOW + 3_500 })
})

test('a new file that leaves every row in its place does not restart the wait for the rows to rest', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting, NOW), NOW)
  const lastCheck = NOW + HEIGHT_SETTLE_MS + 5_000
  for (let at = NOW + HEIGHT_SETTLE_MS; at <= lastCheck; at += 1_000) {
    look.drew(drawnOf('s1', fitting, at - 100), at - 100)
    look.check(true, at)
  }
  expect(look.check(false, NOW + 20_000)?.look.shown).toEqual({ a: lastCheck - 100 })
})

test('a look shorter than a look’s least time is not reported', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting), NOW)
  checksEverySecond(look, NOW, NOW + LOOK_MIN_MS - 1_000)
  expect(look.check(false, NOW + LOOK_MIN_MS)).toBeNull()
})

function shownAfter(draws: [number, StatusDrawn['placed']][], checks: number[]) {
  const look = new StatusLook()
  look.drew(drawnOf('s1', null), NOW)
  checksEverySecond(look, NOW, NOW + 6_000)
  for (const at of [...draws.map(d => d[0]), ...checks].sort((a, b) => a - b)) {
    const draw = draws.find(d => d[0] === at)
    if (draw) look.drew(drawnOf('s1', draw[1]), at)
    if (checks.includes(at)) look.check(true, at)
  }

  return look.check(false, NOW + 10_000)?.look.shown
}

test('rows count only once their places stayed the same for a spring’s settle time, and a look not at rest counts none', () => {
  const at = NOW + 6_100
  expect(shownAfter([], [NOW + 7_000])).toEqual({})
  expect(shownAfter([[at, fitting]], [at + HEIGHT_SETTLE_MS])).toEqual({ a: at + HEIGHT_SETTLE_MS })
  expect(shownAfter([[at, fitting]], [at + HEIGHT_SETTLE_MS - 1])).toEqual({})
  const moved = { ...fitting, rows: [{ top: 8, subjects: ['a'] }] }
  const later = at + HEIGHT_SETTLE_MS - 1
  expect(
    shownAfter(
      [
        [at, fitting],
        [later, moved],
      ],
      [at + HEIGHT_SETTLE_MS, later + HEIGHT_SETTLE_MS - 1],
    ),
  ).toEqual({})
})

test('a check long after the last one ends the look at the last one and starts another', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting), NOW)
  checksEverySecond(look, NOW, NOW + 6_000)
  const ended = look.check(true, NOW + 60_000)
  expect(ended?.look.endedAt).toBe(NOW + 6_000)
  checksEverySecond(look, NOW + 61_000, NOW + 66_000)
  expect(look.check(false, NOW + 67_000)?.look).toEqual({
    startedAt: NOW + 60_000,
    endedAt: NOW + 66_000,
    shown: { a: NOW + 66_000 },
    drawnWrittenAt: NOW + 100_000,
  })
})

test('following another session ends the look at the first session’s Status', () => {
  const look = new StatusLook()
  look.drew(drawnOf('s1', fitting), NOW)
  checksEverySecond(look, NOW, NOW + 6_000)
  look.drew(drawnOf('s2', fitting), NOW + 6_500)
  const ended = look.check(true, NOW + 7_000)
  expect(ended?.sessionId).toBe('s1')
  expect(ended?.look.endedAt).toBe(NOW + 6_000)
})

test('an ended look goes to its session’s press folder as a look file the hosts read, then wakes its terminal', async () => {
  const written: { path: string; text: string }[] = []
  const woken: string[] = []
  const io = {
    random: () => 0.5,
    write: async (path: string, text: string) => (written.push({ path, text }), null),
    wake: async (terminal: string) => void woken.push(terminal),
  }
  const look = { startedAt: NOW, endedAt: NOW + 6_000, shown: { a: NOW + 6_000 }, drawnWrittenAt: NOW }
  await writeLook(io, '/app', { sessionId: 's1', terminal: 't1', look })
  expect(written).toHaveLength(1)
  expect(written[0]!.path.startsWith(`${pressFolder('/app', 's1')}/`)).toBe(true)
  const read = pressFile(written[0]!.text)
  expect(read.ok && 'look' in read.file && read.file.look).toEqual(look)
  expect(woken).toEqual(['t1'])
  const failing = { ...io, write: async () => 'disk full' }
  await writeLook(failing, '/app', { sessionId: 's1', terminal: 't1', look })
  expect(woken).toEqual(['t1'])
})

test('the Inbox view reports the Status rows it measured and drew when the person leaves the Status tab or closes the pane', async () => {
  let at = NOW + 1_000
  setSystemTime(at)
  const { panel, paint, click, settle, measure } = await openPanel()
  const tab = (label: string) => allOf(paint()).find(n => n.label?.startsWith(label))!
  const looks = () =>
    writtenFiles.flatMap(({ path, text }) => {
      const read = path.startsWith(`${pressFolder('/app', 's1')}/`) ? pressFile(text) : null
      return read?.ok && 'look' in read.file ? [read.file.look] : []
    })
  const shownFor = async (ms: number) => {
    for (const end = at + ms; at < end;) {
      at += 1_000
      setSystemTime(at)
      measure(n => ({ width: 600, height: n.id === 'inbox-list' ? 100_000 : BLOCK_HEIGHT }))
      paint()
      await panel.checkLook()
    }
  }
  writtenFiles.length = 0
  click(tab('Status'))
  await shownFor(8_000)
  click(tab('Asks'))
  paint()
  await panel.checkLook()
  await settle()

  const { subjects } = demoPlaced(100_000)
  const [first] = looks()
  expect(looks()).toHaveLength(1)
  expect(Object.keys(first!.shown).sort()).toEqual([...subjects].sort())
  expect(Object.values(first!.shown).every(shownAt => shownAt === NOW)).toBe(true)
  expect(first!.drawnWrittenAt).toBe(NOW)

  click(tab('Status'))
  await shownFor(8_000)
  await panel.close()
  expect(looks()).toHaveLength(2)
})

test('the Inbox view tells the host its PRs tab is shown on opening it and every half minute, and stops when another tab shows', async () => {
  let at = NOW + 1_000
  setSystemTime(at)
  const { panel, paint, click, settle } = await openPanel()
  const tab = (label: string) => allOf(paint()).find(n => n.label?.startsWith(label))!
  const reports = () =>
    writtenFiles.filter(
      ({ path, text }) => path.startsWith(`${pressFolder('/app', 's1')}/`) && 'prsShown' in JSON.parse(text),
    )
  const check = async (ms: number) => {
    at += ms
    setSystemTime(at)
    paint()
    await panel.checkLook()
  }
  writtenFiles.length = 0
  await check(1_000)
  expect(reports()).toHaveLength(0)

  click(tab('PRs'))
  await check(1_000)
  expect(reports()).toHaveLength(1)
  await check(29_000)
  expect(reports()).toHaveLength(1)
  await check(1_000)
  expect(reports()).toHaveLength(2)

  click(tab('Asks'))
  await check(40_000)
  expect(reports()).toHaveLength(2)
  click(tab('PRs'))
  await check(1_000)
  expect(reports()).toHaveLength(3)
  await settle()
})
