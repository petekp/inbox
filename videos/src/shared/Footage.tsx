import type { ReactNode } from 'react'
import { OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

import { clamp01 } from './geometry'
import { frames } from './video'

/** From `at` seconds into its beat, the beat plays take `take` from `from` seconds into it. */
export type Segment = { at: number; take: string; from: number }

/** How long one stretch of footage takes to dissolve into the next, in seconds. */
export const DISSOLVE = 0.25
/** How far footage blurs at the middle of a dissolve, in the clip's pixels. */
const DISSOLVE_BLUR = 7

/**
 * Each segment of a take, played from its point in the take until the next segment or the beat's end. Each segment
 * dissolves in over the one before it, and the first over `before`, the previous beat's footage, when there is one.
 * `clip` names a take's clip in public/.
 */
export function Footage(props: {
  segments: Segment[]
  before?: Segment
  length: number
  width: number
  height: number
  clip: (take: string) => string
}) {
  const { segments, before, length, width, height, clip } = props
  const { fps } = useVideoConfig()
  const all = before ? [before, ...segments] : segments
  return (
    <>
      {all.map((segment, i) => {
        const next = all[i + 1]
        const end = next ? next.at + DISSOLVE : length
        return (
          <Sequence
            key={`${i}-${segment.take}-${segment.from}`}
            from={frames(segment.at, fps)}
            durationInFrames={Math.max(1, frames(Math.min(end, length), fps) - frames(segment.at, fps))}
            layout="none"
          >
            <Dissolve isFirst={i === 0} handsOverAt={next ? next.at - segment.at : undefined}>
              <OffthreadVideo
                src={staticFile(clip(segment.take))}
                trimBefore={frames(segment.from, fps)}
                muted
                style={{ position: 'absolute', left: 0, top: 0, width, height, display: 'block' }}
              />
            </Dissolve>
          </Sequence>
        )
      })}
    </>
  )
}

/**
 * A segment fading in over the one before it. Both blur briefly while they overlap, so two scrolls of the same text never
 * show sharp at once. `handsOverAt` is when the next segment starts, in seconds into this one.
 */
function Dissolve(props: { isFirst: boolean; handsOverAt?: number; children: ReactNode }) {
  const { isFirst, handsOverAt, children } = props
  const t = useCurrentFrame() / useVideoConfig().fps
  const arriving = isFirst ? 1 : clamp01(t / DISSOLVE)
  const blurAt = (p: number) => DISSOLVE_BLUR * Math.sin(Math.PI * clamp01(p))
  const blur = Math.max(
    isFirst ? 0 : blurAt(t / DISSOLVE),
    handsOverAt === undefined || t < handsOverAt ? 0 : blurAt((t - handsOverAt) / DISSOLVE),
  )
  return (
    <div
      style={{ position: 'absolute', inset: 0, opacity: arriving, filter: blur > 0.1 ? `blur(${blur}px)` : undefined }}
    >
      {children}
    </div>
  )
}
