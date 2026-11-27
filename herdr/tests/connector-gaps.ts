import type { Painted } from './gpui-stand-in'
import type { Box } from './layout'

/** How a stroke is hidden: faded out after it showed, hidden since its first draw, or not at all. */
export type Hidden = 'faded' | 'unopened' | null

type Segment = { id: string; x: number; y0: number; y1: number; runsIn: boolean; runsOn: boolean; hidden: Hidden }

/** Where a column breaks, and the hidden box it runs into there, if any. */
export type Gap = { id: string; x: number; y: number; into: string | null }

const lengthIn = (length: number | string, height: number): number =>
  typeof length === 'string' && length.endsWith('%') ? (parseFloat(length) / 100) * height : Number(length)

export function segmentsOf(root: Painted, placed: Map<Painted, Box>, hiddenAs: (n: Painted) => Hidden): Segment[] {
  const out: Segment[] = []
  const walk = (n: Painted, clip: [number, number], id: string) => {
    const box = placed.get(n)
    if (!box) return
    const own: [number, number] = n.style.isClipped
      ? [Math.max(clip[0], box.top), Math.min(clip[1], box.top + box.height)]
      : clip
    for (const k of n.kids) {
      if (!k.style.isAbsolute) {
        walk(k, own, k.id ?? id)
        continue
      }
      if (k.style.w !== 1) continue
      const y0 = box.top + lengthIn(k.style.top ?? 0, box.height)
      const runsOn = k.style.h === undefined
      const y1 = runsOn
        ? box.top + box.height - lengthIn(k.style.bottom ?? 0, box.height)
        : y0 + lengthIn(k.style.h ?? 0, box.height)
      const shown = { y0: Math.max(y0, own[0]), y1: Math.min(y1, own[1]) }
      if (shown.y1 < shown.y0) {
        const isBelowClip = y0 > own[1] && Number.isFinite(own[1])
        if (isBelowClip)
          out.push({ id, x: k.style.left ?? 0, y0: own[1], y1: own[1], runsIn: false, runsOn, hidden: hiddenAs(k) })
        continue
      }
      out.push({ id, x: k.style.left ?? 0, ...shown, runsIn: (k.style.top ?? 0) === 0, runsOn, hidden: hiddenAs(k) })
    }
  }
  walk(root, [-Infinity, Infinity], '')

  return out
}

function hiddenBoxOf(s: Segment): string {
  if (s.id.includes('~from ')) return `a faded-out copy (${s.id})`

  return s.hidden === 'unopened' ? `a box that has not opened (${s.id})` : `a faded-out box (${s.id})`
}

export function gapsOf(segments: Segment[], end: number): Gap[] {
  const covers = (o: Segment, s: Segment, y: number) => o.x === s.x && o.y0 <= y + 0.5 && o.y1 >= y - 0.5
  const isMet = (s: Segment, y: number) => segments.some(o => o !== s && !o.hidden && covers(o, s, y))
  const into = (s: Segment, y: number, by: 1 | -1): string | null => {
    const reach = (o: Segment) => (by === 1 ? o.y1 - y : y - o.y0)
    const hidden = segments.filter(o => o.hidden && covers(o, s, y)).sort((a, b) => reach(b) - reach(a))

    return hidden[0] ? hiddenBoxOf(hidden[0]) : null
  }
  const ends = segments
    .filter(s => !s.hidden)
    .flatMap(s => [
      ...(s.runsIn && s.y0 > 0.5 ? [{ s, y: s.y0, by: -1 as const }] : []),
      ...(s.runsOn && s.y1 < end - 0.5 ? [{ s, y: s.y1, by: 1 as const }] : []),
    ])

  return ends.filter(({ s, y }) => !isMet(s, y)).map(({ s, y, by }) => ({ id: s.id, x: s.x, y, into: into(s, y, by) }))
}
