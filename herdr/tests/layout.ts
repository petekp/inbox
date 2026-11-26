import type { Painted } from './gpui-stand-in'

const WRAP_AT = 40

export type Box = { top: number; height: number }

export const linesOf = (n: Painted): number =>
  n.style.isTruncated ? 1 : Math.max(1, Math.ceil((n.text ?? '').length / WRAP_AT))

export function layout(root: Painted, shown: (id: string) => number | undefined, line = 0) {
  const boxes = new Map<string, Box>()
  const placed = new Map<Painted, Box>()
  const sized: { node: Painted; height: number }[] = []
  const floating: { node: Painted; height: number }[] = []
  const fits: { id: string | null; height: number; content: number }[] = []
  const place = (n: Painted, top: number, line: number): number => {
    const lh = n.style.line ?? line
    const pt = n.style.pt ?? 0
    const flow = n.kids.filter(k => !k.style.isAbsolute)
    for (const k of n.kids)
      if (k.style.isAbsolute && k.onSize && k.text !== null)
        floating.push({ node: k, height: (k.style.line ?? lh) * linesOf(k) })
    let content = 0
    if (flow.length === 0 && (n.text !== null || n.field !== null)) content = lh * linesOf(n)
    else if (n.flow === 'row')
      for (const k of flow) content = Math.max(content, (k.style.mt ?? 0) + place(k, top + pt + (k.style.mt ?? 0), lh))
    else {
      let y = top + pt
      flow.forEach((k, i) => {
        y += (i > 0 ? (n.style.gap ?? 0) : 0) + (k.style.mt ?? 0)
        y += place(k, y, lh) + (k.style.mb ?? 0)
      })
      content = y - top - pt
    }
    const sprung = n.id !== null && n.springs.has('height') ? shown(n.id) : undefined
    const natural = pt + content + (n.style.pb ?? 0)
    const height = sprung ?? n.style.h ?? Math.min(natural, n.style.maxH ?? Infinity)
    const isSet = sprung !== undefined || n.style.h !== undefined || n.style.maxH !== undefined
    if (n.style.isClipped && isSet) fits.push({ id: n.id, height, content: natural })
    sized.push({ node: n, height })
    placed.set(n, { top, height })
    if (n.id !== null) boxes.set(n.id, { top, height })

    return height
  }
  place(root, 0, line)

  return { boxes, sized, floating, placed, fits }
}
