import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { LINE_MOVE_MS, lineMoveShare } from '../core/view/row-motion'
import { FRAME_MS, springFrames, springStep } from '../core/view/springs'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

test('a spring last aimed hours ago is at its target, and finding that takes less than a frame', () => {
  const started = performance.now()
  const s = springStep({ x: 0, v: 0 }, 120, SIX_HOURS_MS)
  const tookMs = performance.now() - started

  expect(s).toEqual({ x: 120, v: 0 })
  expect(tookMs).toBeLessThan(FRAME_MS)
})

test('a spring that passes within half a pixel between frames keeps moving to the frames springFrames gives', () => {
  const nudged = { x: 0, v: 0.05 }
  const frames = springFrames(nudged, 0)
  const stepped = frames.slice(1, -1).map((_, i) => springStep(nudged, 0, (i + 1) * FRAME_MS).x)

  expect(frames.length).toBeGreaterThan(3)
  expect(stepped).toEqual(frames.slice(1, -1))
})

test('a line that moves between lists covers its way on the spring, not in its first frames', () => {
  const shares = Array.from({ length: LINE_MOVE_MS / FRAME_MS }, (_, i) => lineMoveShare(i * FRAME_MS))

  expect(shares[0]).toBe(0)
  expect(shares.every((s, i) => i === 0 || s >= (shares[i - 1] ?? 0))).toBe(true)
  expect(lineMoveShare(5 * FRAME_MS)).toBeLessThan(0.95)
  expect(lineMoveShare(LINE_MOVE_MS)).toBe(1)
})
