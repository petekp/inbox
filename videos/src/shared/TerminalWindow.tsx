import { useCurrentFrame, useVideoConfig } from 'remotion'

import { DISSOLVE } from './Footage'
import { SANS } from './fonts'
import { clamp01 } from './geometry'
import { TITLE_BAR } from './layout'
import { continues, takeTimeIn } from './terminal-time'
import type { TerminalSegment } from './terminal-time'
import { TerminalTake } from './TerminalTake'
import type { Palette, TerminalFont } from './TerminalTake'

/** How far a terminal take blurs at the middle of a dissolve, in pixels. */
const DISSOLVE_BLUR = 5

/** A macOS window in the dark appearance: a title bar with its three buttons and title, around its content. */
export function TerminalWindow(props: {
  title: string
  width: number
  height: number
  background: string
  children: React.ReactNode
}) {
  const { title, width, height, background, children } = props
  return (
    <div
      style={{
        position: 'relative',
        width,
        height: height + TITLE_BAR,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: background,
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.12), 0 24px 60px rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        style={{
          height: TITLE_BAR,
          backgroundColor: '#2a2a2e',
          borderBottom: '1px solid #111',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          color: '#a8a8b0',
          fontFamily: SANS,
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        <div style={{ position: 'absolute', left: 16, display: 'flex', gap: 9 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(color => (
            <div key={color} style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: color }} />
          ))}
        </div>
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * Stretches of a terminal take: each segment plays the take from `from` seconds at `at` seconds into the beat, until
 * the next segment. A segment that jumps in the take dissolves in over the one before it under a brief blur. One that
 * carries on, at another speed, follows it with no cut. The first dissolves in over `before`, where the previous beat's
 * last segment would continue from this beat's start, when there is one.
 */
export function TerminalFootage(props: {
  src: string
  segments: TerminalSegment[]
  before?: TerminalSegment
  font: TerminalFont
  palette?: Palette
}) {
  const { src, segments, before, font, palette } = props
  const t = useCurrentFrame() / useVideoConfig().fps
  const all: TerminalSegment[] = before
    ? [before, ...segments.map(s => ({ ...s, at: Math.max(s.at, 1e-6) }))]
    : segments
  const current = all.filter(s => s.at <= t).length - 1
  if (current < 0) return null
  const segment = all[current]!
  const previous = all[current - 1]
  const isDissolving = previous !== undefined && !continues(previous, segment) && t - segment.at < DISSOLVE
  const layers = isDissolving ? [previous, segment] : [segment]
  const p = clamp01((t - segment.at) / DISSOLVE)
  const blur = isDissolving ? DISSOLVE_BLUR * Math.sin(Math.PI * p) : 0
  return (
    <>
      {layers.map((layer, i) => (
        <div
          key={`${layer.at}-${layer.from}`}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: isDissolving && i === 1 ? p : 1,
            filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
          }}
        >
          <TerminalTake src={src} t={takeTimeIn(layer, t)} font={font} palette={palette} showCursor={false} />
        </div>
      ))}
    </>
  )
}
