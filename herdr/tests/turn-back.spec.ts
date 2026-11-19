import './gpui-stand-in'
import { expect, setSystemTime, test } from 'bun:test'
import { LEAVE_FADE_MS, TURNED_BACK_CUT_OPACITY } from '../../hooks/row-motion'
import { PRESS_GUARD_MS } from '../../hooks/timing'
import type { Block, RowBlock } from '../src/blocks'

const { framesOf } = await import('./frames')
type Step = import('./frames').Step
const { ALL, NOW, asks } = await import('./fixtures')
const { allOf, openPanel } = await import('./gpui-stand-in')

const openRow = (blocks: Block[]) => blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelected)?.id

test('a row the person opens again after its panel faded fades the panel back in at once, and while its row regrows after a shrink cuts the panel only while faint', () => {
  const open = asks(ALL, 'd11')
  const closes: Step[] = [
    [0, open],
    [0, asks(ALL, 'd11', null, ['d11']), 'input'],
  ]
  for (const backAt of [130, 150, 170, 200, 260]) {
    const frames = framesOf([...closes, [backAt, open, 'input']], 1200)
    const openHeight = frames.heights[0] ?? 0
    const panel = frames.fading.filter(f => f.id === 'panel d11' && f.at > backAt)
    const heightAt = new Map(frames.heights.map((h, i) => [i * 16 - 500, h]))
    const emptyNearOpen = panel.slice(1).filter(f => f.opacity < 0.05 && openHeight - (heightAt.get(f.at) ?? 0) < 50)
    expect({ backAt, shownSecondFrame: (panel[1]?.opacity ?? 0) > 0.02, emptyNearOpen }).toEqual({
      backAt,
      shownSecondFrame: true,
      emptyNearOpen: [],
    })
    expect(panel.every((f, i) => i === 0 || f.opacity >= (panel[i - 1]?.opacity ?? 0))).toBe(true)
    expect({ backAt, cuts: frames.cuts.filter(c => c.box === 'panel d11') }).toEqual({ backAt, cuts: [] })
    expect(panel.at(-1)?.opacity).toBeCloseTo(1)
  }
  const held = framesOf([...closes, [150, open, 'input']], 900)
  expect(Math.min(...held.heights)).toBeGreaterThan((held.heights[0] ?? 0) - 0.5)
})

test('a row turned back twice, closed again while its space regrows and opened again, cuts its panel only while faint', () => {
  const open = asks(ALL, 'd11')
  const shut = asks(ALL, 'd11', null, ['d11'])
  const timings: [number, number, number][] = [
    [200, 260, 300],
    [200, 280, 340],
    [180, 240, 290],
    [250, 300, 350],
    [200, 300, 360],
    [200, 260, 450],
  ]
  for (const [backAt, shutAt, againAt] of timings) {
    const frames = framesOf(
      [
        [0, open],
        [0, shut, 'input'],
        [backAt, open, 'input'],
        [shutAt, shut, 'input'],
        [againAt, open, 'input'],
      ],
      1400,
    )
    const panel = frames.fading.filter(f => f.id === 'panel d11' && f.at > againAt)
    expect({ againAt, cuts: frames.cuts.filter(c => c.box === 'panel d11') }).toEqual({ againAt, cuts: [] })
    expect(panel.at(-1)?.opacity).toBeCloseTo(1)
  }
})

test('a row closed again while its turned-back panel is still faint keeps the panel drawn and cuts it only at 0.2 or under', () => {
  const open = asks(ALL, 'd11')
  const shut = asks(ALL, 'd11', null, ['d11'])
  const timings: [number, number][] = [
    [200, 400],
    [200, 360],
    [250, 420],
  ]
  for (const [backAt, shutAt] of timings) {
    const frames = framesOf(
      [
        [0, open],
        [0, shut, 'input'],
        [backAt, open, 'input'],
        [shutAt, shut, 'input'],
      ],
      1400,
    )
    const closeStart = frames.fading.filter(f => f.id === 'panel d11' && f.at >= shutAt && f.at < shutAt + 32)
    expect({
      shutAt,
      cuts: frames.cuts.filter(c => c.box === 'panel d11'),
      isDrawnAsCloseStarts: closeStart.length > 0 && closeStart.every(f => f.opacity > 0),
    }).toEqual({ shutAt, cuts: [], isDrawnAsCloseStarts: true })
  }
})

test('a click on a closing row’s title turns it back and fades its panel in at once, held under half while its space regrows, as a key does', async () => {
  let at = NOW
  const tick = () => setSystemTime(new Date((at += PRESS_GUARD_MS + 1)))
  const panel = await openPanel()
  try {
    panel.measure(() => ({ width: 300, height: 40 }))
    const rowId = openRow([...panel.panel.tracks.rows.values()].map(r => r.block))
    const title = () => allOf(panel.paint()).find(n => n.id === `title ${rowId}`)!
    tick()
    panel.click(title())
    panel.paint()
    setSystemTime(new Date(at + LEAVE_FADE_MS + 40))
    panel.paint()
    tick()
    panel.click(title())
    const shown = allOf(panel.paint()).find(n => n.id === `panel ${rowId}`)
    expect({ opacity: shown?.style.opacity, delay: shown?.delays.get('opacity') ?? 0 }).toEqual({
      opacity: TURNED_BACK_CUT_OPACITY,
      delay: 0,
    })
  } finally {
    setSystemTime(new Date(NOW))
  }
})
