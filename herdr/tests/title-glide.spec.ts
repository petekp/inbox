import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import { FRAME_MS } from '../../core/view/springs'

const { framesOf, jumpsOf } = await import('./frames')
type Step = import('./frames').Step
const { LINE_HEIGHT } = await import('../src/paint-theme')
const fixtures = await import('./fixtures')
const { tabBlocks } = await import('../src/draw')
const { ALL } = fixtures
const LONG_TITLE = 'Dismiss a glance with a pinch, a flick of the wrist, or a nod of the head while you walk?'
const withLongTitle = (blocks: import('../src/blocks').Block[]) =>
  blocks.map(b => (b.kind === 'row' && b.id === 'd11' ? { ...b, title: LONG_TITLE } : b))
const asks = (...args: Parameters<typeof fixtures.asks>) => withLongTitle(fixtures.asks(...args))

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

function titleOf(steps: Step[]) {
  const { jumps, titles, cuts } = framesOf(steps, 900)
  const d11 = titles.filter(t => t.id === 'd11' && t.at >= 0)
  const tallHeight = Math.max(...d11.map(t => t.box))

  return {
    jumps,
    tallAtFirst: d11[0]?.tall,
    tallAtEnd: d11.at(-1)?.tall,
    boxAtEnd: Math.round(d11.at(-1)?.box ?? NaN),
    isTallShownOnlyOpen: d11.every(t => t.tall < 0.02 || t.box >= tallHeight - 0.5),
    bothFormsWhileBoxMoves: d11.filter(t => t.tall > 0.02 && t.short > 0.02 && t.box < tallHeight - 0.5).map(t => t.at),
    fadeFrames: d11.filter(t => t.tall > 0.02 && t.tall < 0.98).length,
    boxShrinksAt: d11.find(t => t.box < tallHeight - 0.5)?.at ?? null,
    titleCuts: cuts.filter(c => c.text === LONG_TITLE),
  }
}

test('a closing row fades its title to its two-line cut while its title box holds, and the box shrinks after its panel fades', () => {
  const closes: [string, Step[]][] = [
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
        [0, asks(ALL, 'd12'), 'input'],
      ],
    ],
  ]
  for (const [name, steps] of closes) {
    const title = titleOf(steps)
    expect({ name, ...title }).toEqual({
      name,
      jumps: [],
      boxShrinksAt: title.boxShrinksAt,
      tallAtFirst: 1,
      tallAtEnd: 0,
      boxAtEnd: 2 * LINE_HEIGHT,
      isTallShownOnlyOpen: true,
      bothFormsWhileBoxMoves: [],
      fadeFrames: title.fadeFrames,
      titleCuts: [],
    })
    expect(title.boxShrinksAt).toBeGreaterThanOrEqual(LEAVE_FADE_MS)
    expect(title.fadeFrames).toBeGreaterThan(2)
  }
})

test('an opening row keeps its title cut until the title box is open, then fades it to the whole title', () => {
  const opens: [string, Step[]][] = [
    [
      'the person opens the row',
      [
        [0, asks(ALL, 'd11', null, ['d11'])],
        [0, asks(ALL, 'd11'), 'input'],
      ],
    ],
    [
      'the selection moves to the row',
      [
        [0, asks(ALL, 'd12')],
        [0, asks(ALL, 'd11'), 'input'],
      ],
    ],
    [
      'a publish opens the row',
      [
        [0, asks(ALL, 'd11', null, ['d11'])],
        [0, asks(ALL, 'd11')],
      ],
    ],
  ]
  for (const [name, steps] of opens) {
    const title = titleOf(steps)
    expect({ name, ...title }).toEqual({
      name,
      jumps: [],
      tallAtFirst: 0,
      tallAtEnd: 1,
      boxAtEnd: title.boxAtEnd,
      boxShrinksAt: title.boxShrinksAt,
      isTallShownOnlyOpen: true,
      bothFormsWhileBoxMoves: [],
      fadeFrames: title.fadeFrames,
      titleCuts: [],
    })
    expect(title.boxAtEnd).toBeGreaterThan(2 * LINE_HEIGHT)
    expect(title.fadeFrames).toBeGreaterThan(2)
  }
})

test('a row whose close or open turns back moves its title from where it is and never cuts it', () => {
  for (const at of [60, 200]) {
    const reopens = titleOf([
      [0, asks(ALL, 'd11')],
      [0, asks(ALL, 'd11', null, ['d11'])],
      [at, asks(ALL, 'd11')],
    ])
    const recloses = titleOf([
      [0, asks(ALL, 'd11', null, ['d11'])],
      [0, asks(ALL, 'd11'), 'input'],
      [at, asks(ALL, 'd11', null, ['d11']), 'input'],
    ])
    expect({ at, ...reopens }).toMatchObject({
      at,
      jumps: [],
      tallAtEnd: 1,
      isTallShownOnlyOpen: true,
      bothFormsWhileBoxMoves: [],
      titleCuts: [],
    })
    expect({ at, ...recloses }).toMatchObject({
      at,
      jumps: [],
      tallAtEnd: 0,
      boxAtEnd: 2 * LINE_HEIGHT,
      bothFormsWhileBoxMoves: [],
      titleCuts: [],
    })
    expect(recloses.isTallShownOnlyOpen).toBe(true)
  }
})

test('a row closed, opened and closed again a frame apart ends on its two-line cut and never cuts its title', () => {
  for (const gap of [FRAME_MS, 2 * FRAME_MS]) {
    const closesTwice = titleOf([
      [0, asks(ALL, 'd11')],
      [10, asks(ALL, 'd11', null, ['d11']), 'input'],
      [10 + gap, asks(ALL, 'd11'), 'input'],
      [10 + 2 * gap, asks(ALL, 'd11', null, ['d11']), 'input'],
    ])
    expect({ gap, ...closesTwice }).toMatchObject({
      gap,
      tallAtEnd: 0,
      boxAtEnd: 2 * LINE_HEIGHT,
      bothFormsWhileBoxMoves: [],
      titleCuts: [],
    })
  }
})

test('a row opened, closed before its panel shows and opened again fades to its whole title only once the title box rests', () => {
  const shut = asks(ALL, 'd11', null, ['d11'])
  const open = asks(ALL, 'd11')
  const sequences: Step[][] = [
    ...[
      [16, 32],
      [30, 60],
      [40, 80],
      [64, 96],
    ].map(([closeAt, openAt]): Step[] => [
      [0, shut],
      [0, open, 'input'],
      [closeAt!, shut, 'input'],
      [openAt!, open, 'input'],
    ]),
    [
      [0, asks(ALL, 'd12')],
      [0, open, 'input'],
      [144, asks(ALL, 'd12'), 'input'],
      [192, open, 'input'],
    ],
  ]
  for (const steps of sequences) {
    const title = titleOf(steps)
    expect({ steps: steps.map(s => s[0]), ...title }).toMatchObject({
      steps: steps.map(s => s[0]),
      jumps: [],
      tallAtEnd: 1,
      isTallShownOnlyOpen: true,
      bothFormsWhileBoxMoves: [],
      titleCuts: [],
    })
  }
})

test('a collapsed row shows a title of one or two lines whole and cuts a longer one at a word at the end of its second line', () => {
  const { shown, titles } = framesOf([[0, asks(ALL, 'd15')]], 400)
  const end = Math.max(...shown.map(s => s.at))
  const titleOf = (id: string) => shown.find(s => s.at === end && s.block === id && s.opacity > 0 && s.text.length > 20)?.text
  const boxOf = (id: string) => titles.findLast(t => t.id === id)?.box
  expect(['d16', 'd12', 'd11'].map(id => ({ id, title: titleOf(id), box: boxOf(id) }))).toEqual([
    { id: 'd16', title: 'Check the glances outdoors in bright sun', box: LINE_HEIGHT },
    { id: 'd12', title: 'Bring a dismissed glance back when you look at it?', box: 2 * LINE_HEIGHT },
    {
      id: 'd11',
      title: 'Dismiss a glance with a pinch, a flick of the wrist, or a nod of the head while…',
      box: 2 * LINE_HEIGHT,
    },
  ])
})

test('a row whose collapsed title is cut fades to one line as it settles and back through Undo, without a jump or a cut', () => {
  const { NOW, demoScreen, uiOn, withDismissedAsk } = fixtures
  const dismissed = withLongTitle(tabBlocks(withDismissedAsk('d11', NOW), uiOn('needsYou', { selected: 'd12' })))
  const collapsed = withLongTitle(tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd12' })))
  const moves: [string, Step[], number][] = [
    [
      'settle',
      [
        [0, collapsed],
        [0, dismissed],
      ],
      LINE_HEIGHT,
    ],
    [
      'undo',
      [
        [0, dismissed],
        [0, collapsed],
      ],
      2 * LINE_HEIGHT,
    ],
  ]
  for (const [name, steps, box] of moves) {
    const { jumps, cuts, titles } = framesOf(steps, 900)
    const titleCuts = cuts.filter(c => c.at >= 0 && c.text.startsWith('Dismiss a glance'))
    const d11 = titles.filter(t => t.id === 'd11' && t.at >= 0)
    const isFaded = d11.some(t => t.tall > 0.02 && t.tall < 0.98)
    expect({ name, jumps, titleCuts, isFaded, box: d11.at(-1)?.box }).toEqual({
      name,
      jumps: [],
      titleCuts: [],
      isFaded: true,
      box,
    })
  }
})
