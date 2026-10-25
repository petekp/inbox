import { Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion'

import { isCaptured } from './captures'
import { frames } from './video'

/**
 * A video's music: the file in public/music/, which Git ignores, starting `startsAt` seconds into the video from
 * `trimBefore` seconds into the track, and fading out over the video's last `fadeOut` seconds.
 */
export type MusicCue = { src: string; startsAt: number; trimBefore: number; fadeOut: number }

/** Plays the cue, or nothing when its file is missing. */
export function Music({ cue }: { cue: MusicCue }) {
  const { fps, durationInFrames } = useVideoConfig()
  if (!isCaptured(cue.src)) return null

  return (
    <Sequence name="music" from={frames(cue.startsAt, fps)}>
      <Html5Audio
        src={staticFile(cue.src)}
        trimBefore={frames(cue.trimBefore, fps)}
        volume={f => {
          const end = durationInFrames - frames(cue.startsAt, fps)
          return interpolate(f, [end - frames(cue.fadeOut, fps), end], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }}
      />
    </Sequence>
  )
}
