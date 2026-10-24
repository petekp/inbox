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
