import type { Painted } from './gpui-stand-in'
import type { Box } from './layout'

export function filledRows(tree: Painted): ReadonlySet<string> {
  const ids = new Set<string>()
  const walk = (n: Painted) => {
    if (n.id?.startsWith('row ') && n.style.isFilled) ids.add(n.id)
    n.kids.forEach(walk)
  }
  walk(tree)

  return ids
}

export function offSpringBy(id: string, box: Box, before: Box): number | null {
  const isSprung = /^(box|fit) /.test(id)
  if (!isSprung && !/^(size|panel) /.test(id)) return null

  return Math.max(Math.abs(box.top - before.top), isSprung ? Math.abs(box.height - before.height) : 0)
}
