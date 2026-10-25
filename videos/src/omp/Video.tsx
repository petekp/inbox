import { AbsoluteFill, Easing, Sequence, useCurrentFrame } from 'remotion'

import { AppLabel } from '../shared/AppLabel'
import { Caption } from '../shared/Caption'
import { EndCard } from '../shared/EndCard'
import type { RowLines } from '../shared/EndCard'
import { SANS, useFonts } from '../shared/fonts'
import { clamp01, framingAt } from '../shared/geometry'
import type { Rect } from '../shared/geometry'
import { KeyCaps } from '../shared/KeyCaps'
import { BACKGROUND, BAND, CAPTION_BAND, TITLE_BAR } from '../shared/layout'
import { Music } from '../shared/Music'
import { DARK_PALETTE } from '../shared/TerminalTake'
import { takeTimeIn } from '../shared/terminal-time'
import type { TerminalSegment } from '../shared/terminal-time'
import { TerminalFootage, TerminalWindow } from '../shared/TerminalWindow'
import { END_CARD, END_CARD_LEAD, FPS, frames, HEIGHT, WIDTH } from '../shared/video'
import { captionEnd, CELL, FONT, MUSIC, TAKE, timeline, WINDOW, WINDOW_TITLE } from './timeline'
import type { Cut, Placed, TerminalBeat } from './timeline'

/** The picture between the app band and the caption band. */
const AREA = { x: 0, y: BAND, w: WIDTH, h: HEIGHT - BAND - CAPTION_BAND }
/** How long the window takes to rise in at the start, in seconds. */
const RISE = 0.6

/** Where the window sits and how large, for a framing of it: the framing fills the picture, centered. */
function placement(framing: Rect) {
  const scale = Math.min(AREA.w / framing.w, AREA.h / framing.h)
  return {
    scale,
    x: AREA.x + AREA.w / 2 - (framing.x + framing.w / 2) * scale,
    y: AREA.y + AREA.h / 2 - (framing.y + framing.h / 2) * scale,
  }
}

/**
 * The lines the end card's streams leave: three spans across the terminal's text, on rows that hold text as beat 5
 * ends, where the camera has pulled back to the whole window.
 */
function rowLinesAt(beat: TerminalBeat): RowLines {
  const at = placement(framingAt(beat.camera, beat.framing, beat.length))
  const x = (col: number) => at.x + col * CELL.w * at.scale
  const y = (row: number) => Math.round(at.y + (TITLE_BAR + (row + 0.5) * CELL.h) * at.scale)
  const ys = [0, 2, 4, 9, 12, 15, 18, 21, 28].map(y)
  return [
    { from: x(2), to: x(32), ys },
    { from: x(34), to: x(64), ys },
    { from: x(66), to: x(96), ys },
  ].map(line => ({ ...line, from: Math.round(line.from), to: Math.round(line.to) }))
}

/** The omp promo's cut `cut`, one of `CUTS`. */
export function Video({ cut }: { cut: string }) {
  useFonts()
  const placed = timeline(cut as Cut)
  const last = placed.filter((b): b is Placed & TerminalBeat => b.kind === 'terminal').pop()
  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND, fontFamily: SANS, color: 'white' }}>
      <Music cue={MUSIC} />
      {placed.map((beat, i) => {
        const lead = beat.kind === 'end' ? END_CARD_LEAD : 0
        return (
          <Sequence
            key={beat.id}
            name={`${beat.number} ${beat.id}`}
            from={frames(beat.start - lead, FPS)}
            durationInFrames={frames(beat.start + beat.length, FPS) - frames(beat.start - lead, FPS)}
          >
            {beat.kind === 'terminal' ? (
              <TerminalBeatView beat={beat} previous={placed[i - 1]} placed={placed} />
            ) : (
              last && <EndCard {...END_CARD} rowLines={rowLinesAt(last)} length={beat.length} />
            )}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

/** Where the previous beat's last stretch of the take would continue, so this beat can dissolve from it. */
function continuing(beat: Placed | undefined): TerminalSegment | undefined {
  if (beat?.kind !== 'terminal') return undefined
  const last = beat.footage[beat.footage.length - 1]
  return last && { ...last, at: 0, from: takeTimeIn(last, beat.length) }
}

function TerminalBeatView(props: { beat: Placed & TerminalBeat; previous: Placed | undefined; placed: Placed[] }) {
  const { beat, previous, placed } = props
  const t = useCurrentFrame() / FPS
  const isFirst = previous === undefined
  const risen = isFirst ? Easing.out(Easing.cubic)(clamp01(t / RISE)) : 1
  const at = placement(framingAt(beat.camera, beat.framing, t))
  // As the end card starts over the last beat, the window dims and sinks back while its lines turn into light.
  const next = placed[placed.indexOf(beat) + 1]
  const fading = next?.kind === 'end' ? clamp01((t - (beat.length - END_CARD_LEAD)) / 0.6) : 0
  return (
    <AbsoluteFill>
      <div style={{ opacity: risen * (1 - fading) }}>
        <AppLabel name="omp" icon="icons/omp.svg" left={0} width={WIDTH} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: AREA.x,
          top: AREA.y,
          width: AREA.w,
          height: AREA.h,
          overflow: 'hidden',
          opacity: risen * (1 - fading),
          filter: fading > 0 ? `blur(${fading * 10}px) brightness(${1 - 0.5 * fading})` : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${at.x - AREA.x}px, ${at.y - AREA.y + (1 - risen) * 40}px) scale(${at.scale})`,
          }}
        >
          <TerminalWindow
            title={WINDOW_TITLE}
            width={WINDOW.width}
            height={WINDOW.height - TITLE_BAR}
            background={DARK_PALETTE.background}
          >
            <div style={{ position: 'relative', height: WINDOW.height - TITLE_BAR }}>
              <TerminalFootage src={TAKE.src} segments={beat.footage} before={continuing(previous)} font={FONT} />
            </div>
          </TerminalWindow>
        </div>
      </div>
      <KeyCaps presses={beat.keys} t={t} right={72} bottom={CAPTION_BAND + 28} />
      <Caption text={beat.caption} t={t} from={0} to={captionEnd(placed, beat)} inBand />
    </AbsoluteFill>
  )
}
