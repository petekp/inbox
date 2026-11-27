import type { Painted } from './gpui-stand-in'

const FADE_PREFIXES = [
  'box ',
  'panel ',
  'buttons ',
  'status ',
  'tall ',
  'short ',
  'form ',
  'trunk ',
  'mark ',
  'age ',
  'spent ',
  'warning ',
  'added ',
  'text field ',
  'count ',
]
export const fadesOn = (id: string | null | undefined): boolean => FADE_PREFIXES.some(prefix => id?.startsWith(prefix))

export function checkFadeIds(root: Painted) {
  const walk = (n: Painted) => {
    const isFading = n.transitions.get('opacity') !== undefined && n.style.opacity !== undefined && !n.style.isAbsolute
    if (isFading && boxOf(n) === null)
      throw new Error(
        `${n.id ?? 'an element with no id'} fades, but no prefix in FADE_PREFIXES starts its id or a box's it is in, so its fade reads as a pop`,
      )
    n.kids.forEach(walk)
  }
  walk(root)
}

export function boxOf(n: Painted): string | null {
  for (let up: Painted | null = n; up; up = up.parent) if (fadesOn(up.id)) return up.id ?? null
  return null
}
