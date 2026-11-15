import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'

const { framesOf, jumpsOf } = await import('./frames')
const { LINE_HEIGHT } = await import('../src/paint-theme')
const { tabBlocks } = await import('../src/draw')
const { demoScreen, uiOn } = await import('./fixtures')

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
