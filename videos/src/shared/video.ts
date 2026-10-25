/**
 * What scripts/check.mjs and Root.tsx read from each video's timeline. A video has one or more cuts, and each cut is
 * one Remotion composition with its own size, such as a 16:9 master and a 9:16 cut of the same story.
 */
export type VideoSpec = { id: string; cuts: Cut[] }

export type Cut = {
  /** The composition's id, which names its render in out/. */
  id: string
  width: number
  height: number
  fps: number
  frames: number
  /** The captions on screen, in seconds into the cut, checked against the caption rules. Empty when it has none. */
  captions: CaptionSpan[]
  /** Moments a render's check captures as stills, in seconds into the cut. */
  marks: { at: number; name: string }[]
  /** Captured stills the cut draws, in public/, so the check can name the missing ones. */
  stills: string[]
  /** Lines the check prints for this cut, such as states a beat cuts off. */
  notes: string[]
}

/** A caption and when it is on screen, in seconds into the cut. `label` names its beat in the check's report. */
export type CaptionSpan = { label: string; text: string; from: number; to: number }

/** The 16:9 master's size and frame rate, which every video's cuts use so far. */
export const WIDTH = 1920
export const HEIGHT = 1080
export const FPS = 60

/** `seconds` as a whole number of frames at `fps`. */
export const frames = (seconds: number, fps: number) => Math.round(seconds * fps)

/** Each beat with where it starts, in seconds: each one after the one before, from 0. */
export function place<B extends { length: number }>(beats: B[]): (B & { start: number })[] {
  let start = 0
  return beats.map(beat => {
    const placed = { ...beat, start }
    start += beat.length
    return placed
  })
}

/** The frames from the first beat's start to the last beat's end. */
export function totalFrames(placed: { start: number; length: number }[], fps: number): number {
  const last = placed[placed.length - 1]
  return last ? frames(last.start + last.length, fps) : 0
}

/** How long the end card starts before its beat, over the last moments of the beat before it, in seconds. */
export const END_CARD_LEAD = 0.8
/** The end card's word and the address under it. */
export const END_CARD = { word: 'inbox', repo: 'github.com/petekp/inbox', lead: END_CARD_LEAD }

/** A still at each caption's first moment, once its words have risen in, and at its last frame. */
export function captionMarks(captions: CaptionSpan[], fps: number): Cut['marks'] {
  return captions.flatMap(c => {
    const beat = c.label.replace('beat ', 'b')
    return [
      { at: c.from + 0.6, name: `${beat}-caption-first` },
      { at: c.to - 1 / fps, name: `${beat}-caption-last` },
    ]
  })
}
