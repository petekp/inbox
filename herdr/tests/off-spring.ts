import type { Painted } from './gpui-stand-in'
import type { Box } from './layout'

/**
 * The ids of the rows in `tree` that paint a fill, as the selected row's highlight. A row's own box takes its new
 * height at once while the box around it glides, so a filled row that shrinks in one frame leaves a band without its
 * fill until the glide ends. A row that grows is clipped by that box, so its growth does not show.
 */
export function filledRows(tree: Painted): ReadonlySet<string> {
  const ids = new Set<string>()
  const walk = (n: Painted) => {
    if (n.id?.startsWith('row ') && n.style.isFilled) ids.add(n.id)
    n.kids.forEach(walk)
  }
  walk(tree)

  return ids
}

/**
 * How far the box `id` moved off its spring from `before` to `box` in one frame, or null for a box no spring moves. A
 * box or fit's spring moves its top and height, and a size or panel moves with the springs above it.
 */
export function offSpringBy(id: string, box: Box, before: Box): number | null {
  const isSprung = /^(box|fit) /.test(id)
  if (!isSprung && !/^(size|panel) /.test(id)) return null

  return Math.max(Math.abs(box.top - before.top), isSprung ? Math.abs(box.height - before.height) : 0)
}
