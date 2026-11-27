import type { Painted } from './gpui-stand-in'
import type { Box } from './layout'

type Segment = { id: string; x: number; y0: number; y1: number; runsIn: boolean; runsOn: boolean; isHidden: boolean }

const lengthIn = (length: number | string, height: number): number =>
  typeof length === 'string' && length.endsWith('%') ? (parseFloat(length) / 100) * height : Number(length)

export function segmentsOf(root: Painted, placed: Map<Painted, Box>, isHidden: (n: Painted) => boolean): Segment[] {
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
          out.push({ id, x: k.style.left ?? 0, y0: own[1], y1: own[1], runsIn: false, runsOn, isHidden: isHidden(k) })
        continue
      }
      out.push({ id, x: k.style.left ?? 0, ...shown, runsIn: (k.style.top ?? 0) === 0, runsOn, isHidden: isHidden(k) })
    }
  }
  walk(root, [-Infinity, Infinity], '')

  return out
}

export function gapsOf(segments: Segment[], end: number): { id: string; x: number; y: number }[] {
  const isMet = (s: Segment, y: number) =>
    segments.some(o => o !== s && !o.isHidden && o.x === s.x && o.y0 <= y + 0.5 && o.y1 >= y - 0.5)
  const ends = segments
    .filter(s => !s.isHidden)
    .flatMap(s => [
      ...(s.runsIn && s.y0 > 0.5 ? [{ s, y: s.y0 }] : []),
      ...(s.runsOn && s.y1 < end - 0.5 ? [{ s, y: s.y1 }] : []),
    ])

  return ends.filter(({ s, y }) => !isMet(s, y)).map(({ s, y }) => ({ id: s.id, x: s.x, y }))
}
