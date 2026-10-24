import { useCurrentFrame, useVideoConfig } from 'remotion'

import { DISSOLVE } from './Footage'
import type { Segment } from './Footage'
import { SANS } from './fonts'
import { clamp01 } from './geometry'
import { TITLE_BAR } from './layout'
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
 * the next segment. Each segment dissolves in over the one before it under a brief blur, and the first over `before`,
 * the previous beat's last segment, when there is one.
 */
export function TerminalFootage(props: {
  src: string
  segments: Segment[]
  before?: Segment
  font: TerminalFont
  palette?: Palette
}) {
  const { src, segments, before, font, palette } = props
  const t = useCurrentFrame() / useVideoConfig().fps
  const all = before ? [{ ...before, at: -Infinity }, ...segments] : segments
  const current = all.filter(s => s.at <= t).length - 1
  const shown = current < 0 ? [] : [current - 1, current].filter(i => i >= 0)
  return (
    <>
      {shown.map(i => {
        const segment = all[i]!
        const next = all[i + 1]
        const isArriving = i === current && i > 0 && t - segment.at < DISSOLVE
        const isLeaving = next !== undefined && next.at <= t
        if (isLeaving && t - next.at >= DISSOLVE) return null
        const p = isArriving ? clamp01((t - segment.at) / DISSOLVE) : isLeaving ? clamp01((t - next.at) / DISSOLVE) : 1
        const blur = isArriving || isLeaving ? DISSOLVE_BLUR * Math.sin(Math.PI * p) : 0
        const at = segment.at === -Infinity ? 0 : segment.at
        return (
          <div
            key={`${i}-${segment.from}`}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: isArriving ? p : 1,
              filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
            }}
          >
            <TerminalTake src={src} t={segment.from + (t - at)} font={font} palette={palette} showCursor={false} />
          </div>
        )
      })}
    </>
  )
}
