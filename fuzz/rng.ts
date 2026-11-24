/** A seeded random source. Every choice a case makes comes from one, so a seed and a case number replay exactly. */
export type Rng = {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
}

/** mulberry32, mixed with the case number so neighbouring cases do not share a stream. */
export function rngOf(seed: number, caseNumber = 0): Rng {
  let a = (seed ^ Math.imul(caseNumber + 1, 0x9e3779b1)) >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)]
    if (item === undefined) throw new Error('pick from an empty list')
    return item
  }

  return { next, int, pick, chance: p => next() < p }
}
