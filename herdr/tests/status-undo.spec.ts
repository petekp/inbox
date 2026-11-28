import './gpui-stand-in'
import { expect, test } from 'bun:test'
import type { Block } from '../src/blocks'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import { removeGoal, restoreGoal } from '../../core/domain/status-goal-ops'

const { framesOf } = await import('./frames')
const { tabBlocks } = await import('../src/draw')
const { AGENT, NOW, demoScreen, uiOn } = await import('./fixtures')

type Overview = NonNullable<ReturnType<typeof demoSession>['ledger']['overview']>

function statusOf(change: (o: Overview) => Overview): Block[] {
  const s = demoSession(NOW, AGENT)
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const ledger = { ...s.ledger, overview: change(s.ledger.overview!) }
  const view = sessionView({ ...s, ledger }, NOW, SETTLED_MS, holds)

  return tabBlocks({ ...demoScreen(), view }, uiOn('overview'))
}

const PATH_FROM_SUBJECT_TO_MILESTONE =
  /^(stroke s1 path bottom|stroke (c1|c3|c4) path |space path (c1|c3|c4|m3)|stroke m3 path top)/
const SHOWN_EARLIER = 0.05

test('after Undo just after Remove on the Status goal, the path from a subject down to the next milestone shows as soon as both of them do', () => {
  const kept = statusOf(o => o)
  const removed = statusOf(removeGoal)
  const restored = statusOf(o => restoreGoal(removeGoal(o)))
  for (const undoAt of [220, 450]) {
    const { fading, strokes } = framesOf(
      [
        [0, kept],
        [0, removed, 'input'],
        [undoAt, restored, 'input'],
      ],
      undoAt + 1200,
    )
    const opacityOf = (id: string, at: number) => fading.find(f => f.id === id && f.at === at)?.opacity ?? 1
    const late = strokes
      .filter(s => s.at > undoAt && PATH_FROM_SUBJECT_TO_MILESTONE.test(s.id))
      .filter(s => s.opacity < Math.min(opacityOf('box s1', s.at), opacityOf('box m3', s.at)) - SHOWN_EARLIER)
      .map(s => `${s.id} at ${s.at}: ${s.opacity.toFixed(2)}, milestone ${opacityOf('box m3', s.at).toFixed(2)}`)
    expect({ undoAt, late }).toEqual({ undoAt, late: [] })
  }
})
