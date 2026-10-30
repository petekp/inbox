import type { ReactNode } from 'react'
import { Easing, interpolate } from 'remotion'
import { SANS } from '../shared/fonts'
import { between, clamp01, easeInOut } from '../shared/geometry'
import type { Rect } from '../shared/geometry'
import { label } from './Picture'
import { MARKS } from './ThreadView'
import type { Introduction } from './timeline'

/** Terminal.app's background in the session take. */
const TERMINAL_BACKGROUND = '#1a1a1a'

/**
 * Beat 7's introduction of the inbox, drawn over the take in its clip's pixels. The pane slides in from the window's
 * right edge and is named. The question is marked in the reply, the mark moves to the question's row as it lands in
 * the inbox, and the reply dims.
 */
export function IntroduceInbox(props: {
  introduction: Introduction
  picture: ReactNode
  t: number
  length: number
  scale: number
  clipWidth: number
  clipHeight: number
}) {
  const { introduction: intro, picture, t, length, scale, clipWidth, clipHeight } = props
  const { pane, asked, row } = intro
  const slid = Easing.out(Easing.cubic)(clamp01((t - intro.paneAt) / 0.6))
  const named = Easing.out(Easing.back(1.8))(clamp01((t - intro.paneAt - 0.5) / 0.35))
  const outlined = clamp01((t - intro.paneAt - 0.4) / 0.4) * (1 - 0.6 * clamp01((t - intro.rowAt) / 0.6))
  const flight = 0.5
  const marked = clamp01((t - intro.askedAt) / 0.3) * (1 - clamp01((t - (intro.rowAt - flight)) / 0.15))
  const flying = clamp01((t - (intro.rowAt - flight)) / flight)
  const landed = t >= intro.rowAt
  const ending = 1 - clamp01((t - (length - 0.5)) / 0.5)
  const dimmed = 0.55 * clamp01((t - intro.rowAt) / 0.5) * ending
  /** A size in screen pixels, in the clip's pixels, so labels keep their size as the camera pushes in. */
  const px = (n: number) => n / scale
  const question = MARKS.question
  const dx = (1 - slid) * (clipWidth - pane.x)
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: pane.x,
          top: pane.y,
          width: pane.w,
          height: pane.h,
          backgroundColor: TERMINAL_BACKGROUND,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${dx}px)` }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: `inset(${pane.y}px ${clipWidth - pane.x - pane.w}px ${clipHeight - pane.y - pane.h}px ${pane.x}px)`,
          }}
        >
          {picture}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: clipWidth,
          height: clipHeight,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: pane.x,
            top: pane.y,
            width: pane.w,
            height: pane.h,
            boxShadow: `0 0 0 ${clipWidth}px rgba(0, 0, 0, ${dimmed})`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: pane.x + dx - px(3),
          top: pane.y - px(3),
          width: pane.w + px(6),
          height: pane.h + px(6),
          border: `${px(3)}px solid rgba(255, 255, 255, ${0.85 * outlined * ending})`,
          borderRadius: px(10),
          boxShadow: `0 0 ${px(28)}px rgba(255, 255, 255, ${0.35 * outlined * ending})`,
          boxSizing: 'border-box',
        }}
      />
      {named > 0 && (
        <div
          style={{
            position: 'absolute',
            left: pane.x + dx + pane.w - px(150),
            top: pane.y - px(22),
            opacity: clamp01(named * 2) * ending,
            transformOrigin: '50% 50%',
            transform: `scale(${0.5 + 0.5 * named})`,
            padding: `${px(4)}px ${px(18)}px`,
            borderRadius: px(999),
            backgroundColor: 'white',
            color: '#111',
            fontFamily: SANS,
            fontSize: px(30),
            fontWeight: 700,
            lineHeight: 1.2,
            boxShadow: `0 ${px(4)}px ${px(16)}px rgba(0, 0, 0, 0.5)`,
          }}
        >
          Inbox
        </div>
      )}
      {marked > 0 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: asked.x,
              top: asked.y,
              width: asked.w,
              height: asked.h,
              opacity: marked,
              backgroundColor: question.fill,
              boxShadow: `inset ${px(6)}px 0 0 ${question.bar}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: asked.x + asked.w - px(130),
              top: asked.y + asked.h - px(44),
              opacity: marked,
              padding: `${px(2)}px ${px(12)}px`,
              borderRadius: px(8),
              backgroundColor: question.bar,
              color: '#111',
              fontFamily: SANS,
              fontSize: px(22),
              fontWeight: 600,
            }}
          >
            {question.label}
          </div>
        </>
      )}
      {flying > 0 && (
        <MovingMark
          rect={between(asked, row, easeInOut(flying))}
          landed={landed}
          age={t - intro.rowAt}
          opacity={ending}
          px={px}
        />
      )}
    </>
  )
}

/** The question's mark on its way from the reply to the inbox, then a ring around the row it lands on. */
function MovingMark(props: { rect: Rect; landed: boolean; age: number; opacity: number; px: (n: number) => number }) {
  const { rect, landed, age, opacity, px } = props
  const question = MARKS.question
  const pulse = landed ? interpolate(age, [0, 0.12, 0.5], [1.06, 1.1, 1], { extrapolateRight: 'clamp' }) : 1
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        opacity,
        transform: `scale(${pulse})`,
        borderRadius: px(8),
        border: `${px(4)}px solid ${question.bar}`,
        backgroundColor: landed ? `rgba(245, 180, 40, ${0.22 * (1 - clamp01(age / 0.6))})` : question.fill,
        boxShadow: `0 0 ${px(24)}px rgba(245, 180, 40, ${landed ? 0.6 : 0.3})`,
        boxSizing: 'border-box',
      }}
    />
  )
}
