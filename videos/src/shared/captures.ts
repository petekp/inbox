import { getStaticFiles } from 'remotion'

import type { Point } from './geometry'

/** A cut take's entry in its video's takes.json, which record/cut.py writes. */
export type TakeInfo = {
  src: string
  width: number
  height: number
  /** The app window's bounds on the recorded screen, in points: x, y, w, h. */
  window?: number[]
  /** Seconds into the clip where its beat's first frame falls, for a take drive.py recorded. */
  beatStartsAt?: number
}

/** The app window's place on the VM's screen in every take so far, in points, for a take that doesn't record its own. */
const USUAL_WINDOW = [0, 25, 1024]

let captured: Set<string> | undefined
/**
 * Git ignores captured takes, stills, music and icons, so a checkout without them draws placeholders instead of failing
 * to load.
 */
export const isCaptured = (file: string) => (captured ??= new Set(getStaticFiles().map(f => f.name))).has(file)

/** Maps a screen point to pixels in a take's clip, or in a still of the same window. */
export function toClip(take: TakeInfo | undefined, clipWidth: number) {
  const [left = 0, top = 0, width = 1024] = take?.window || USUAL_WINDOW
  const scale = clipWidth / width
  return ([x, y]: Point) => ({ x: (x - left) * scale, y: (y - top) * scale })
}
