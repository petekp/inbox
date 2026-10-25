import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'

import { SANS, useFonts } from './fonts'
import { BACKGROUND } from './layout'
import { Music } from './Music'
import type { MusicCue } from './Music'
import { END_CARD_LEAD, frames } from './video'

/** A beat placed in its video: what it is, its number and id, and when it starts and how long it runs, in seconds. */
export type PlacedBeat = { kind: string; id: string; number: number; start: number; length: number }

/**
 * A video's frame: its background, its music, and each beat drawn by `children` from the beat's start. The end card
 * starts END_CARD_LEAD seconds early, over the beat before it.
 */
export function Beats<B extends PlacedBeat>(props: {
  placed: B[]
  music: MusicCue
  children: (beat: B, previous: B | undefined) => ReactNode
}) {
  const { placed, music, children } = props
  const { fps } = useVideoConfig()
  useFonts()
  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND, fontFamily: SANS, color: 'white' }}>
      <Music cue={music} />
      {placed.map((beat, i) => {
        const lead = beat.kind === 'end' ? END_CARD_LEAD : 0
        return (
          <Sequence
            key={beat.id}
            name={`${beat.number} ${beat.id}`}
            from={frames(beat.start - lead, fps)}
            durationInFrames={frames(beat.start + beat.length, fps) - frames(beat.start - lead, fps)}
          >
            {children(beat, placed[i - 1])}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
