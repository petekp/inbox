import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile } from 'remotion'
import { AppLabel } from '../shared/AppLabel'
import { Caption } from '../shared/Caption'
import { isCaptured } from '../shared/captures'
import { Footage } from '../shared/Footage'
import { between, clamp01, easeInOut, fit } from '../shared/geometry'
import type { Point } from '../shared/geometry'
import { BAND, PICTURE } from '../shared/layout'
import { Pointer } from '../shared/Pointer'
import { pointerMarks, stateAt } from '../shared/states'
import { continuing } from '../shared/terminal-time'
import { END_CARD_LEAD, FPS, frames, HEIGHT, WIDTH } from '../shared/video'
import { label, Picture } from './Picture'
import { TAKE_INFO, toClip } from './SoloView'
import { LOOKS, takeClip, WINDOWS } from './timeline'
import type { Placed, SideBySideBeat } from './timeline'

/** The space around each window in beat 11's wide shot, as a share of the window's width. */
const WIDE_MARGIN = 0.05

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
export function SideBySideView(props: {
  beat: SideBySideBeat
  previous: Placed | undefined
  t: number
  hasCaptions: boolean
}) {
  const { beat, previous, t, hasCaptions } = props
  const width = WIDTH / LOOKS.length
  const height = HEIGHT - BAND
  const fromSolo = previous?.kind === 'solo' ? previous : undefined
  const before = fromSolo && continuing(fromSolo.footage, fromSolo.length)
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
        const column = fit({ x: 0, y: 0, w: width, h: height }, shown)
        // The terminal starts where beat 10 left it: the whole window, in the picture above the caption band.
        const full = fit({ x: 0, y: 0, w: PICTURE.w, h: PICTURE.h }, { x: 0, y: 0, w: window.width, h: window.height })
        const scale = full.scale + (column.scale - full.scale) * shrunk
        const x = full.x + (column.x - full.x) * shrunk
        const y = full.y + (column.y - full.y) * shrunk
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
