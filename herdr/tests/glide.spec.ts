import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'

const { jumpsOf } = await import('./frames')
const { tabBlocks } = await import('../src/draw')
const { demoScreen, uiOn } = await import('./fixtures')

const ALL = ['d11', 'd12', 'd13', 'd15']

function asks(
  keep: string[],
  selected: string | null = null,
  added: { from: string; id: string } | null = null,
): Block[] {
  const screen = demoScreen()
  const view = screen.view
  const questions = view.needsYou.questions.filter(r => keep.includes(r.id))
  const from = view.needsYou.questions.find(r => r.id === added?.from)
  if (added && from) questions.unshift({ ...from, id: added.id })

  return tabBlocks(
    { ...screen, view: { ...view, needsYou: { ...view.needsYou, questions } } },
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
