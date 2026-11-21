import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'
import type { PressKind } from '../../types'

const { framesOf } = await import('./frames')
const { FRAME_MS } = await import('../../core/view/springs')
type Step = import('./frames').Step
const { tabBlocks } = await import('../src/draw')
const { NOW, demoScreen, dismissedPr, uiOn, withDismissedAsk } = await import('./fixtures')
const { drawOuts } = await import('../src/out')
const { keyMove } = await import('../src/keys')

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

test.failing(
  'D1, the person’s own press cutting the panel it opens: opening the goal field cuts no text as its box grows',
  () => {
    expect(goalFieldOpening().cuts.filter(c => c.at >= 0)).toEqual([])
  },
)

function emptyStatus(typing: 'goal' | null): Block[] {
  const screen = demoScreen()
  const statusPage = { ...screen.view.statusPage, goal: null, rows: [], isEmpty: true, suggestedGoal: null }

  return tabBlocks({ ...screen, view: { ...screen.view, statusPage } }, uiOn('overview', { typing }))
}

test('the empty Status page’s goal field opens and closes with no jump, and cuts no text', () => {
  for (const [from, to] of [
    [null, 'goal'],
    ['goal', null],
  ] as const) {
    const { jumps, cuts } = framesOf(
      [
        [0, emptyStatus(from)],
        [0, emptyStatus(to), 'input'],
      ],
      900,
    )
    expect({ to, jumps, cuts: cuts.filter(c => c.at >= 0) }).toEqual({ to, jumps: [], cuts: [] })
  }
})

test('a first draw with the empty Status page’s goal field already open shows Set and Cancel at once', () => {
  const buttons = framesOf([[0, emptyStatus('goal')]], 0).fading.filter(f => f.id === 'buttons goal')
  expect({ isDrawn: buttons.length > 0, hidden: buttons.filter(f => f.opacity < 1) }).toEqual({
    isDrawn: true,
    hidden: [],
  })
})

function outOn(open: Block[], rowId: string, action: string, label: string, kind: PressKind): Block[] {
  const out = { pressId: 'p5', uiPressId: 5, rowId, path: '/x', action, kind, label, pending: null, result: null }

  return drawOuts(open, [{ ...out, before: '', isWritten: true, waitingSince: NOW, isTaken: false }], {}, NOW)
}

const sendingOn = (open: Block[]) => outOn(open, 'd11', 'discuss', 'Discuss', 'talk')

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

function heightsPast(all: number[], ms: number): number[] {
  const heights = all.slice(-Math.ceil(ms / FRAME_MS))
  const start = heights[0] ?? 0
  const end = heights.at(-1) ?? 0

  return heights.filter(h => h < Math.min(start, end) - 0.5 || h > Math.max(start, end) + 0.5)
}

test('dismissing the open row moves the list only toward its new height and cuts no text', () => {
  const open = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const dismissed = tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' }))
  const frames = framesOf(
    [
      [0, open],
      [0, dismissed],
    ],
    900,
  )
  expect({ outside: heightsPast(frames.heights, 900), cuts: frames.cuts.filter(c => c.at >= 0) }).toEqual({
    outside: [],
    cuts: [],
  })
})

test('a dismissed PR’s block glides between its open and dismissed forms in both directions, cuts no text, and the list moves only toward its new height', () => {
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
    const cuts = frames.cuts.filter(c => c.at >= 0)
    expect({ name, jumps, cuts, outside: heightsPast(frames.heights, 900) }).toEqual({
      name,
      jumps: [],
      cuts: [],
      outside: [],
    })
  }
})

test('a Dismiss whose reply lands 16, 100 or 300 ms after its press moves the list only toward its new height, on an open row and on a PR’s block', () => {
  const ref = 'acme/visor#29'
  const openRow = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const openPr = tabBlocks(demoScreen(), uiOn('prs'))
  const cases = [
    [
      'row',
      openRow,
      outOn(openRow, 'd13', 'dismiss', 'Dismiss', 'mark'),
      tabBlocks(withDismissedAsk('d13', NOW), uiOn('needsYou', { selected: 'd13' })),
    ],
    ['pr', openPr, outOn(openPr, `pr:${ref}`, 'pr-dismiss', 'Dismiss', 'mark'), dismissedPr(ref).blocks],
  ] as const
  for (const [name, open, pressed, dismissed] of cases)
    for (const replyAt of [16, 100, 300]) {
      const frames = framesOf(
        [
          [0, open],
          [0, pressed, 'input'],
          [replyAt, dismissed],
        ],
        replyAt + 900,
      )
      expect({ name, replyAt, outside: heightsPast(frames.heights, replyAt + 900) }).toEqual({
        name,
        replyAt,
        outside: [],
      })
    }
})

test('a Dismiss out on a row the cursor leaves with j before its reply grows no status on the row it closes', () => {
  const pressedOn = tabBlocks(demoScreen(), uiOn('needsYou', { selected: 'd13' }))
  const move = keyMove('j', [], pressedOn, null)
  const next =
    move?.is === 'event' && move.event.type === 'step' ? move.event.ids[move.event.ids.indexOf('d13') + 1] : null
  const left = tabBlocks(demoScreen(), uiOn('needsYou', { selected: next ?? null }))
  const pressedThenLeft = outOn(left, 'd13', 'dismiss', 'Dismiss', 'mark')
  const statusOf = (blocks: Block[]) =>
    blocks.find((b): b is Extract<Block, { kind: 'row' }> => b.kind === 'row' && b.id === 'd13')?.feedback
  expect({ isMoved: next !== undefined && next !== null, status: statusOf(pressedThenLeft) }).toEqual({
    isMoved: true,
    status: statusOf(left),
  })
})
