import type { Step } from './frames'

export const fetchedIn = (steps: Step[], fetchedAt: ReadonlyMap<number, ReadonlySet<string>>): ReadonlySet<string> =>
  new Set(steps.flatMap(([at]) => [...(fetchedAt.get(at) ?? [])]))
