import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'
import { demoSession } from '../../hooks/demo'
import { sessionView } from '../../hooks/session-view'
import { SLIDE_PX } from '../../hooks/row-motion'
import { SETTLED_MS } from '../../hooks/timing'

const { framesOf, jumpsOf } = await import('./frames')
const { LINE_HEIGHT } = await import('../src/paint-theme')
const { tabBlocks } = await import('../src/draw')
const { AGENT, NOW, demoScreen, uiOn } = await import('./fixtures')

const ALL = ['d11', 'd12', 'd13', 'd15']

function asks(
  keep: string[],
  selected: string | null = null,
  added: { from: string; id: string } | null = null,
  collapsed: string[] = [],
): Block[] {
  const screen = demoScreen()
  const view = screen.view
  const questions = view.needsYou.questions.filter(r => keep.includes(r.id))
  const from = view.needsYou.questions.find(r => r.id === added?.from)
  if (added && from) questions.unshift({ ...from, id: added.id })

  return tabBlocks(
    { ...screen, view: { ...view, collapsed, needsYou: { ...view.needsYou, questions } } },
    uiOn('needsYou', { selected }),
  )
}

test('when the empty note leaves and the first question enters and opens in the same draw, nothing moves off its springs', () => {
  expect(
    jumpsOf([
      [0, asks([])],
      [0, asks(['d11'])],
    ]),
  ).toEqual([])
  expect(
    jumpsOf([
      [0, asks(['d11'])],
      [0, asks([])],
    ]),
  ).toEqual([])
})

test('a move that starts while another glides starts where every block is drawn', () => {
  const added = { from: 'd12', id: 'new' }
  const withoutNote = asks([]).filter(b => b.id !== 'empty question')
  const staggered: [string, [number, Block[]][]][] = [
    [
      'the top row leaves, then the next',
      [
        [0, asks(ALL)],
        [0, asks(ALL.slice(1))],
        [96, asks(ALL.slice(2))],
      ],
    ],
    [
      'the top row leaves, then a row enters at the top',
      [
        [0, asks(ALL)],
        [0, asks(ALL.slice(1))],
        [96, asks(ALL.slice(1), null, added)],
      ],
    ],
    [
      'a row enters at the top, then the old top leaves',
      [
        [0, asks(ALL)],
        [0, asks(ALL, null, added)],
        [96, asks(ALL.slice(1), null, added)],
      ],
    ],
    [
      'a row enters, then leaves before it has opened',
      [
        [0, asks(['d13'])],
        [0, asks(['d13'], null, added)],
        [160, asks(['d13'])],
      ],
    ],
    [
      'the empty note leaves, then the first question enters',
      [
        [0, asks([])],
        [0, withoutNote],
        [96, asks(['d11'])],
      ],
    ],
  ]
  for (const [name, steps] of staggered) expect({ name, jumps: jumpsOf(steps) }).toEqual({ name, jumps: [] })
})

test('when the selection moves between rows whose titles wrap open, the rows close and open on their springs', () => {
  expect(
    jumpsOf([
      [0, asks(ALL, 'd11')],
      [0, asks(ALL, 'd12')],
    ]),
  ).toEqual([])
  expect(
    jumpsOf([
      [0, asks(ALL, 'd12')],
      [0, asks(ALL, 'd11')],
      [96, asks(ALL, 'd13')],
    ]),
  ).toEqual([])
})

function titleOf(steps: [number, Block[]][]) {
  const { jumps, titles } = framesOf(steps)
  const d11 = titles.filter(t => t.id === 'd11' && t.at >= 0)

  return {
    jumps,
    isWrappedAtFirst: d11[0]?.isCut === false,
    isCutOnlyAtRest: d11.filter(t => t.isCut).every(t => t.isBoxResting && Math.abs(t.box - LINE_HEIGHT) < 0.5),
    isWrappedWhileGliding: d11.some(t => !t.isCut && t.box > LINE_HEIGHT + 0.5 && t.box < 2 * LINE_HEIGHT - 0.5),
    isCutAtEnd: d11.at(-1)?.isCut === true,
  }
}

test('a closing row keeps its title wrapped while the title box glides to one line, and cuts it once the box rests', () => {
  const closes: [string, [number, Block[]][]][] = [
    [
      'the open row collapses',
      [
        [0, asks(ALL, 'd11')],
        [0, asks(ALL, 'd11', null, ['d11'])],
      ],
    ],
    [
      'the selection moves to the next row',
      [
        [0, asks(ALL, 'd11')],
        [0, asks(ALL, 'd12')],
      ],
    ],
  ]
  for (const [name, steps] of closes)
    expect({ name, ...titleOf(steps) }).toEqual({
      name,
      jumps: [],
      isWrappedAtFirst: true,
      isCutOnlyAtRest: true,
      isWrappedWhileGliding: true,
      isCutAtEnd: true,
    })
})

test('an opening row wraps its title from its first frame, and a close that turns back never cuts it', () => {
  expect(
    titleOf([
      [0, asks(ALL)],
      [0, asks(ALL, 'd11')],
    ]),
  ).toMatchObject({ jumps: [], isWrappedAtFirst: true, isCutAtEnd: false })
  expect(
    titleOf([
      [0, asks(ALL, 'd11')],
      [0, asks(ALL, 'd11', null, ['d11'])],
      [200, asks(ALL, 'd11')],
    ]),
  ).toMatchObject({ jumps: [], isWrappedAtFirst: true, isCutOnlyAtRest: true, isCutAtEnd: false })
})

type Overview = NonNullable<ReturnType<typeof demoSession>['ledger']['overview']>
type Milestone = Overview['milestones'][number]

function statusOf(
  change: (o: Overview) => Overview = o => o,
  unfolded: string[] = [],
  collapsed: string[] = [],
): Block[] {
  const s = demoSession(NOW, AGENT)
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const ledger = { ...s.ledger, overview: change(s.ledger.overview!) }
  const view = sessionView({ ...s, ledger }, NOW, SETTLED_MS, holds)

  return tabBlocks({ ...demoScreen(), view: { ...view, collapsed } }, uiOn('overview', { statusUnfolded: unfolded }))
}

const withMilestones =
  (f: (m: Milestone) => Milestone) =>
  (o: Overview): Overview => ({ ...o, milestones: o.milestones.map(f) })

function glideOf(from: Block[], to: Block[]) {
  const { jumps, gaps } = framesOf([
    [0, from],
    [0, to],
  ])

  return { jumps, gaps }
}

test('on the Status page, a done milestone’s fold opening and closing, a work row arriving under a milestone and the next milestone becoming now glide on their springs, with every tree column and the path’s line joined across each gliding space', () => {
  const fold = demoScreen().view.statusPage.goal!.milestones.find(m => m.foldId !== null)!.foldId!
  const arrives = (o: Overview): Overview => ({
    ...o,
    subjects: [...o.subjects, { ...o.subjects[0]!, id: 's9', name: 'Pinch sensor' }],
    serves: { ...o.serves, s9: 'm2' },
  })
  const toNow = withMilestones(m =>
    m.id === 'm2' ? { ...m, status: 'done', closedAt: NOW } : m.id === 'm3' ? { ...m, status: 'working' } : m,
  )
  const moves: [string, Block[], Block[]][] = [
    ['the fold opens', statusOf(), statusOf(undefined, [fold])],
    ['the fold closes', statusOf(undefined, [fold]), statusOf()],
    ['a work row arrives', statusOf(), statusOf(arrives)],
    ['the next milestone becomes now', statusOf(), statusOf(toNow)],
    ['the milestone now goes back to next', statusOf(toNow), statusOf()],
  ]
  for (const [name, from, to] of moves) expect({ name, ...glideOf(from, to) }).toEqual({ name, jumps: [], gaps: [] })
})

test.failing('a dropped milestone moves below the path without the rows between its old and new place jumping', () => {
  const dropped = withMilestones(m => (m.id === 'm3' ? { ...m, status: 'dropped', closedAt: NOW } : m))
  expect(glideOf(statusOf(), statusOf(dropped))).toEqual({ jumps: [], gaps: [] })
})

const REST_PX = 2
const STALL_SHARE = 0.02

function stepsOf(heights: number[]): { start: number; end: number; stalled: number } {
  const start = heights[0] ?? 0
  const end = heights.at(-1) ?? 0
  const first = heights.findIndex(h => Math.abs(h - start) >= 0.5)
  const stalled = heights.filter((h, i) => {
    const before = heights[i - 1]
    if (first < 0 || i < first || before === undefined || Math.abs(h - end) < REST_PX) return false

    return Math.abs(h - before) < STALL_SHARE * Math.abs(h - end)
  }).length

  return { start, end, stalled }
}

test('folding a milestone down to its name takes the list’s height down on every frame to the folded height, and opening it takes it up the same way', () => {
  const nameOnly = withMilestones(m => (m.id === 'm2' ? { ...m, text: '' } : m))
  const open = statusOf(nameOnly)
  const folded = statusOf(nameOnly, [], ['m2'])
  const fold = stepsOf(
    framesOf(
      [
        [0, open],
        [0, folded],
      ],
      1200,
    ).heights.slice(-76),
  )
  expect(fold.end).toBeLessThan(fold.start)
  expect(fold.stalled).toBe(0)
  const opens = stepsOf(
    framesOf(
      [
        [0, folded],
        [0, open],
      ],
      1200,
    ).heights.slice(-76),
  )
  expect(opens.end).toBeGreaterThan(opens.start)
  expect(opens.stalled).toBe(0)
})

test('a block that leaves slides its content up by the slide offset as it fades, and one that enters slides down from it', () => {
  const some = asks(['d11', 'd12'])
  const fewer = asks(['d11'])
  const offsets = (steps: [number, Block[]][]) => new Set(framesOf(steps, 800).slides.flat())
  expect(
    offsets([
      [0, some],
      [0, fewer],
    ]),
  ).toEqual(new Set([0, -SLIDE_PX]))
  expect(
    offsets([
      [0, fewer],
      [0, some],
    ]),
  ).toEqual(new Set([0, -SLIDE_PX]))
  expect(offsets([[0, some]])).toEqual(new Set())
})
