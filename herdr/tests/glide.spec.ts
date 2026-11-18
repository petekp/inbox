import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'
import { demoSession } from '../../hooks/demo'
import { sessionView } from '../../hooks/session-view'
import { SLIDE_PX } from '../../hooks/row-motion'
import { SETTLED_MS } from '../../hooks/timing'

const { framesOf, jumpsOf } = await import('./frames')
type Step = import('./frames').Step
const { LINE_HEIGHT } = await import('../src/paint-theme')
const { tabBlocks } = await import('../src/draw')
const { isOpenRow } = await import('../src/blocks')
const { AGENT, NOW, demoScreen, uiOn } = await import('./fixtures')

const ALL = ['d11', 'd12', 'd13', 'd15']

function asksIn(order: string[], selected: string | null = null): Block[] {
  const screen = demoScreen()
  const view = screen.view
  const questions = order.flatMap(id => view.needsYou.questions.filter(r => r.id === id))

  return tabBlocks(
    { ...screen, view: { ...view, needsYou: { ...view.needsYou, questions } } },
    uiOn('needsYou', { selected }),
  )
}

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

test('a dropped milestone moves below the path without the rows between its old and new place jumping', () => {
  const dropped = withMilestones(m => (m.id === 'm3' ? { ...m, status: 'dropped', closedAt: NOW } : m))
  expect(glideOf(statusOf(), statusOf(dropped))).toEqual({ jumps: [], gaps: [] })
})

test('a question that moves to another place in Asks glides there, and the list comes to rest at the new order’s height', () => {
  const moves: [string, Block[], Block[]][] = [
    ['a row moves up', asksIn(ALL), asksIn(['d13', 'd11', 'd12', 'd15'])],
    ['a row moves down past an open row', asksIn(ALL, 'd13'), asksIn(['d15', 'd11', 'd12', 'd13'], 'd13')],
  ]
  for (const [name, from, to] of moves) {
    const { jumps, gaps, heights } = framesOf(
      [
        [0, from],
        [0, to],
      ],
      1200,
    )
    const rest = framesOf([[0, to]]).heights.at(-1)
    expect({ name, jumps, gaps, end: Math.round(heights.at(-1) ?? NaN) }).toEqual({
      name,
      jumps: [],
      gaps: [],
      end: Math.round(rest ?? NaN),
    })
  }
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

const { allOf, openPanel, setZoom } = await import('./gpui-stand-in')
const { layout } = await import('./frames')

test.each([1, 0.9])(
  'at zoom %p, once the app reports sizes scaled by the zoom, every box in any tab is drawn at its content’s height',
  async zoom => {
    setZoom(zoom)
    const { paint, click, measure } = await openPanel()
    const laidOut = () => {
      const root = paint()
      const list = allOf(root).find(n => n.id === 'inbox-list')!
      const [chrome, inList] = [layout(root, () => undefined), layout(list, () => undefined, LINE_HEIGHT)]
      const placed = new Map([...chrome.placed, ...inList.placed])
      return { root, placed, fits: [...chrome.fits, ...inList.fits] }
    }
    const misfitsIn = (tab: string) => {
      click(allOf(paint()).find(n => n.label?.startsWith(tab))!)
      for (let i = 0; i < 3; i++) {
        const { root, placed } = laidOut()
        const heightOf = (n: Parameters<typeof placed.get>[0]) =>
          n.id === 'inbox-list' ? 100_000 : (placed.get(n)?.height ?? 0)
        measure(n => ({ width: 300 * zoom, height: heightOf(n) * zoom }), root)
      }
      const { fits } = laidOut()
      expect(fits.length).toBeGreaterThan(0)
      return fits.filter(f => Math.abs(f.height - f.content) > 0.5)
    }
    try {
      for (const tab of ['Asks', 'Status', 'Finds', 'PRs'])
        expect({ tab, misfits: misfitsIn(tab) }).toEqual({ tab, misfits: [] })
    } finally {
      setZoom(1)
    }
  },
)

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

test('no text is cut through its letters while a row or a whole section enters or leaves', () => {
  const some = asks(['d11', 'd12'])
  const fewer = asks(['d11'])
  const full = asks(ALL)
  const none = asks([])
  const moves: Record<string, Step[]> = {
    leaves: [
      [0, some],
      [0, fewer],
    ],
    enters: [
      [0, fewer],
      [0, some],
    ],
    fills: [
      [0, none],
      [0, full],
    ],
    empties: [
      [0, full],
      [0, none],
    ],
  }
  const openTitles = (blocks: Block[]) => blocks.flatMap(b => (b.kind === 'row' && isOpenRow(b) ? [b.title] : []))
  for (const [name, steps] of Object.entries(moves)) {
    const before = openTitles(steps[0]![1])
    const after = openTitles(steps.at(-1)![1])
    const folds = [...before, ...after].filter(title => !before.includes(title) || !after.includes(title))
    const cuts = framesOf(steps, 900).cuts.filter(c => !folds.includes(c.text))
    expect({ name, cuts }).toEqual({ name, cuts: [] })
  }
})

test('a leaving block’s space closes as soon as its content has faded, and not before', () => {
  const fading = framesOf(
    [
      [0, asks(['d11', 'd12'])],
      [0, asks(['d11'])],
    ],
    900,
  ).fading.filter(f => f.id === 'box d12')
  const full = fading[0]?.height ?? 0
  const fadedAt = fading.find(f => f.opacity < 0.05)?.at ?? Infinity
  const closesAt = fading.find(f => f.height < full - 0.5)?.at ?? Infinity
  expect(full).toBeGreaterThan(0)
  expect(closesAt).toBeGreaterThanOrEqual(fadedAt)
  expect(closesAt - fadedAt).toBeLessThanOrEqual(3 * 16)
})

test('a settled row the view brings in opens from no height, so the rows below it glide', () => {
  const steps: [number, Block[]][] = [
    [0, asks(ALL)],
    [0, asks([...ALL, 'd10'])],
  ]
  const frames = framesOf(steps, 900)
  expect(asks([...ALL, 'd10']).some(b => b.id === 'd10')).toBe(true)
  expect(jumpsOf(steps)).toEqual([])
  expect(frames.fading.find(f => f.id === 'box d10')?.height).toBe(0)
  expect(frames.cuts).toEqual([])
})

test('a row the selection leaves keeps closing when another block starts to leave', () => {
  const titleBoxes = framesOf(
    [
      [0, asks(ALL, 'd11')],
      [0, asks(ALL, 'd12'), 'input'],
      [100, asks(['d11', 'd12', 'd13'], 'd12')],
    ],
    900,
  )
    .titles.filter(t => t.id === 'd11')
    .map(t => t.box)
  const rises = titleBoxes.filter((box, i) => i > 0 && box > (titleBoxes[i - 1] ?? box) + 0.5)
  expect(titleBoxes.length).toBeGreaterThan(10)
  expect(rises).toEqual([])
})

test('the row the person’s selection moves to shows its panel from the next frame', () => {
  const fading = framesOf(
    [
      [0, asks(ALL, 'd11')],
      [0, asks(ALL, 'd12'), 'input'],
    ],
    300,
  ).fading.filter(f => f.id === 'panel d12')
  const start = fading[0]?.at ?? 0
  expect(fading.find(f => f.opacity > 0.01)?.at ?? Infinity).toBeLessThanOrEqual(start + 2 * 16)
})

test('a block listed again while it fades out fades back in where it is, and nothing below it dips', () => {
  const all = asks(['d11', 'd12', 'd13'])
  const frames = framesOf(
    [
      [0, all],
      [0, asks(['d11', 'd13'])],
      [50, all],
    ],
    900,
  )
  const box = frames.fading.filter(f => f.id === 'box d12')
  const full = box[0]?.height ?? 0
  expect(full).toBeGreaterThan(0)
  expect(Math.min(...box.map(f => f.height))).toBeGreaterThan(full - 0.5)
  expect(box.at(-1)?.opacity).toBeCloseTo(1)
  expect(Math.min(...frames.heights)).toBeGreaterThan((frames.heights[0] ?? 0) - 0.5)
})

test('a block listed again after its space began to close fades in once its space is nearly open again', () => {
  const all = asks(['d11', 'd12', 'd13'])
  const box = framesOf(
    [
      [0, all],
      [0, asks(['d11', 'd13'])],
      [200, all],
    ],
    1200,
  ).fading.filter(f => f.id === 'box d12' && f.at >= 200)
  const full = Math.max(...box.map(f => f.height))
  const nearlyOpenAt = box.find(f => f.height >= full - SLIDE_PX / 2)?.at ?? Infinity
  const showsAt = box.find(f => f.opacity > 0.02)?.at ?? Infinity
  expect(showsAt).toBeGreaterThanOrEqual(nearlyOpenAt - 16)
  expect(showsAt - nearlyOpenAt).toBeLessThanOrEqual(2 * 16)
})

test('when a publish moves the selection as another block leaves, the list never grows before it shrinks', () => {
  const moves: Record<string, Step[]> = {
    selectedLeaves: [
      [0, asks(ALL, 'd11')],
      [0, asks(['d12', 'd13', 'd15'], 'd12')],
    ],
    firstLeaves: [
      [0, asks(ALL)],
      [0, asks(['d12', 'd13', 'd15'])],
    ],
    otherLeaves: [
      [0, asks(ALL, 'd11')],
      [0, asks(['d11', 'd12', 'd13'], 'd12')],
    ],
    empties: [
      [0, asks(ALL)],
      [0, asks([])],
    ],
    keyAfter: [
      [0, asks(ALL, 'd11')],
      [0, asks(['d11', 'd12', 'd13'], 'd12')],
      [50, asks(['d11', 'd12', 'd13'], 'd13'), 'input'],
    ],
  }
  for (const [name, steps] of Object.entries(moves)) {
    const heights = framesOf(steps, 900).heights
    const start = heights[0] ?? 0
    const rise = Math.max(...heights) - start
    expect({ name, rise: rise > 0.5 ? rise : 0 }).toEqual({ name, rise: 0 })
  }
})

test('opening the goal field never raises the Status page’s height', () => {
  const heights = framesOf(
    [
      [0, tabBlocks(demoScreen(), uiOn('overview'))],
      [0, tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' })), 'input'],
    ],
    900,
  ).heights
  const start = heights[0] ?? 0
  expect(heights.at(-1)).not.toBe(start)
  expect(Math.max(...heights)).toBeLessThanOrEqual(start + 0.5)
})

test('reopening the goal field while it still closes never raises the Status page above its closed height', () => {
  const closed = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  const heights = framesOf(
    [
      [0, closed],
      [0, typing, 'input'],
      [900, closed, 'input'],
      [1200, typing, 'input'],
    ],
    2200,
  ).heights
  expect(Math.max(...heights)).toBeLessThan((heights[0] ?? 0) + 1)
})

test('closing the goal field before it has opened takes the Status page to its closed height without passing it, and cuts no text', () => {
  const closed = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  for (const closesAt of [50, 100, 200, 400]) {
    const { heights, cuts } = framesOf(
      [
        [0, closed],
        [0, typing, 'input'],
        [closesAt, closed, 'input'],
      ],
      1400,
    )
    const start = heights[0] ?? 0
    const end = Math.round(heights.at(-1) ?? NaN)
    expect({ closesAt, over: Math.max(...heights) > start + 0.5, end, cuts }).toEqual({
      closesAt,
      over: false,
      end: start,
      cuts: [],
    })
  }
})
