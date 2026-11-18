import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'

const { framesOf } = await import('./frames')
type Step = import('./frames').Step
const { tabBlocks } = await import('../src/draw')
const { NOW, demoScreen, dismissedPr, uiOn } = await import('./fixtures')
const { drawOuts } = await import('../src/out')

const goalFieldOpening = () =>
  framesOf(
    [
      [0, tabBlocks(demoScreen(), uiOn('overview'))],
      [0, tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' })), 'input'],
    ],
    900,
  )

test('opening the goal field shows its buttons only once its box is nearly open and never cuts them', () => {
  const { cuts, fading } = goalFieldOpening()
  const opened = fading.filter(f => f.id === 'box goal field' && f.at >= 0 && f.height > 0)
  const buttonCuts = cuts.filter(c => c.at >= 0 && !c.text.startsWith('text field'))
  expect({ buttonCuts, isShownOnceOpen: opened.every(f => f.opacity === 1) }).toEqual({
    buttonCuts: [],
    isShownOnceOpen: true,
  })
})

test.failing('opening the goal field cuts no text as its box grows', () => {
  expect(goalFieldOpening().cuts.filter(c => c.at >= 0)).toEqual([])
})

function sendingOn(open: Block[]): Block[] {
  const out = {
    pressId: 'p5',
    rowId: 'd11',
    path: '/x',
    action: 'discuss',
    label: 'Discuss',
    pending: null,
    result: null,
  }

  return drawOuts(open, [{ ...out, before: '', isWritten: true, waitingSince: NOW, isTaken: false }], {}, NOW)
}

test('closing the goal field while its buttons fade in never shows them more than if it had stayed open', () => {
  const closed = tabBlocks(demoScreen(), uiOn('overview'))
  const typing = tabBlocks(demoScreen(), uiOn('overview', { typing: 'goal' }))
  const closeAt = 300
  const shownAt = (steps: Step[]) => {
    const { fading } = framesOf(steps, 700)
    const of = (id: string, at: number) => fading.find(f => f.id === id && f.at === at)?.opacity ?? 1
    const ats = [...new Set(fading.filter(f => f.at >= closeAt && f.id === 'box goal field').map(f => f.at))]

    return new Map(ats.map(at => [at, of('buttons goal', at) * of('box goal field', at)]))
  }
  const stayed = shownAt([
    [0, closed],
    [0, typing, 'input'],
  ])
  const shut = shownAt([
    [0, closed],
    [0, typing, 'input'],
    [closeAt, closed, 'input'],
  ])
  const above = [...shut].filter(([at, o]) => o > (stayed.get(at) ?? 1) + 0.01).map(([at]) => at)
  expect(above).toEqual([])
})

test('a press’s status under a row’s buttons shows in the press’s own draw', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd11' }))
  const { fading } = framesOf(
    [
      [0, open],
      [0, sendingOn(open), 'input'],
    ],
    400,
  )
  const hidden = fading.filter(f => f.id === 'status d11' && f.at >= 0 && f.opacity < 1)
  expect(hidden).toEqual([])
})

test('a status under a row’s buttons that no press brought fades in once the row’s box is nearly open, and fades out before its space closes', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd11' }))
  const endsAt = 700
  const { cuts, fading, heights } = framesOf(
    [
      [0, open],
      [0, sendingOn(open)],
      [endsAt, open],
    ],
    1400,
  )
  const status = fading.filter(f => f.id === 'status d11')
  const goneAt = status.at(-1)?.at ?? 0
  const heightAt = (at: number) => heights[Math.round((at + 500) / 16)] ?? NaN
  const whileFading = status.filter(f => f.at >= endsAt).map(f => heightAt(f.at))
  expect({
    cuts: cuts.filter(c => c.at >= 0),
    fadesOut: (status.at(-1)?.opacity ?? 1) < 0.05,
    holds: whileFading.every(h => h >= heightAt(endsAt) - 0.5),
    shrinks: heightAt(goneAt + 300) < heightAt(endsAt) - 1,
  }).toEqual({ cuts: [], fadesOut: true, holds: true, shrinks: true })
})

test('a dismissed PR’s block glides between its open and dismissed forms in both directions, and the list moves only toward its new height', () => {
  const open = tabBlocks(demoScreen(), uiOn('prs'))
  const dismissed = dismissedPr('acme/visor#29').blocks
  for (const [name, from, to] of [
    ['dismiss', open, dismissed],
    ['undo', dismissed, open],
  ] as const) {
    const frames = framesOf(
      [
        [0, [...from]],
        [0, [...to]],
      ],
      900,
    )
    const jumps = frames.jumps.filter(j => j.at >= 0)
    const start = frames.heights[0] ?? 0
    const end = frames.heights.at(-1) ?? 0
    const isOutside = (h: number) => h < Math.min(start, end) - 0.5 || h > Math.max(start, end) + 0.5
    expect({ name, jumps, outside: frames.heights.filter(isOutside) }).toEqual({ name, jumps: [], outside: [] })
  }
})
