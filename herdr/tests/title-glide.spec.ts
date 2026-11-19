import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { LEAVE_FADE_MS } from '../../hooks/row-motion'
import { FRAME_MS } from '../../hooks/springs'

const { framesOf, jumpsOf } = await import('./frames')
type Step = import('./frames').Step
const { LINE_HEIGHT } = await import('../src/paint-theme')
const { ALL, asks } = await import('./fixtures')

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
  const wrappedHeight = Math.max(...d11.map(t => t.box))

  return {
    jumps,
    wrapsAtFirst: d11[0]?.wrapped,
    wrapsAtEnd: d11.at(-1)?.wrapped,
    boxAtEnd: Math.round(d11.at(-1)?.box ?? NaN),
    isWrapShownOnlyOpen: d11.every(t => t.wrapped < 0.02 || t.box >= wrappedHeight - 0.5),
    framesWithBothForms: d11.filter(t => t.wrapped > 0.02 && t.oneLine > 0.02).map(t => t.at),
    boxShrinksAt: d11.find(t => t.box < wrappedHeight - 0.5)?.at ?? null,
    titleCuts: cuts.filter(c => c.text === TITLE_D11),
  }
}

const TITLE_D11 = asks(ALL).flatMap(b => (b.kind === 'row' && b.id === 'd11' ? [b.title] : []))[0]

test('a closing row shows its title on one line at once, never both forms, and its title box shrinks after its panel fades', () => {
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
      wrapsAtFirst: 0,
      wrapsAtEnd: 0,
      boxAtEnd: LINE_HEIGHT,
      isWrapShownOnlyOpen: true,
      framesWithBothForms: [],
      titleCuts: [],
    })
    expect(title.boxShrinksAt).toBeGreaterThanOrEqual(LEAVE_FADE_MS)
  }
})

test('an opening row keeps its title on one line until the title box is open, then shows it wrapped, never both forms', () => {
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
      wrapsAtFirst: 0,
      wrapsAtEnd: 1,
      boxAtEnd: title.boxAtEnd,
      boxShrinksAt: title.boxShrinksAt,
      isWrapShownOnlyOpen: true,
      framesWithBothForms: [],
      titleCuts: [],
    })
    expect(title.boxAtEnd).toBeGreaterThan(LINE_HEIGHT)
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
      wrapsAtEnd: 1,
      isWrapShownOnlyOpen: true,
      framesWithBothForms: [],
      titleCuts: [],
    })
    expect({ at, ...recloses }).toMatchObject({
      at,
      jumps: [],
      wrapsAtEnd: 0,
      boxAtEnd: LINE_HEIGHT,
      framesWithBothForms: [],
      titleCuts: [],
    })
    expect(recloses.isWrapShownOnlyOpen).toBe(true)
  }
})

test('a row closed, opened and closed again a frame apart ends on one line and never cuts its title', () => {
  for (const gap of [FRAME_MS, 2 * FRAME_MS]) {
    const closesTwice = titleOf([
      [0, asks(ALL, 'd11')],
      [10, asks(ALL, 'd11', null, ['d11']), 'input'],
      [10 + gap, asks(ALL, 'd11'), 'input'],
      [10 + 2 * gap, asks(ALL, 'd11', null, ['d11']), 'input'],
    ])
    expect({ gap, ...closesTwice }).toMatchObject({
      gap,
      wrapsAtEnd: 0,
      boxAtEnd: LINE_HEIGHT,
      framesWithBothForms: [],
      titleCuts: [],
    })
  }
})
