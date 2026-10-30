import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Beats } from '../shared/Beats'
import { Caption } from '../shared/Caption'
import { EndCard } from '../shared/EndCard'
import { END_CARD, FPS } from '../shared/video'
import { SideBySideView } from './SideBySideView'
import { SoloView } from './SoloView'
import type { ThreadStarts } from './thread'
import { ThreadView } from './ThreadView'
import { MUSIC, ROW_LINES, timeline } from './timeline'
import type { Placed, Variant } from './timeline'

/** The launch video's cut `cut`, one of `VARIANTS`. */
export function Video({ cut }: { cut: string }) {
  const variant = cut as Variant
  const placed = timeline(variant)
  const starts = Object.fromEntries(placed.filter(b => b.kind === 'thread').map(b => [b.id, b.start])) as ThreadStarts
  return (
    <Beats placed={placed} music={MUSIC}>
      {(beat, previous) => <BeatView beat={beat} previous={previous} variant={variant} starts={starts} />}
    </Beats>
  )
}

function BeatView(props: { beat: Placed; previous: Placed | undefined; variant: Variant; starts: ThreadStarts }) {
  const { beat, previous, variant, starts } = props
  const t = useCurrentFrame() / FPS
  const hasCaptions = variant !== 'launch-captions-off'
  return (
    <AbsoluteFill>
      {beat.kind === 'thread' && (
        <>
          <ThreadView starts={starts} t={beat.start + t} />
          {hasCaptions && <Caption text={beat.caption} t={t} from={0} to={beat.length} />}
        </>
      )}
      {beat.kind === 'solo' && (
        <SoloView beat={beat} previous={previous} starts={starts} t={t} hasCaptions={hasCaptions} />
      )}
      {beat.kind === 'side-by-side' && (
        <SideBySideView beat={beat} previous={previous} t={t} hasCaptions={hasCaptions} />
      )}
      {beat.kind === 'end' && <EndCard {...END_CARD} rowLines={ROW_LINES} length={beat.length} />}
    </AbsoluteFill>
  )
}
