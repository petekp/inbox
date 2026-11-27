import type { Step } from './frames'

/**
 * The blocks a read changed in `steps`, the steps one frame draws, from `fetchedAt`, the blocks a read changed in each
 * draw, by its time. Herdr draws once a frame, so a read and the person's move that land in one frame draw together,
 * and what the read changed moves as a publish does.
 */
export const fetchedIn = (steps: Step[], fetchedAt: ReadonlyMap<number, ReadonlySet<string>>): ReadonlySet<string> =>
  new Set(steps.flatMap(([at]) => [...(fetchedAt.get(at) ?? [])]))
