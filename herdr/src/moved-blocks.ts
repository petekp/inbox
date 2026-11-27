import type { Block } from './blocks'
import type { Tracks } from './tracks'

/**
 * The positions in `at` of a longest run of values that increase, not necessarily next to each other: the blocks that
 * keep their order among those drawn before.
 */
function longestRun(at: number[]): Set<number> {
  const tails: number[] = []
  const before: number[] = []
  at.forEach((value, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((at[tails[mid]!] ?? 0) < value) lo = mid + 1
      else hi = mid
    }
    before[i] = lo > 0 ? (tails[lo - 1] ?? -1) : -1
    tails[lo] = i
  })
  const run = new Set<number>()
  for (let i = tails.at(-1) ?? -1; i >= 0; i = before[i] ?? -1) run.add(i)

  return run
}

/**
 * The ids of the blocks that stay on the page and change place: of the blocks drawn before and still listed, the fewest
 * whose removal leaves the rest in the order they were drawn in. A block that only moves because a block above it came
 * or went keeps its order, so it is not one of them.
 */
export function movedOf(blocks: Block[], was: Tracks): Set<string> {
  const drawnAt = new Map(was.order.map((id, i) => [id, i]))
  const kept = blocks.filter(b => was.rows.get(b.id) !== undefined && was.rows.get(b.id)?.track.state !== 'leaving')
  const at = kept.map(b => drawnAt.get(b.id) ?? 0)
  if (at.every((x, i) => i === 0 || (at[i - 1] ?? 0) < x)) return new Set()
  const stays = longestRun(at)

  return new Set(kept.filter((_, i) => !stays.has(i)).map(b => b.id))
}
