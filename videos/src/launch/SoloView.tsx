import { AbsoluteFill, Easing } from 'remotion'
import { AppLabel } from '../shared/AppLabel'
import { Caption } from '../shared/Caption'
import { isCaptured, toClip as toClipOf } from '../shared/captures'
import type { TakeInfo } from '../shared/captures'
import { Footage } from '../shared/Footage'
import type { Segment } from '../shared/Footage'
import { clamp01, fit, framingAt } from '../shared/geometry'
import type { Point } from '../shared/geometry'
import { PICTURE } from '../shared/layout'
import { Pointer } from '../shared/Pointer'
import { pointerMarks, stateAt } from '../shared/states'
import { continuing } from '../shared/terminal-time'
import { WIDTH } from '../shared/video'
import { IntroduceInbox } from './IntroduceInbox'
import { label, Picture } from './Picture'
import TAKES from './takes.json'
import type { ThreadStarts } from './thread'
import { ThreadView } from './ThreadView'
import { takeClip, WINDOWS } from './timeline'
import type { Placed, SoloBeat } from './timeline'

export const TAKE_INFO = TAKES as Record<string, TakeInfo | undefined>

/** Maps a VM screen point to pixels in a take's clip, or in a still of the same window. */
export const toClip = (take: string | undefined, clipWidth: number) =>
  toClipOf(take ? TAKE_INFO[take] : undefined, clipWidth)

/**
 * As beat 7 starts, the drawn thread leaves in `leaves` seconds, and the footage arrives from `from` over `arrives`
 * seconds, so the two barely overlap.
 */
const THREAD_TO_FOOTAGE = { leaves: 0.35, from: 0.25, arrives: 0.45 }

export function SoloView(props: {
  beat: Placed & SoloBeat
  previous: Placed | undefined
  starts: ThreadStarts
  t: number
  hasCaptions: boolean
}) {
  const { beat, previous, starts, t, hasCaptions } = props
  const footage = beat.footage?.every(s => isCaptured(takeClip(s.take))) ? beat.footage : undefined
  const take = footage?.[0]?.take
  const clip = take ? TAKE_INFO[take] : undefined
  const clipSize = { w: clip?.width ?? WINDOWS[beat.look].width, h: clip?.height ?? WINDOWS[beat.look].height }
  const framing = framingAt(beat.camera, { x: 0, y: 0, w: clipSize.w, h: clipSize.h }, t)
  const at = fit(PICTURE, framing)
  const map = toClip(take, clipSize.w)
  const onScreen = (p: Point) => {
    const c = map(p)
    return { x: at.x + c.x * at.scale, y: at.y + c.y * at.scale }
  }
  const clicks = pointerMarks(beat.states, onScreen)
  const fromThread = previous?.kind === 'thread'
  const change = THREAD_TO_FOOTAGE
  const arriving = fromThread ? Easing.out(Easing.cubic)(clamp01((t - change.from) / change.arrives)) : 1
  const before = previous?.kind === 'solo' ? continuing(previous.footage, previous.length) : undefined
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
          left: PICTURE.x,
          top: PICTURE.y,
          width: PICTURE.w,
          height: PICTURE.h,
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
            transform: `translate(${at.x - PICTURE.x}px, ${at.y - PICTURE.y}px) scale(${at.scale * (1.03 - 0.03 * arriving)})`,
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
              scale={at.scale}
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
