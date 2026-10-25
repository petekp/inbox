import type { ReactNode } from 'react'
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion'

import { AppLabel } from '../shared/AppLabel'
import { Caption } from '../shared/Caption'
import { isCaptured, toClip as toClipOf } from '../shared/captures'
import type { TakeInfo } from '../shared/captures'
import { EndCard } from '../shared/EndCard'
import { Footage } from '../shared/Footage'
import type { Segment } from '../shared/Footage'
import { SANS, useFonts } from '../shared/fonts'
import { between, clamp01, easeInOut, framingAt } from '../shared/geometry'
import type { Point, Rect } from '../shared/geometry'
import { BACKGROUND, BAND, CAPTION_BAND } from '../shared/layout'
import { Music } from '../shared/Music'
import { Pointer } from '../shared/Pointer'
import { pointerMarks, stateAt } from '../shared/states'
import type { State } from '../shared/states'
import { END_CARD, END_CARD_LEAD, FPS, frames, HEIGHT, WIDTH } from '../shared/video'
import TAKES from './takes.json'
import type { ThreadStarts } from './thread'
import { MARKS, ThreadView } from './ThreadView'
import { appIcon, LOOK_NAMES, LOOKS, MUSIC, ROW_LINES, takeClip, timeline, WINDOWS } from './timeline'
import type { Introduction, Look, Placed, SideBySideBeat, SoloBeat, Variant } from './timeline'

const TAKE_INFO = TAKES as Record<string, TakeInfo | undefined>

/** Terminal.app's background in the session take. */
const TERMINAL_BACKGROUND = '#1a1a1a'
const LOOK_COLORS: Record<Look, string> = { terminal: '#16241a', desktop: '#2a1f16', codex: '#161e2c' }
/** The space around each window in beat 11's wide shot, as a share of the window's width. */
const WIDE_MARGIN = 0.05

/** The launch video's cut `cut`, one of `VARIANTS`. */
export function Video({ cut }: { cut: string }) {
  const variant = cut as Variant
  useFonts()
  const placed = timeline(variant)
  const starts = Object.fromEntries(placed.filter(b => b.kind === 'thread').map(b => [b.id, b.start])) as ThreadStarts
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
            <BeatView beat={beat} previous={placed[i - 1]} variant={variant} starts={starts} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
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

/** Maps a VM screen point to pixels in a take's clip, or in a still of the same window. */
const toClip = (take: string | undefined, clipWidth: number) => toClipOf(take ? TAKE_INFO[take] : undefined, clipWidth)

/** An app's label: its icon and name. */
const label = (look: Look) => ({ name: LOOK_NAMES[look], icon: appIcon(look) })

/**
 * As beat 7 starts, the drawn thread leaves in `leaves` seconds, and the footage arrives from `from` over `arrives`
 * seconds, so the two barely overlap.
 */
const THREAD_TO_FOOTAGE = { leaves: 0.35, from: 0.25, arrives: 0.45 }

function SoloView(props: {
  beat: Placed & SoloBeat
  previous: Placed | undefined
  starts: ThreadStarts
  t: number
  hasCaptions: boolean
}) {
  const { beat, previous, starts, t, hasCaptions } = props
  const footage = beat.footage?.every(s => isCaptured(takeClip(s.take))) ? beat.footage : undefined
  const area = { x: 0, y: BAND, w: WIDTH, h: HEIGHT - BAND - CAPTION_BAND }
  const take = footage?.[0]?.take
  const clip = take ? TAKE_INFO[take] : undefined
  const clipSize = { w: clip?.width ?? WINDOWS[beat.look].width, h: clip?.height ?? WINDOWS[beat.look].height }
  const framing = framingAt(beat.camera, { x: 0, y: 0, w: clipSize.w, h: clipSize.h }, t)
  const scale = Math.min(area.w / framing.w, area.h / framing.h)
  const offset = {
    x: area.w / 2 - (framing.x + framing.w / 2) * scale,
    y: area.h / 2 - (framing.y + framing.h / 2) * scale,
  }
  const map = toClip(take, clipSize.w)
  const onScreen = (p: Point) => {
    const c = map(p)
    return { x: area.x + offset.x + c.x * scale, y: area.y + offset.y + c.y * scale }
  }
  const clicks = pointerMarks(beat.states, onScreen)
  const fromThread = previous?.kind === 'thread'
  const change = THREAD_TO_FOOTAGE
  const arriving = fromThread ? Easing.out(Easing.cubic)(clamp01((t - change.from) / change.arrives)) : 1
  const before = previous?.kind === 'solo' ? continuing(previous) : undefined
  const picture = (segments: Segment[]) => (
    <Footage
      segments={segments}
      before={before}
      length={beat.length}
      width={clipSize.w}
      height={clipSize.h}
      clip={takeClip}
    />
  )
  return (
    <AbsoluteFill>
      <div
        style={{
          opacity: arriving,
          transform: `translateY(${(1 - arriving) * -16}px)`,
        }}
      >
        <AppLabel {...label(beat.look)} left={0} width={WIDTH} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: area.x,
          top: area.y,
          width: area.w,
          height: area.h,
          overflow: 'hidden',
          opacity: arriving,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: clipSize.w,
            height: clipSize.h,
            overflow: 'hidden',
            transformOrigin: '0 0',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale * (1.03 - 0.03 * arriving)})`,
          }}
        >
          {footage ? (
            picture(footage)
          ) : (
            <Picture look={beat.look} state={stateAt(beat.states, t)} t={t} width={clipSize.w} height={clipSize.h} />
          )}
          {footage && beat.introduction && (
            <IntroduceInbox
              introduction={beat.introduction}
              picture={picture(footage)}
              t={t}
              length={beat.length}
              scale={scale}
              clipWidth={clipSize.w}
              clipHeight={clipSize.h}
            />
          )}
        </div>
      </div>
      {(!fromThread || t >= change.from + change.arrives / 2) && (
        <Pointer from={onScreen(beat.pointerFrom)} clicks={clicks} t={t} />
      )}
      {fromThread && t < change.leaves && <ThreadView starts={starts} t={beat.start + t} leaving={t / change.leaves} />}
      {hasCaptions && <Caption text={beat.caption} t={t} from={fromThread ? 0.4 : 0} to={beat.length} inBand />}
    </AbsoluteFill>
  )
}

/** Where a solo beat's last stretch of footage would continue, so the next beat can dissolve from it. */
function continuing(beat: Placed & SoloBeat): Segment | undefined {
  const last = beat.footage?.[beat.footage.length - 1]
  return last && { at: 0, take: last.take, from: last.from + beat.length - last.at }
}

/**
 * Beat 7's introduction of the inbox, drawn over the take in its clip's pixels. The pane slides in from the window's
 * right edge and is named. The question is marked in the reply, the mark moves to the question's row as it lands in
 * the inbox, and the reply dims.
 */
function IntroduceInbox(props: {
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

/** The share of its column's width each app's rows fill once beat 11 has pushed in. */
const ROWS_SHARE = 0.9
/** The space above the tabs once beat 11 has pushed in, in pixels. */
const ROWS_TOP = 36
/** How far above its window an app's label sits in beat 11's wide shot, to the label's middle, in pixels. */
const LABEL_GAP = 44
/** How long the columns that slide in take to arrive, in seconds. */
const SLIDE_IN = 0.9

/**
 * Beat 11. When it follows a recorded beat, the terminal shrinks from that beat's full frame into the left column,
 * dissolving from that beat's take to its own, and the other two columns slide in after it.
 */
function SideBySideView(props: {
  beat: SideBySideBeat
  previous: Placed | undefined
  t: number
  hasCaptions: boolean
}) {
  const { beat, previous, t, hasCaptions } = props
  const width = WIDTH / LOOKS.length
  const height = HEIGHT - BAND
  const fromSolo = previous?.kind === 'solo' ? previous : undefined
  const before = fromSolo && continuing(fromSolo)
  return (
    <AbsoluteFill>
      {LOOKS.map((look, i) => {
        const window = WINDOWS[look]
        const take = beat.takes?.[look]
        const takeStart = take === undefined ? undefined : TAKE_INFO[take]?.beatStartsAt
        const isRecorded = take !== undefined && takeStart !== undefined && isCaptured(takeClip(take))
        const startsAt = beat.pushInAt + i * beat.stagger
        const progress = interpolate(t, [startsAt, startsAt + beat.pushInLength], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.inOut(Easing.cubic),
        })
        const margin = window.width * WIDE_MARGIN
        const whole = { x: -margin, y: -margin, w: window.width + 2 * margin, h: window.height + 2 * margin }
        // Each app's rows end at the same width, with the top of its tabs at the same height, so the three line up.
        const span = window.rows.w / ROWS_SHARE
        const rows = {
          x: window.rows.x - (span - window.rows.w) / 2,
          y: window.rows.y - (ROWS_TOP * span) / width,
          w: span,
          h: (span * height) / width,
        }
        const shown = between(whole, rows, progress)
        const isShrinking = i === 0 && fromSolo !== undefined
        const shrunk = isShrinking ? easeInOut(t / beat.landAt[look]) : 1
        const boxWidth = WIDTH + (width - WIDTH) * shrunk
        const columnScale = Math.min(width / shown.w, height / shown.h)
        const columnX = width / 2 - (shown.x + shown.w / 2) * columnScale
        const columnY = height / 2 - (shown.y + shown.h / 2) * columnScale
        // The terminal starts where beat 10 left it: the whole window, above the caption band.
        const fullHeight = height - CAPTION_BAND
        const fullScale = Math.min(WIDTH / window.width, fullHeight / window.height)
        const fullX = (WIDTH - window.width * fullScale) / 2
        const fullY = (fullHeight - window.height * fullScale) / 2
        const scale = fullScale + (columnScale - fullScale) * shrunk
        const x = fullX + (columnX - fullX) * shrunk
        const y = fullY + (columnY - fullY) * shrunk
        const arrived =
          i === 0 || !fromSolo ? 1 : Easing.out(Easing.cubic)(clamp01((t - (beat.landAt[look] - SLIDE_IN)) / SLIDE_IN))
        // Beat 10's take gives way to this beat's while the terminal is moving fastest, under a brief blur, so two
        // inboxes never show at once at full size.
        const leftOver = 1 - easeInOut((t - 0.32) / 0.22)
        const swapBlur = isShrinking ? 6 * Math.sin(Math.PI * clamp01((t - 0.22) / 0.42)) : 0
        // As the end card starts, each column's rows dim, blur and sink back, left first, as its streams pull out.
        const fading = easeInOut((t - (beat.length - END_CARD_LEAD) - i * 0.12) / 0.6)
        const map = toClip(isRecorded ? take : undefined, window.width)
        const onScreen = (p: Point) => {
          const c = map(p)
          return { x: x + c.x * scale, y: y + c.y * scale }
        }
        const states = beat.states[look]
        const clicks = pointerMarks(states, onScreen)
        return (
          <div
            key={look}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: arrived * (1 - fading),
              filter: fading > 0 ? `blur(${fading * 12}px) brightness(${1 - 0.5 * fading})` : undefined,
              transformOrigin: `${(i + 0.5) * width}px ${BAND + height / 2}px`,
              // A column that slides in starts at the frame's right edge, so it never crosses the terminal as it shrinks.
              transform: `translateX(${(1 - arrived) * (WIDTH - i * width)}px) scale(${1 - 0.06 * fading})`,
            }}
          >
            <AppLabel
              {...label(look)}
              left={i * width}
              width={boxWidth}
              middle={Math.max(BAND / 2, BAND + y - LABEL_GAP)}
              opacity={1 - clamp01((t - startsAt) / (beat.pushInLength * 0.35))}
            />
            <div
              style={{ position: 'absolute', left: i * width, top: BAND, width: boxWidth, height, overflow: 'hidden' }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: window.width,
                  height: window.height,
                  transformOrigin: '0 0',
                  transform: `translate(${x}px, ${y}px) scale(${scale})`,
                  filter: swapBlur > 0.05 ? `blur(${swapBlur / scale}px)` : undefined,
                }}
              >
                {isRecorded ? (
                  <OffthreadVideo
                    src={staticFile(takeClip(take))}
                    trimBefore={frames(takeStart, FPS)}
                    muted
                    style={{ width: window.width, height: window.height, display: 'block' }}
                  />
                ) : (
                  <Picture
                    look={look}
                    state={stateAt(states, t)}
                    t={t}
                    width={window.width}
                    height={window.height}
                    inbox={window.inbox}
                  />
                )}
                {isShrinking && before && leftOver > 0 && (
                  <div style={{ position: 'absolute', inset: 0, opacity: leftOver }}>
                    <Footage
                      segments={[before]}
                      length={0.6}
                      width={window.width}
                      height={window.height}
                      clip={takeClip}
                    />
                  </div>
                )}
              </div>
              {t >= startsAt + beat.pushInLength && (
                <Pointer from={onScreen(beat.pointerFrom[look])} clicks={clicks} t={t} />
              )}
            </div>
          </div>
        )
      })}
      {hasCaptions && (
        <Caption text={beat.caption} t={t} from={beat.captionFrom} to={beat.length - END_CARD_LEAD + 0.3} />
      )}
    </AbsoluteFill>
  )
}

/** A captured still when the state has one, else a placeholder that names the app and what it shows. */
function Picture(props: {
  look: Look
  state: State | undefined
  t: number
  width: number
  height: number
  inbox?: Rect
}) {
  const { look, state, t, width, height, inbox } = props
  if (state?.still && isCaptured(state.still))
    return <Img src={staticFile(state.still)} style={{ width, height, objectFit: 'contain', display: 'block' }} />

  const label = state?.label ?? ''
  if (!inbox && state?.pane)
    return (
      <div style={{ width, height, backgroundColor: LOOK_COLORS[look], position: 'relative', display: 'flex' }}>
        <div style={{ flex: 3, padding: '120px 80px 0 120px' }}>
          <div style={{ fontSize: 32, color: '#b9b9c0' }}>{LOOK_NAMES[look]} · conversation</div>
          <div style={{ marginTop: 200, fontSize: 56, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        </div>
        <div style={{ flex: 2, padding: '120px 80px 0 64px', borderLeft: '3px solid #3a3a42' }}>
          <div style={{ fontSize: 32, color: '#b9b9c0' }}>Inbox, docked</div>
          <div style={{ marginTop: 200, fontSize: 48, fontWeight: 600, lineHeight: 1.2 }}>{state.pane}</div>
          <Drain state={state} t={t} />
        </div>
      </div>
    )

  if (!inbox)
    return (
      <div style={{ width, height, backgroundColor: LOOK_COLORS[look], position: 'relative' }}>
        <div style={{ position: 'absolute', left: 120, top: 120, fontSize: 32, color: '#b9b9c0' }}>
          {LOOK_NAMES[look]}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            top: 360,
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {label}
          {state && <Drain state={state} t={t} />}
        </div>
      </div>
    )

  return (
    <div
      style={{ width, height, backgroundColor: '#18181c', borderRadius: 24, overflow: 'hidden', position: 'relative' }}
    >
      <div
        style={{
          height: 72,
          backgroundColor: '#25252b',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 40,
          gap: 16,
          fontSize: 30,
          color: '#c9c9d0',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map(color => (
          <div key={color} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color }} />
        ))}
        <div style={{ marginLeft: 24 }}>{LOOK_NAMES[look]}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: inbox.x,
          top: inbox.y,
          width: inbox.w,
          height: inbox.h,
          backgroundColor: LOOK_COLORS[look],
          border: '3px solid #3a3a42',
          borderRadius: 16,
          padding: 40,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 28, color: '#9a9aa2', marginBottom: 24 }}>Inbox · {LOOK_NAMES[look]}</div>
        <div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        {state && <Drain state={state} t={t} />}
      </div>
    </div>
  )
}

function Drain({ state, t }: { state: State; t: number }) {
  if (!state.drain) return null

  const left = Math.max(0, state.drain.seconds - (t - state.at))
  return (
    <div style={{ marginTop: 40, fontSize: 32, fontWeight: 400, color: '#c9c9d0' }}>
      {state.drain.label} · {left.toFixed(1)} s
      <div style={{ marginTop: 12, height: 16, borderRadius: 8, backgroundColor: '#3a3a42' }}>
        <div
          style={{
            width: `${(left / state.drain.seconds) * 100}%`,
            height: '100%',
            borderRadius: 8,
            backgroundColor: '#e8e8ee',
          }}
        />
      </div>
    </div>
  )
}
