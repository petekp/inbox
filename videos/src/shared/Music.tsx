import { Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion'

import { isCaptured } from './captures'

/**
 * A video's music: the file in public/music/, which Git ignores, starting `startsAt` seconds into the video from
 * `trimBefore` seconds into the track, and fading out over the video's last `fadeOut` seconds.
 */
export type MusicCue = { src: string; startsAt: number; trimBefore: number; fadeOut: number }

/** Plays the cue, or nothing when its file is missing. */
export function Music({ cue }: { cue: MusicCue }) {
  const { fps, durationInFrames } = useVideoConfig()
  const frames = (seconds: number) => Math.round(seconds * fps)
  if (!isCaptured(cue.src)) return null

  return (
    <Sequence name="music" from={frames(cue.startsAt)}>
      <Html5Audio
        src={staticFile(cue.src)}
        trimBefore={frames(cue.trimBefore)}
        volume={f => {
          const end = durationInFrames - frames(cue.startsAt)
          return interpolate(f, [end - frames(cue.fadeOut), end], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }}
      />
    </Sequence>
  )
}
