import { Easing } from 'remotion'

export type Rect = { x: number; y: number; w: number; h: number }

/** A point on the recorded screen, in points from its top left. */
export type Point = [number, number]

export const clamp01 = (p: number) => Math.min(1, Math.max(0, p))
export const easeInOut = (p: number) => Easing.inOut(Easing.cubic)(clamp01(p))

export function between(a: Rect, b: Rect, p: number): Rect {
  const mix = (from: number, to: number) => from + (to - from) * p
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) }
}

/** A camera move from one framing of a take's clip to another. A framing left out is the whole window. */
export type CameraMove = { at: number; length: number; from?: Rect; to?: Rect }

/** The part of the take's clip the camera frames at second `t` of the beat. */
export function framingAt(moves: CameraMove[] | undefined, whole: Rect, t: number): Rect {
  const first = moves?.[0]
  if (!moves || !first) return whole
  let framing = first.from ?? whole
  for (const move of moves) {
    if (t < move.at) break
    framing = between(move.from ?? whole, move.to ?? whole, easeInOut((t - move.at) / move.length))
  }
  return framing
}
