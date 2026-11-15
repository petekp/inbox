import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { SETTLED_MS } from '../../hooks/timing'
import { button } from '../src/blocks'
import type { Block, RowBlock } from '../src/blocks'
import type { TimeLeft } from '../src/time-left'
import { columnOf } from './gpui-stand-in'
import { NOW, demoScreen, dismissedPr, uiOn } from './fixtures'

const { tabBlocks } = await import('../src/draw')
const { TIMED_W, timeLeftEl } = await import('../src/paint-timer')
const { TIME_LEFT_STEP_MS, timeLeftDraws, timeLeftNextAt, timeLeftShare } = await import('../src/time-left')
const { LINE } = await import('../src/paint-theme')

const theme = new Proxy({}, { get: () => '#808080' }) as never
const rowOf = (blocks: Block[]) => blocks.find((b): b is RowBlock => b.kind === 'row')!

test('every draw sets an emptying Undo fill near the share its clock leaves, so a fill on a new element shows its time', () => {
  const runsOutAt = NOW + SETTLED_MS
  const undo = { ...button('d8 undo', 'Undo', 'normal'), runsOutAt }
  const row = { ...rowOf(tabBlocks(demoScreen(), uiOn('needsYou'))), buttons: [undo] }
  let drawn: ReadonlyMap<string, TimeLeft> = new Map()
  const draws = [0, 16, 40, 2560, 4900, 5000].map(after => {
    const now = NOW + after
    drawn = timeLeftDraws([row], drawn, now)
    const left = drawn.get('d8 undo')!
    const fill = columnOf([timeLeftEl('d8 undo', left, runsOutAt, now, theme)], LINE).kids[0]!
    const behind = timeLeftShare(runsOutAt, now) * TIMED_W - (fill.style.w ?? 0)
    const glideMs = fill.transitions.get('width') ?? 0

    return {
      after,
      isNearClock: behind >= 0 && behind <= (TIME_LEFT_STEP_MS / SETTLED_MS) * TIMED_W,
      isShown: runsOutAt - now <= TIME_LEFT_STEP_MS || (fill.style.w ?? 0) > 0,
      endsInTime: now + glideMs <= runsOutAt,
    }
  })
  for (const d of draws) expect(d).toEqual({ after: d.after, isNearClock: true, isShown: true, endsInTime: true })
})

test('the look draws again while a dismissed PR’s Undo fill empties, and when its time runs out', () => {
  const ref = 'acme/visor#29'
  const { blocks } = dismissedPr(ref)
  const runsOutAt = NOW - 500 + SETTLED_MS
  const undo = blocks.flatMap(b => (b.kind === 'row' ? b.buttons : [])).find(b => b.runsOutAt !== undefined)
  expect(undo?.runsOutAt).toBe(runsOutAt)
  const next = timeLeftNextAt(blocks, NOW)
  expect(next !== null && next > NOW && next <= NOW + TIME_LEFT_STEP_MS).toBe(true)
  expect(timeLeftNextAt(blocks, runsOutAt - 10)).toBe(runsOutAt)
  expect(timeLeftNextAt(blocks, runsOutAt)).toBeNull()
})
