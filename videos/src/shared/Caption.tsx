import { Easing, useVideoConfig } from 'remotion'

import { clamp01, easeInOut } from './geometry'
import { CAPTION_BAND } from './layout'

/**
 * A caption that enters word by word from `from` seconds into its beat and leaves just before `to`, so a beat's caption
 * is gone before the next one enters. Under footage it sits in the band below the picture. `inset` keeps it that far
 * from each side of the frame, in pixels.
 */
export function Caption(props: {
  text: string
  t: number
  from: number
  to: number
  inBand?: boolean
  inset?: number
}) {
  const { text, t, from, to, inBand = false, inset = 120 } = props
  const { height } = useVideoConfig()
  const leaving = easeInOut((t - (to - 0.3)) / 0.3)
  const pill = clamp01((t - from) / 0.25)
  if (t < from || leaving >= 1) return null

  const words = text.split(' ')
  const place = inBand ? { top: height - CAPTION_BAND, height: CAPTION_BAND - 6 } : { bottom: 72 }
  return (
    <div
      style={{
        position: 'absolute',
        left: inset,
        right: inset,
        ...place,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 1 - leaving,
        transform: `translateY(${leaving * 14}px)`,
      }}
    >
      <div style={{ fontSize: 48, lineHeight: 1.6, fontWeight: 600, textAlign: 'center', textWrap: 'balance' }}>
        {/* A wrapped caption's box would keep the full width, so each line draws its own background. */}
        <span
          style={{
            padding: '10px 30px',
            borderRadius: 999,
            backgroundColor: `rgba(0, 0, 0, ${0.72 * pill})`,
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
          }}
        >
          {words.map((word, i) => {
            const shown = Easing.out(Easing.cubic)(clamp01((t - from - 0.05 - 0.035 * i) / 0.3))
            return (
              <span key={i}>
                <span
                  style={{
                    display: 'inline-block',
                    opacity: shown,
                    transform: `translateY(${(1 - shown) * 18}px)`,
                  }}
                >
                  {word}
                </span>
                {i < words.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </span>
      </div>
    </div>
  )
}
