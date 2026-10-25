import type { Segment } from './Footage'

/** A stretch of a terminal take, played at `rate` times real speed, 1 when left out, such as 0.4 to slow typing. */
export type TerminalSegment = Segment & { rate?: number }

/** The take's time shown `t` seconds into the beat, while the segment plays. */
export const takeTimeIn = (s: TerminalSegment, t: number) => s.from + (t - s.at) * (s.rate ?? 1)

/** The second of the beat when the segment shows take time `takeTime`. */
export const beatTimeOf = (s: TerminalSegment, takeTime: number) => s.at + (takeTime - s.from) / (s.rate ?? 1)

/** Whether a segment carries on from where the one before it had reached, as a change of speed does, with no cut. */
export const continues = (before: TerminalSegment, s: TerminalSegment) =>
  Math.abs(takeTimeIn(before, s.at) - s.from) < 0.02

/** Where a beat's last stretch of take would carry on from the next beat's start, so that beat can dissolve from it. */
export function continuing<S extends TerminalSegment>(footage: S[] | undefined, length: number): S | undefined {
  const last = footage?.[footage.length - 1]
  return last && { ...last, at: 0, from: takeTimeIn(last, length) }
}
