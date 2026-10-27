import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion'

import { AppLabel } from '../shared/AppLabel'
import { Beats } from '../shared/Beats'
import { Caption } from '../shared/Caption'
import { EndCard } from '../shared/EndCard'
import type { RowLines } from '../shared/EndCard'
import { clamp01, fit } from '../shared/geometry'
import { KeyCaps } from '../shared/KeyCaps'
import { PICTURE, TITLE_BAR } from '../shared/layout'
import { DARK_PALETTE, screenAt, useTerminalClip } from '../shared/TerminalTake'
import { continuing, takeTimeIn } from '../shared/terminal-time'
import { TerminalFootage, TerminalWindow } from '../shared/TerminalWindow'
import { END_CARD, END_CARD_LEAD, FPS, WIDTH } from '../shared/video'
import {
  CAPTION_INSET,
  captionEnd,
  CELL,
  FOCUS,
  FONT,
  KEYCAPS,
  MUSIC,
  TAKE,
  timeline,
  WHOLE,
  WINDOW,
  WINDOW_TITLE,
} from './timeline'
import type { Cut, FocusSpan, Placed, TerminalBeat } from './timeline'

/** How long the window takes to rise in at the start, in seconds. */
const RISE = 0.6

/** The lines the end card's streams leave: three spans across the terminal's text, on rows that hold text. */
function rowLines(): RowLines {
  const at = fit(PICTURE, WHOLE)
  const x = (col: number) => at.x + col * CELL.w * at.scale
  const y = (row: number) => Math.round(at.y + (TITLE_BAR + (row + 0.5) * CELL.h) * at.scale)
  const ys = [0, 2, 3, 5, 7, 12, 15, 17, 18].map(y)
  return [
    { from: x(2), to: x(32), ys },
    { from: x(34), to: x(64), ys },
    { from: x(66), to: x(96), ys },
  ].map(line => ({ ...line, from: Math.round(line.from), to: Math.round(line.to) }))
}

/** The omp promo's cut `cut`, one of `CUTS`. */
export function Video({ cut }: { cut: string }) {
  const placed = timeline(cut as Cut)
  return (
    <Beats placed={placed} music={MUSIC}>
      {(beat, previous) =>
        beat.kind === 'terminal' ? (
          <TerminalBeatView beat={beat} previous={previous} placed={placed} />
        ) : (
          <EndCard {...END_CARD} rowLines={rowLines()} length={beat.length} />
        )
      }
    </Beats>
  )
}

function TerminalBeatView(props: { beat: Placed & TerminalBeat; previous: Placed | undefined; placed: Placed[] }) {
  const { beat, previous, placed } = props
  const t = useCurrentFrame() / FPS
  const isFirst = previous === undefined
  const risen = isFirst ? Easing.out(Easing.cubic)(clamp01(t / RISE)) : 1
  const at = fit(PICTURE, WHOLE)
  // As the end card starts over the last beat, the window dims and sinks back while its lines turn into light.
  const next = placed[placed.indexOf(beat) + 1]
  const fading = next?.kind === 'end' ? clamp01((t - (beat.length - END_CARD_LEAD)) / 0.6) : 0
  const hasKeys = beat.keys.length > 0
  return (
    <AbsoluteFill>
      <div style={{ opacity: risen * (1 - fading) }}>
        <AppLabel name="omp" icon="icons/omp.svg" left={0} width={WIDTH} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: PICTURE.x,
          top: PICTURE.y,
          width: PICTURE.w,
          height: PICTURE.h,
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
            transform: `translate(${at.x - PICTURE.x}px, ${at.y - PICTURE.y + (1 - risen) * 40}px) scale(${at.scale})`,
          }}
        >
          <TerminalWindow
            title={WINDOW_TITLE}
            width={WINDOW.width}
            height={WINDOW.height - TITLE_BAR}
            background={DARK_PALETTE.background}
          >
            <div style={{ position: 'relative', height: WINDOW.height - TITLE_BAR }}>
              <TerminalFootage
                src={TAKE.src}
                segments={beat.footage}
                before={previous?.kind === 'terminal' ? continuing(previous.footage, previous.length) : undefined}
                font={FONT}
              />
              <Focus beat={beat} t={t} />
            </div>
          </TerminalWindow>
        </div>
      </div>
      <KeyCaps presses={beat.keys} t={t} right={KEYCAPS.right} bottom={KEYCAPS.bottom} />
      <Caption
        text={beat.caption}
        t={t}
        from={0}
        to={captionEnd(placed, beat)}
        inBand
        inset={hasKeys ? CAPTION_INSET : undefined}
      />
    </AbsoluteFill>
  )
}

/** The rows a focus span keeps bright on `lines`, first and last, or null when its target is not on screen. */
function focusRows(span: FocusSpan, lines: string[]): [number, number] | null {
  const plain = lines.map(l => l.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, ''))
  if (span.on === 'band') {
    const row = plain.findIndex(l => /^\s*(Nothing needed|Asks \d|Finds \d)/.test(l))
    return row < 0 ? null : [row, row]
  }
  const tabs = plain.findIndex(l => /\[1\] Asks/.test(l))
  return tabs < 0 ? null : [Math.max(0, tabs - 1), lines.length - 1]
}

/**
 * Dims every row of the take but the ones a beat's focus span keeps bright, so the eye lands on the inbox. The rows
 * come from the screen the take shows at that moment.
 */
function Focus(props: { beat: TerminalBeat; t: number }) {
  const { beat, t } = props
  const clip = useTerminalClip(TAKE.src)
  const span = beat.focus.find(s => t >= s.from && t < s.to)
  const segment = beat.footage.filter(s => s.at <= t).pop()
  if (!clip || !span || !segment) return null
  const rows = focusRows(span, screenAt(clip, takeTimeIn(segment, t)).lines)
  if (!rows) return null
  const easedIn = span.easeIn ? clamp01((t - span.from) / FOCUS.ease) : 1
  const easedOut = span.easeOut ? clamp01((span.to - t) / FOCUS.ease) : 1
  const strength = FOCUS.dim * Math.min(easedIn, easedOut)
  const shade = (top: number, rowCount: number) =>
    rowCount > 0 && (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: top * CELL.h,
          height: rowCount * CELL.h,
          backgroundColor: DARK_PALETTE.background,
          opacity: strength,
        }}
      />
    )
  const [first, last] = rows
  return (
    <>
      {shade(0, first)}
      {shade(last + 1, TAKE.rows - last - 1)}
    </>
  )
}
